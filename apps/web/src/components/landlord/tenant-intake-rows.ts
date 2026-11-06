import type { ImportedTenantRow, University } from '@campushomes/shared';
import type { WalkInBed } from '@/app/(landlord)/landlord/bookings/room-lookup';

export type TenantIntakeRow = {
  key: string; kind: 'record' | 'new' | 'existing'; firstName: string; lastName: string;
  gender: 'male' | 'female' | ''; phone: string; email: string; contact: string;
  university: University; bedId: string; movedIn: boolean; paid: string; paymentMethod: string;
  emergencyContactName?: string; emergencyContactPhone?: string;
  importWarnings?: string[];
  documentRowNumber?: number;
  importLocation?: Pick<ImportedTenantRow, "propertyName" | "roomLabel" | "bedLabel">;
  assignmentNote?: string;
  assignmentProblem?: string;
};
export const studentName = (row: Pick<TenantIntakeRow,'firstName'|'lastName'>) => `${row.firstName.trim()} ${row.lastName.trim()}`.trim();
export function emptyTenantRow(bedId=''):TenantIntakeRow {
  return {key:crypto.randomUUID(),kind:'record',firstName:'',lastName:'',gender:'',phone:'',email:'',contact:'',university:'MUK',bedId,movedIn:false,paid:'',paymentMethod:''};
}
const normalize=(value:string)=>value.trim().replace(/\s+/g,' ').toLowerCase();
const universities:Record<string,University>={'muk':'MUK','makerere university':'MUK','mubs':'MUBS','makerere university business school':'MUBS','kiu':'KIU','kampala international university':'KIU','kyu':'KYU','kyambogo university':'KYU','other':'other'};
const methods:Record<string,string>={cash:'cash',mtn:'mtn_momo','mtn momo':'mtn_momo','mtn_momo':'mtn_momo',airtel:'airtel_money','airtel money':'airtel_money',airtel_money:'airtel_money',card:'card','bank transfer':'bank_transfer',bank_transfer:'bank_transfer'};
// Room codes stay distinct: A02 and A2 may be different physical rooms.
const bedCode = (value:string) => normalize(value).replace(/^bed(?=\s|#|-|\d)[\s#-]*/, '').replace(/^0+(?=\d)/, '');
type Location = Pick<ImportedTenantRow, 'propertyName' | 'roomLabel' | 'bedLabel'>;
function matchLocations(locations:Location[], beds:WalkInBed[], usedBeds:string[]) {
  const used = new Set(usedBeds);
  const matches = locations.map((location) => {
    const scoped = beds.filter((bed) => !location.propertyName || normalize(bed.propertyName) === normalize(location.propertyName));
    const rooms = scoped.filter((bed) => location.roomLabel && normalize(bed.roomLabel) === normalize(location.roomLabel));
    const identities = new Set(rooms.map((bed) => bed.unitId ?? JSON.stringify([bed.propertyId ?? normalize(bed.propertyName), normalize(bed.roomLabel)])));
    const problem = !location.roomLabel ? 'The document has no room code. Choose a room and free bed.'
      : !rooms.length ? `No available room matches ${location.propertyName ? `${location.propertyName} · ` : ''}${location.roomLabel}. Refresh beds or choose a free room.`
      : identities.size !== 1 ? 'This room code matches more than one property or room. Choose the intended room and bed.' : '';
    return {location, rooms, problem, selected:undefined as WalkInBed|undefined, note:''};
  });
  // Honor explicit bed choices before assigning room-only entries in a batch.
  for (const match of matches) {
    if (match.problem || !match.location.bedLabel) continue;
    const available = match.rooms.filter((bed) => !used.has(bed.id));
    const exact = available.filter((bed) => normalize(bed.bedLabel) === normalize(match.location.bedLabel));
    const candidates = exact.length ? exact : available.filter((bed) => bedCode(bed.bedLabel) === bedCode(match.location.bedLabel));
    if (candidates.length === 1) { match.selected = candidates[0]; used.add(match.selected!.id); }
  }
  for (const match of matches) {
    if (match.problem || match.selected) continue;
    const available = match.rooms.filter((bed) => !used.has(bed.id)).sort((a,b) => a.bedLabel.localeCompare(b.bedLabel, undefined, {numeric:true}) || a.id.localeCompare(b.id));
    if (!available.length) match.problem = 'No free bed remains in this room for this batch. Choose another available room.';
    else if (match.location.bedLabel && available.length > 1) match.problem = `Requested bed ${match.location.bedLabel} did not match a free bed. Choose one of this room’s available beds.`;
    else {
      match.selected = available[0]; used.add(match.selected!.id);
      if (match.location.bedLabel) match.note = `Requested bed ${match.location.bedLabel} did not match a free bed. Assigned the room’s only free bed: ${match.selected!.bedLabel}. Review this assignment.`;
    }
  }
  return matches.map((match) => ({bedId:match.selected?.id ?? '', assignmentProblem:match.problem || undefined,
    assignmentNote:match.note || (match.selected ? `Automatically matched: ${match.selected.propertyName} · Room ${match.selected.roomLabel} · ${match.selected.bedLabel}.` : undefined)}));
}
export function importedTenantRows(records:ImportedTenantRow[],beds:WalkInBed[],usedBeds:string[]):TenantIntakeRow[]{
  const assignments = matchLocations(records, beds, usedBeds);
  return records.map((record,index)=>{
    const assignment = assignments[index]!;
    const selected = beds.find((bed) => bed.id === assignment.bedId);
    const warnings=[...record.warnings];
    if(selected&&record.rent&&Number(record.rent)!==selected.pricePerTermUgx)warnings.push('The document rent differs from this room’s rent. Check the room and money before saving.');
    if(record.university&&!universities[normalize(record.university)])warnings.push('University was not recognized. Select the correct one.');
    if(record.paymentMethod&&!methods[normalize(record.paymentMethod)])warnings.push('Payment method was not recognized. Select it in the form.');
    return {...emptyTenantRow(),documentRowNumber:record.rowNumber,kind:'record',firstName:record.firstName,lastName:record.lastName,gender:record.gender,phone:record.phone,email:record.email,
      contact:record.email||record.phone,emergencyContactName:record.emergencyContactName??'',emergencyContactPhone:record.emergencyContactPhone??'',university:universities[normalize(record.university)]??'MUK',...assignment,movedIn:record.movedIn,paid:record.amountPaid,
      paymentMethod:methods[normalize(record.paymentMethod)]??'',importWarnings:warnings,
      importLocation:{propertyName:record.propertyName,roomLabel:record.roomLabel,bedLabel:record.bedLabel}};
  });
}
/** Refresh only unresolved/stale assignments, preserving edits and retry keys. */
export function rematchImportedTenantRows(rows:TenantIntakeRow[], beds:WalkInBed[]):TenantIntakeRow[] {
  const unresolved = rows.filter((row) => row.importLocation && !beds.some((bed) => bed.id === row.bedId));
  const assignments = matchLocations(unresolved.map((row) => row.importLocation!), beds, rows.filter((row) => !unresolved.includes(row)).map((row) => row.bedId));
  return rows.map((row) => {const index=unresolved.indexOf(row);return index<0?row:{...row,...assignments[index]};});
}
