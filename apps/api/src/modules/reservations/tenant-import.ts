import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { promisify } from 'node:util';
import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import mammoth from 'mammoth';
import type { ImportedTenantRow } from '@campushomes/shared';

const run = promisify(execFile);
export const MAX_TENANT_IMPORT_BYTES = 2 * 1024 * 1024;
export const TENANT_HEADERS = ['First name','Last name','Gender','Account type','Phone','Email','University','Property','Room','Bed','Amount paid (UGX)','Paid with','Already moved in'];
const aliases = {
  firstName: ['first name','firstname','given name','given names'],
  lastName: ['last name','lastname','surname','family name'],
  name: ['name','full name','student name','tenant name'],
  gender: ['gender','sex'], kind: ['account type','account','campushomes account'],
  phone: ['phone','phone number','telephone','mobile','mobile number','contact'], email: ['email','email address'],
  university: ['university','campus'], propertyName: ['property','property name','hostel','hostel name'],
  roomLabel: ['room','room code','room number','room no'], bedLabel: ['bed','bed label','bed number'],
  amountPaid: ['amount paid ugx','amount paid','paid','paid ugx','money paid','payment'],
  rent: ['rent','rent ugx','total','total rent','semester rent','total ugx'], balance: ['balance','balance ugx','outstanding','amount owed'],
  paymentMethod: ['paid with','payment method','method'], movedIn: ['already moved in','moved in','occupied','living here'],
};
const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const knownHeader = (text: string) => Object.values(aliases).some((values) => (values as readonly string[]).includes(normalize(text)));

/** Check ZIP directory sizes BEFORE spreadsheet/Word libraries expand it.
 * Neither macros nor formulas are executed; external Word resources stay off. */
function checkArchive(file: Buffer, required: string) {
  let end = -1;
  for (let i=file.length-22;i>=Math.max(0,file.length-65557);i--) if(file.readUInt32LE(i)===0x06054b50){end=i;break;}
  if(end<0) throw new BadRequestException('Invalid document archive. Save it again as .xlsx or .docx.');
  const count=file.readUInt16LE(end+10);let offset=file.readUInt32LE(end+16), expanded=0, found=false;
  if(count>2000) throw new BadRequestException('This document is too complex. Copy the tenant table into the template.');
  for(let i=0;i<count;i++){
    if(offset+46>file.length || file.readUInt32LE(offset)!==0x02014b50) throw new BadRequestException('Invalid document archive');
    expanded+=file.readUInt32LE(offset+24);
    const size=file.readUInt16LE(offset+28), extra=file.readUInt16LE(offset+30), comment=file.readUInt16LE(offset+32);
    const name=file.subarray(offset+46,offset+46+size).toString('utf8');
    if(name===required)found=true;
    if(expanded>20*1024*1024) throw new BadRequestException('The expanded document is too large. Copy only the tenant table into the template.');
    offset+=46+size+extra+comment;
  }
  if(!found) throw new BadRequestException('The document does not match the selected file format. Use .xlsx, .csv, .docx or PDF.');
}

function money(value: string): string | null {
  const raw=value.replace(/^(ugx|ush|shs)\s*/i,'').trim();
  if(!raw)return '';
  if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.00)?$/.test(raw))return null;
  const n=Number(raw.replace(/,/g,''));
  return Number.isSafeInteger(n)&&n<=2147483647 ? String(n) : null;
}

