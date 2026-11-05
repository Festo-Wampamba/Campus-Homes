import type { ImportedTenantRow } from '@campushomes/shared';
import { importedTenantRows } from './tenant-intake-rows';
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
