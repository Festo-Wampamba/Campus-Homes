import { RlsDb } from '../../src/db/db.module';
import { ManagementService } from '../../src/modules/management/management.service';
import { asIdentity, pool, seed } from './helpers';

const service=new ManagementService(new RlsDb(pool));
let managerId:string;let propertyId:string;
beforeAll(async()=>{
 const ownerId=await seed("INSERT INTO users(role,status,name) VALUES('landlord','active','Management RLS owner') RETURNING id");
 managerId=await seed("INSERT INTO users(role,status,name) VALUES('property_manager','active','Management RLS manager') RETURNING id");
 await seed("INSERT INTO landlords(user_id,legal_name,kyc_status) VALUES($1,'RLS owner','verified')",[ownerId]);
 propertyId=await seed("INSERT INTO properties(landlord_id,name,street_address,catchment) VALUES($1,'RLS managed property','Kampala','MUK') RETURNING id",[ownerId]);
 const actor={userId:managerId,role:'property_manager' as const};
 const agency=await service.createAgency(actor,'RLS agency');
 const mandate=await service.createMandate({userId:ownerId,role:'landlord'}, {propertyId,agencyId:agency.id,capabilities:['property.read','reports.submit'],startsAt:new Date(Date.now()-60000).toISOString(),endsAt:new Date(Date.now()+86400000).toISOString(),reason:'RLS proof fixture'});
 await service.decideMandate(actor,mandate.id,'accept');
 await service.addNote(actor,propertyId,{kind:'report',title:'RLS report',body:'Private owner report'});
 await pool.query("INSERT INTO office_cases(kind,subject,customer_name,catchment,assigned_to,created_by) VALUES('inquiry','Private case','RLS customer','MUK',$1,$1)",[managerId]);
});
afterAll(()=>pool.end());
it('forces service-only RLS on all management storage and prevents direct property ownership access',async()=>{
 await asIdentity({userId:managerId,role:'property_manager'},async c=>{
  for(const table of ['management_agencies','management_agency_members','property_management_mandates','management_assignments','management_notes','office_cases']){
   expect((await c.query(`SELECT * FROM ${table}`)).rows).toHaveLength(0);
  }
  expect((await c.query('SELECT id FROM properties WHERE id=$1',[propertyId])).rows).toHaveLength(0);
  expect((await c.query("SELECT app_management_access_for($1,$2,'property.read') AS allowed",[managerId,propertyId])).rows[0].allowed).toBe(true);
 });
 await expect(asIdentity({userId:managerId,role:'property_manager'},c=>c.query('INSERT INTO management_agencies(name,created_by) VALUES($1,$2)',['Forged agency',managerId]))).rejects.toThrow(/row-level security/);
});