export function tenantRowsFromCells(rows: string[][]): ImportedTenantRow[] {
  const headerIndex=rows.findIndex((cells)=>{
    const names=cells.map(normalize);
    return ((names.some((v)=>aliases.firstName.includes(v)) && names.some((v)=>aliases.lastName.includes(v))) || names.some((v)=>aliases.name.includes(v))) && cells.filter(knownHeader).length>=2;
  });
  if(headerIndex<0) throw new BadRequestException('No tenant table found. Include First name and Last name (or Full name) headers, then use the template columns.');
  const header=rows[headerIndex]!;
  const columns=Object.fromEntries(Object.entries(aliases).map(([key,values])=>[key,header.findIndex((cell)=>(values as readonly string[]).includes(normalize(cell)))])) as Record<keyof typeof aliases,number>;
  const cell=(values:string[],key:keyof typeof aliases)=>columns[key]>=0?(values[columns[key]]??'').trim():'';
  const result: ImportedTenantRow[]=[];
  for(let index=headerIndex+1;index<rows.length;index++){
    const values=rows[index]!;
    if(!values.some((value)=>value.trim()) || values.filter(knownHeader).length>=2)continue;
    const original=cell(values,'name'), first=cell(values,'firstName'), last=cell(values,'lastName');
    if(!original&&!first&&!last)continue;
    if(!last&&/^(grand total|sub ?total|total|page\s+\d+)$/i.test(original||first))continue;
    const warnings:string[]=[];
    let firstName=first,lastName=last;
    if(!first&&!last&&original){const parts=original.trim().split(/\s+/);firstName=parts.shift()??'';lastName=parts.join(' ');warnings.push('Full name was split. Check the first and last names.');}
    const genderRaw=normalize(cell(values,'gender'));
    const gender=['male','m','man'].includes(genderRaw)?'male':['female','f','woman'].includes(genderRaw)?'female':'';
    if(genderRaw&&!gender)warnings.push('Gender was not recognized. Select it in the form.');
    const rawKind=normalize(cell(values,'kind'));
    const kind=['existing','existing student','existing campushomes student'].includes(rawKind)?'existing':'new';
    if(rawKind&&!['new','new student','new campushomes student','existing','existing student','existing campushomes student'].includes(rawKind))warnings.push('Account type was not recognized. Check whether this student already has a CampusHomes account.');
    const paid=money(cell(values,'amountPaid')),rent=money(cell(values,'rent')),balance=money(cell(values,'balance'));
    let amountPaid=paid??cell(values,'amountPaid');
    if([paid,rent,balance].includes(null))warnings.push('A money value is invalid. Enter whole UGX amounts in the form.');
    if(!cell(values,'amountPaid')&&rent&&balance!==null&&balance!==''&&Number(balance)<=Number(rent)){
      amountPaid=String(Number(rent)-Number(balance));warnings.push('Amount paid was calculated from rent minus balance. Check it before saving.');
    }
    if(paid&&rent&&balance&&Number(rent)-Number(paid)!==Number(balance))warnings.push('Rent, paid and balance do not agree. Check the amounts.');
    if(values.some((value)=>value==='[formula]'))warnings.push('A formula was skipped. Paste its value into the form.');
    if(!firstName||!lastName)warnings.push('Complete the first and last names.');
    result.push({rowNumber:index+1,firstName,lastName,gender,kind,phone:cell(values,'phone'),email:cell(values,'email'),university:cell(values,'university'),propertyName:cell(values,'propertyName'),roomLabel:cell(values,'roomLabel'),bedLabel:cell(values,'bedLabel'),amountPaid,rent:rent??'',balance:balance??'',paymentMethod:cell(values,'paymentMethod'),movedIn:['yes','true','1','occupied'].includes(normalize(cell(values,'movedIn'))),warnings});
    if(result.length>50)throw new BadRequestException('Import up to 50 students at a time. Split the records into smaller files.');
  }
  if(!result.length)throw new BadRequestException('The table has no tenant rows. Add the records below the headers.');
  return result;
}

