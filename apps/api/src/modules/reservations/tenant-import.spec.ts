import { existsSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun } from 'docx';
import PDFDocument from 'pdfkit';
import { parseTenantFile, tenantImportTemplate, tenantRowsFromCells, TENANT_HEADERS, extractTenantPdf } from './tenant-import';

const csv=(text:string)=>Buffer.from(text,'utf8');
it('imports CSV names, pasted gender, quoted money and phone text without saving anything',async()=>{
  const rows=await parseTenantFile(csv('First name,Last name,Gender,Phone,Amount paid (UGX),Room\nAmina,Nakato,F,0771234567,"UGX 300,000",A13\n'),'csv');
  expect(rows[0]).toMatchObject({firstName:'Amina',lastName:'Nakato',gender:'female',phone:'0771234567',amountPaid:'300000',roomLabel:'A13'});
});
it('preserves malformed payment text for correction and never guesses gender',async()=>{
  const rows=await parseTenantFile(csv('First name,Last name,Gender,Amount paid\nKato,Mugisha,Unknown,300k\n'),'csv');
  expect(rows[0]).toMatchObject({amountPaid:'300k',gender:''});
  expect(rows[0]?.warnings.join(' ')).toMatch(/Gender.*money/i);
});
it('computes a missing paid amount only from explicit rent and balance, with a review note',()=>{
  const rows=tenantRowsFromCells([['Full name','Rent','Balance'],['Mirembe Nakato','800,000','500,000']]);
  expect(rows[0]).toMatchObject({firstName:'Mirembe',lastName:'Nakato',amountPaid:'300000'});
  expect(rows[0]?.warnings.join(' ')).toMatch(/split.*calculated/);
});
it('the Excel template has a gender dropdown and round-trips values pasted into it',async()=>{
  const template=await tenantImportTemplate('xlsx');const book=new ExcelJS.Workbook();await book.xlsx.load(template.buffer as unknown as ArrayBuffer);
  const sheet=book.getWorksheet('Tenants')!;
  expect(sheet.getCell('C2').dataValidation).toMatchObject({type:'list',formulae:['"Male,Female"'],showErrorMessage:true});
  expect(sheet.getCell('C51').dataValidation.type).toBe('list');
  sheet.getRow(2).values=['Amina','Nakato','Female','New','0771234567','amina@example.test','MUK','Festo courts','A13','Bed 1',300000,'cash','Yes'];
  const rows=await parseTenantFile(Buffer.from(await book.xlsx.writeBuffer()),'xlsx');
  expect(rows[0]).toMatchObject({firstName:'Amina',gender:'female',movedIn:true,amountPaid:'300000',kind:'new'});
});
it('does not treat spreadsheet formulas as tenant values',async()=>{
  const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Tenants');sheet.addRow(['First name','Last name','Amount paid']);sheet.addRow(['Amina','Nakato',{formula:'100000+200000',result:300000}]);
  const rows=await parseTenantFile(Buffer.from(await book.xlsx.writeBuffer()),'xlsx');
  expect(rows[0]?.amountPaid).toBe('[formula]');expect(rows[0]?.warnings.join(' ')).toContain('formula');
});
it('imports actual Word table cells and preserves styled name fragments',async()=>{
  const data=[['First name','Last name','Gender','Amount paid'],['Amina','Nakato','Female','300000']];
  const table=new Table({rows:data.map((cells,index)=>new TableRow({children:cells.map((text,col)=>new TableCell({children:[new Paragraph({children:index===1&&col===1?[new TextRun({text:'Naka',bold:true}),new TextRun('to')]:[new TextRun(text)]})]}))}))});
  const file=await Packer.toBuffer(new Document({sections:[{children:[table]}]}));
  expect((await parseTenantFile(file,'docx'))[0]).toMatchObject({firstName:'Amina',lastName:'Nakato',gender:'female',amountPaid:'300000'});
});
(existsSync('/usr/bin/pdftotext') ? it : it.skip)('reads a real PDF text table with the installed Poppler adapter',async()=>{
  const doc=new PDFDocument({margin:30});const buffers:Buffer[]=[];const ready=new Promise<Buffer>((resolve)=>{doc.on('data',(part:Buffer)=>buffers.push(part));doc.on('end',()=>resolve(Buffer.concat(buffers)));});
  doc.font('Courier').fontSize(10).text('First name     Last name      Gender    Amount paid\nAmina          Nakato         Female    300000');doc.end();
  const file=await ready;
  const cells=await extractTenantPdf(file);
  expect(tenantRowsFromCells(cells)[0]).toMatchObject({firstName:'Amina',lastName:'Nakato',gender:'female',amountPaid:'300000'});
});
it('rejects empty, unsupported, oversized and excessive records instead of dropping rows',async()=>{
  await expect(parseTenantFile(Buffer.alloc(0),'csv')).rejects.toThrow(/non-empty/);
  await expect(parseTenantFile(Buffer.alloc(2*1024*1024+1),'csv')).rejects.toThrow(/2 MB/);
  await expect(parseTenantFile(csv('data'),'doc')).rejects.toThrow(/docx/);
  await expect(parseTenantFile(csv('not a PDF'),'pdf')).rejects.toThrow(/not a PDF/);
  await expect(parseTenantFile(csv('First name,Last name\n'+Array.from({length:51},()=> 'Amina,Nakato').join('\n')),'csv')).rejects.toThrow(/50/);
});
it('makes a CSV template containing exactly the supported headers',async()=>{
  const file=await tenantImportTemplate('csv');expect(file.buffer.toString('utf8').replace(/^\uFEFF/,'').trim()).toBe(TENANT_HEADERS.join(','));
});
