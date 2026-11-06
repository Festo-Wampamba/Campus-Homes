import type { ImportedTenantRow } from '@campushomes/shared';
import { importedTenantRows, rematchImportedTenantRows } from './tenant-intake-rows';
const record:ImportedTenantRow={rowNumber:2,firstName:'Amina',lastName:'Nakato',gender:'female',kind:'new',phone:'0771234567',email:'',university:'MUK',propertyName:'Mirembe',roomLabel:'A1',bedLabel:'Bed 1',amountPaid:'300000',rent:'800000',balance:'500000',paymentMethod:'Cash',movedIn:true,warnings:[]};
const bed={id:'b1',propertyName:'Mirembe',roomLabel:'A1',bedLabel:'Bed 1',roomCategory:'single',selfContained:true,pricePerTermUgx:800000};
it('matches only an unambiguous free bed and carries gender and payment into the form',()=>{
 expect(importedTenantRows([record],[bed],[])[0]).toMatchObject({firstName:'Amina',lastName:'Nakato',gender:'female',bedId:'b1',paid:'300000',paymentMethod:'cash',movedIn:true});
});
it('does not assign one bed twice or guess between properties with the same room label',()=>{
 const rows=importedTenantRows([record,record],[bed],[]);expect(rows[0]?.bedId).toBe('b1');expect(rows[1]?.bedId).toBe('');
 const ambiguous=importedTenantRows([{...record,propertyName:''}],[bed,{...bed,id:'b2',propertyName:'Other'}],[]);expect(ambiguous[0]?.bedId).toBe('');
});
it('keeps the authoritative room rent and warns about document differences',()=>{
 const row=importedTenantRows([{...record,rent:'900000',amountPaid:'300k'}],[bed],[])[0]!;
 expect(row.paid).toBe('300k');expect(row.importWarnings?.join(' ')).toContain('document rent differs');
});

it('matches the screenshot room codes with numeric beds, including a single-bed fallback',()=>{
 const beds=[{...bed,id:'a2',unitId:'u2',roomLabel:'A02'},{...bed,id:'a3',unitId:'u3',roomLabel:'A03'}];
 const rows=importedTenantRows([{...record,roomLabel:'A02',bedLabel:'1'},{...record,rowNumber:3,roomLabel:'A03',bedLabel:'2'}],beds,[]);
 expect(rows.map(row=>row.bedId)).toEqual(['a2','a3']);
 expect(rows[1]?.assignmentNote).toContain('only free bed: Bed 1');
});
it('allocates distinct free beds in a named room and honors explicit beds before room-only rows',()=>{
 const beds=[{...bed,id:'b2',unitId:'u1',bedLabel:'Bed 2'},{...bed,unitId:'u1'}];
 const rows=importedTenantRows([{...record,bedLabel:''},{...record,rowNumber:3,bedLabel:'01'}],beds,[]);
 expect(rows.map(row=>row.bedId)).toEqual(['b2','b1']);
});
it('keeps room codes distinct and refuses duplicate property names',()=>{
 const beds=[{...bed,propertyId:'p1',unitId:'u1',roomLabel:'A02'},{...bed,id:'b2',propertyId:'p1',unitId:'u2',roomLabel:'A2'}];
 expect(importedTenantRows([{...record,roomLabel:'A02'}],beds,[])[0]?.bedId).toBe('b1');
 expect(importedTenantRows([{...record,roomLabel:'A002'}],beds,[])[0]?.assignmentProblem).toContain('No available room');
 expect(importedTenantRows([{...record,roomLabel:'A02'}],[beds[1]!],[])[0]?.bedId).toBe('');
 expect(importedTenantRows([record],[{...bed,propertyId:'p1',unitId:'u1'},{...bed,id:'b2',propertyId:'p2',unitId:'u2'}],[])[0]?.bedId).toBe('');
});
it('does not substitute a different room or guess a mismatched bed in a room with several free beds',()=>{
 const rows=importedTenantRows([{...record,roomLabel:'Missing'},{...record,bedLabel:'Bed 9'}],[bed,{...bed,id:'b2',bedLabel:'Bed 2'}],[]);
 expect(rows.every(row=>!row.bedId&&row.assignmentProblem)).toBe(true);
});
it('rematches an unresolved import on refresh without losing corrections, retry keys or other assignments',()=>{
 const rows=importedTenantRows([record,{...record,rowNumber:3,roomLabel:'A2'}],[bed],[]);
 rows[1]!.lastName='Corrected';rows[1]!.paid='450000';const key=rows[1]!.key;
 const refreshed=rematchImportedTenantRows(rows,[bed,{...bed,id:'b2',roomLabel:'A2'}]);
 expect(refreshed[0]?.bedId).toBe('b1');
 expect(refreshed[1]).toMatchObject({key,lastName:'Corrected',paid:'450000',bedId:'b2',assignmentProblem:undefined});
});

it('imports existing residents as immediate tenant records, preserving names without linking contacts',()=>{
 const [row]=importedTenantRows([{...record,kind:'existing',email:'shared@example.test',phone:''}],[bed],[]);
 expect(row).toMatchObject({kind:'record',firstName:'Amina',lastName:'Nakato',email:'shared@example.test',phone:'',movedIn:true});
});
