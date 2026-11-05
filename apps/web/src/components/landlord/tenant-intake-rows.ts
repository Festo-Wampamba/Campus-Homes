import type { ImportedTenantRow, University } from '@campushomes/shared';
import type { WalkInBed } from '@/app/(landlord)/landlord/bookings/room-lookup';

export type TenantIntakeRow = {
  key: string; kind: 'new' | 'existing'; firstName: string; lastName: string;
  gender: 'male' | 'female' | ''; phone: string; email: string; contact: string;
  university: University; bedId: string; movedIn: boolean; paid: string; paymentMethod: string;
  importWarnings?: string[];
  documentRowNumber?: number;
};
export const studentName = (row: Pick<TenantIntakeRow,'firstName'|'lastName'>) => `${row.firstName.trim()} ${row.lastName.trim()}`.trim();
export function emptyTenantRow(bedId=''):TenantIntakeRow {
  return {key:crypto.randomUUID(),kind:'new',firstName:'',lastName:'',gender:'',phone:'',email:'',contact:'',university:'MUK',bedId,movedIn:false,paid:'',paymentMethod:''};
}
const normalize=(value:string)=>value.trim().replace(/\s+/g,' ').toLowerCase();
const universities:Record<string,University>={'muk':'MUK','makerere university':'MUK','mubs':'MUBS','makerere university business school':'MUBS','kiu':'KIU','kampala international university':'KIU','kyu':'KYU','kyambogo university':'KYU','other':'other'};
const methods:Record<string,string>={cash:'cash',mtn:'mtn_momo','mtn momo':'mtn_momo','mtn_momo':'mtn_momo',airtel:'airtel_money','airtel money':'airtel_money',airtel_money:'airtel_money',card:'card','bank transfer':'bank_transfer',bank_transfer:'bank_transfer'};
export function importedTenantRows(records:ImportedTenantRow[],beds:WalkInBed[],usedBeds:string[]):TenantIntakeRow[]{
  const used=new Set(usedBeds);
  return records.map((record)=>{
    const candidates=record.roomLabel?beds.filter((bed)=>!used.has(bed.id)&&normalize(bed.roomLabel)===normalize(record.roomLabel)&&(!record.propertyName||normalize(bed.propertyName)===normalize(record.propertyName))&&(!record.bedLabel||normalize(bed.bedLabel)===normalize(record.bedLabel))):[];
    const selected=candidates.length===1?candidates[0]:undefined;
    if(selected)used.add(selected.id);
    const warnings=[...record.warnings];
    if(!selected)warnings.push('Choose a free bed: the document room/bed is missing, unavailable or ambiguous.');
    if(selected&&record.rent&&Number(record.rent)!==selected.pricePerTermUgx)warnings.push('The document rent differs from this room’s rent. Check the room and money before saving.');
    if(record.university&&!universities[normalize(record.university)])warnings.push('University was not recognized. Select the correct one.');
    if(record.paymentMethod&&!methods[normalize(record.paymentMethod)])warnings.push('Payment method was not recognized. Select it in the form.');
    return {...emptyTenantRow(),documentRowNumber:record.rowNumber,kind:record.kind,firstName:record.firstName,lastName:record.lastName,gender:record.gender,phone:record.phone,email:record.email,
      contact:record.email||record.phone,university:universities[normalize(record.university)]??'MUK',bedId:selected?.id??'',movedIn:record.movedIn,paid:record.amountPaid,
      paymentMethod:methods[normalize(record.paymentMethod)]??'',importWarnings:warnings};
  });
}