const plain=(html:string)=>html.replace(/<br\s*\/?>|<\/p>/gi,' ').replace(/<[^>]*>/g,'').replace(/&#(x[0-9a-f]+|\d+);/gi,(_all,code:string)=>{
  const value=code[0]?.toLowerCase()==='x'?parseInt(code.slice(1),16):Number(code);return value>0&&value<=0x10ffff?String.fromCodePoint(value):'';
}).replace(/&(amp|lt|gt|quot|apos|nbsp);/g,(_all,key:string)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '}[key]??'')).replace(/\s+/g,' ').trim();

export async function extractTenantPdf(file:Buffer):Promise<string[][]>{
  const folder=await mkdtemp(join(tmpdir(),'campushomes-tenants-'));
  try{
    const path=join(folder,'records.pdf');await writeFile(path,file,{mode:0o600});
    const options={timeout:5000,maxBuffer:1024*1024};
    const info=await run('pdfinfo',[path],options);
    const pages=Number(info.stdout.match(/^Pages:\s+(\d+)/m)?.[1]);
    if(!pages||pages>20)throw new BadRequestException('Use a PDF of up to 20 pages, or copy the records into the Excel/CSV template.');
    const {stdout}=await run('pdftotext',['-layout','-nopgbrk',path,'-'],options);
    if(!stdout.trim())throw new BadRequestException('This PDF has no selectable text. Convert the scan to text, or copy the records into the template.');
    const lines=stdout.split(/\r?\n/).filter((line)=>line.trim());
    const header=lines.find((line)=>{const cells=line.trim().split(/\s{2,}|\t/).map(normalize);return cells.some((cell)=>aliases.name.includes(cell))||(cells.some((cell)=>aliases.firstName.includes(cell))&&cells.some((cell)=>aliases.lastName.includes(cell)));});
    if(!header)throw new BadRequestException('No readable PDF table found. Use labeled table columns or copy the records into the template.');
    const starts=[...header.matchAll(/\S(?:.*?\S)?(?=\s{2,}|$)/g)].map((match)=>match.index!);
    return lines.map((line)=>starts.map((start,i)=>line.slice(start,starts[i+1]).trim()));
  }finally{await rm(folder,{recursive:true,force:true});}
}

export async function parseTenantFile(file:Buffer,format:string):Promise<ImportedTenantRow[]>{
  if(!Buffer.isBuffer(file)||!file.length)throw new BadRequestException('Choose a non-empty file.');
  if(file.length>MAX_TENANT_IMPORT_BYTES)throw new BadRequestException('Files must be 2 MB or less.');
  try{
    if(format==='pdf'){
      if(file.subarray(0,5).toString()!=='%PDF-')throw new BadRequestException('This is not a PDF file.');
      return tenantRowsFromCells(await extractTenantPdf(file));
    }
    if(format==='docx'){
      checkArchive(file,'word/document.xml');
      const {value}=await mammoth.convertToHtml({buffer:file},{externalFileAccess:false,convertImage:mammoth.images.imgElement(async()=>({src:''}))});
      const rows=[...value.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((match)=>[...match[1]!.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell)=>plain(cell[1]!)));
      if(!rows.length)throw new BadRequestException('Put the Word records in a table with labeled columns, or copy them into the template.');
      return tenantRowsFromCells(rows);
    }
    if(format!=='xlsx'&&format!=='csv')throw new BadRequestException('Choose Excel (.xlsx), CSV, PDF or Word (.docx).');
    const workbook=new ExcelJS.Workbook();
    if(format==='xlsx'){checkArchive(file,'xl/workbook.xml');await workbook.xlsx.load(file as unknown as ArrayBuffer);}
    else{
      const text=new TextDecoder('utf-8',{fatal:true}).decode(file);
      await workbook.csv.read(Readable.from([text]),{map:(value:string)=>value,parserOptions:{delimiter:text.split(/\r?\n/)[0]?.includes('\t')?'\t':','}});
    }
    const sheet=workbook.worksheets[0];if(!sheet)throw new BadRequestException('The file has no worksheet.');
    if(sheet.rowCount>1000||sheet.columnCount>50)throw new BadRequestException('Copy only the tenant table into the template.');
    const rows:string[][]=[];
    sheet.eachRow({includeEmpty:true},(row)=>{const values:string[]=[];row.eachCell({includeEmpty:true},(cell,col)=>{values[col-1]=cell.type===ExcelJS.ValueType.Formula?'[formula]':cell.text;});rows.push(values);});
    return tenantRowsFromCells(rows);
  }catch(error){
    if(error instanceof BadRequestException)throw error;
    throw new BadRequestException('Could not read this file. Use an unprotected .xlsx, CSV, PDF text table or .docx table.');
  }
}

export async function tenantImportTemplate(format:'xlsx'|'csv'){
  if(format==='csv')return {buffer:Buffer.from('\uFEFF'+TENANT_HEADERS.join(',')+'\r\n','utf8'),mimeType:'text/csv; charset=utf-8',fileName:'campushomes-tenants-template.csv'};
  const book=new ExcelJS.Workbook();const sheet=book.addWorksheet('Tenants');sheet.addRow(TENANT_HEADERS).font={bold:true};
  sheet.views=[{state:'frozen',ySplit:1}];sheet.autoFilter='A1:M51';
  sheet.columns.forEach((column)=>{column.width=22;column.numFmt='@';});
  const lists:Record<string,string>={C:'Male,Female',D:'New,Existing',G:'MUK,MUBS,KIU,KYU,other',L:'cash,mtn_momo,airtel_money,bank_transfer,card',M:'Yes,No'};
  for(let row=2;row<=51;row++)for(const [col,values]of Object.entries(lists))sheet.getCell(`${col}${row}`).dataValidation={type:'list',allowBlank:true,formulae:[`"${values}"`],showErrorMessage:true,errorStyle:'stop',errorTitle:'Choose an option',error:'Select one of the listed options. Pasted values are checked during import.'};
  const instructions=book.addWorksheet('Instructions');
  ['Fill the Tenants worksheet, one student per row. Up to 50 rows per import.','First name and Last name stay separate in this template. Use the Gender dropdown; unknown gender may remain blank.','New means no CampusHomes account. Existing means a CampusHomes account already exists; the student accepts a room request before booking.','Phone numbers should retain their leading 0 or +256. Existing students need their verified account phone or email.','Room is the physical room code; Bed and Property help match the correct free bed. Missing or ambiguous beds must be chosen in the review form.','Amount paid is whole UGX. Rent comes from the chosen room, and the app calculates the balance.','Review extracted names, gender, room and money before pressing Save. Uploading does not create accounts or bookings.','Excel dropdowns may be bypassed by pasting. The importer checks the pasted values and marks corrections.'].forEach((line)=>instructions.addRow([line]));instructions.getColumn(1).width=115;
  return {buffer:Buffer.from(await book.xlsx.writeBuffer()),mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',fileName:'campushomes-tenants-template.xlsx'};
}
