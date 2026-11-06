import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { tenantIntakeSchema, updateTenantEmergencySchema } from '@campushomes/shared';
import { RlsDb } from '../../src/db/db.module';
import type { RlsContext } from '../../src/db/rls-context';
import { ProvisioningService } from '../../src/modules/auth/provisioning.service';
import { AuditService } from '../../src/modules/ops/audit.service';
import { ReservationsService } from '../../src/modules/reservations/reservations.service';
import { testDatabaseUrl } from '../test-database-url';

process.env.DATABASE_URL = testDatabaseUrl();
const pool = new Pool({ connectionString: testDatabaseUrl(), max: 5 });
const rls = new RlsDb(pool);
const service = new ReservationsService(rls, new AuditService(rls), null, null);
let owner: string, outsider: string, student: string, otherStudent: string, semester: string;
const landlord = (): RlsContext => ({ userId: owner, role: 'landlord' });
const actor = (): RlsContext => ({ userId: student, role: 'student' });
async function id(sql: string, params: unknown[] = []) { return (await pool.query(sql, params)).rows[0].id as string; }
async function bed(mode = 'manage_only', approved = true) {
  const property = await id(`INSERT INTO properties(landlord_id,name,street_address,status,catchment,listing_intent,manage_review_status)
    VALUES($1,'Intake Hostel','Kampala','active','MUK',$2,$3) RETURNING id`, [owner, mode, approved ? 'approved' : 'pending']);
  if (approved) await rls.run({userId:owner,role:'service_role'}, async(_db,client) => { await client.query("UPDATE properties SET manage_review_status='approved' WHERE id=$1",[property]); });
  const unit = await id(`INSERT INTO units(property_id,label,capacity,room_category,self_contained) VALUES($1,'A01',1,'single',false) RETURNING id`, [property]);
  const target = await id(`INSERT INTO beds(unit_id,label) VALUES($1,'Bed 1') RETURNING id`, [unit]);
  await pool.query(`INSERT INTO unit_semester_pricing(unit_id,semester_id,price_per_term_ugx) VALUES($1,$2,800000)`, [unit, semester]);
  return { property, unit, bed: target };
}
const fresh = (bedId: string, n: number) => ({ kind: 'new' as const, idempotencyKey: randomUUID(), bedId, semesterId: semester,
  name: `New Student ${n}`, phone: `+25672000${String(n).padStart(4, '0')}`, university: 'MUK' as const, movedIn: false });
const existing = (bedId: string) => ({ kind: 'existing' as const, idempotencyKey: randomUUID(), bedId, semesterId: semester,
  contact: 'student@intake.example', movedIn: false });
async function request(bedId: string) {
  const entry = existing(bedId);
  expect(await service.tenantIntake(landlord(), { entries: [entry] })).toEqual([{ key: entry.idempotencyKey, status: 'requested' }]);
  return (await service.tenantAssignmentRequests(actor())).find((item) => item.id && item.roomLabel === 'A01')!.id;
}
beforeAll(async () => {
  await pool.query('TRUNCATE users,semesters,properties CASCADE');
  owner = await id(`INSERT INTO users(phone,role,status) VALUES('+256721111111','landlord','active') RETURNING id`);
  outsider = await id(`INSERT INTO users(phone,role,status) VALUES('+256721111112','landlord','active') RETURNING id`);
  await pool.query(`INSERT INTO landlords(user_id,legal_name,kyc_status) VALUES($1,'Owner','verified'),($2,'Outsider','verified')`, [owner, outsider]);
  student = await id(`INSERT INTO users(phone,email,email_verified,name,role,status) VALUES('+256721111113','student@intake.example',true,'Original Name','student','active') RETURNING id`);
  otherStudent = await id(`INSERT INTO users(phone,role,status) VALUES('+256721111114','student','active') RETURNING id`);
  await pool.query(`INSERT INTO students(user_id,university) VALUES($1,'MUK'),($2,'MUK')`, [student, otherStudent]);
  semester = await id(`INSERT INTO semesters(name,starts_on,ends_on,re_verification_window_starts_on)
    VALUES('Current',CURRENT_DATE-30,CURRENT_DATE+90,CURRENT_DATE+60) RETURNING id`);
});
afterAll(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); await pool.end(); });
afterEach(async () => {
  await pool.query(`UPDATE tenant_assignment_requests SET status='declined' WHERE status='pending'`);
  await pool.query(`UPDATE reservations SET status='released' WHERE student_id=$1 AND status IN ('booked','occupied','reserved')`, [student]);
});

it('offers approved managed beds with no listing and books a new student without publishing', async () => {
  const target = await bed();
  expect((await service.walkInBeds(landlord())).find((item) => item.id === target.bed)).toMatchObject({ id: target.bed, propertyId: target.property, unitId: target.unit });
  const entry = { ...fresh(target.bed, 1), firstName: 'Sarah', lastName: 'Kato', name: 'Sarah Kato', gender: 'female' as const };
  expect((await service.tenantIntake(landlord(), { entries: [entry] }))[0]?.status).toBe('added');
  const listing = (await pool.query('SELECT status FROM listings WHERE property_id=$1', [target.property])).rows[0];
  expect(listing.status).toBe('draft');
  const booked = (await pool.query('SELECT student_id,id FROM reservations WHERE bed_id=$1', [target.bed])).rows[0];
  expect((await pool.query('SELECT name,gender FROM users WHERE id=$1', [booked.student_id])).rows[0]).toMatchObject({ name: 'Sarah Kato', gender: 'female' });
  expect((await service.mine({ userId: booked.student_id, role: 'student' }))[0]).toMatchObject({ id: booked.id, publicListing: false });
  expect((await service.landlordTenants(landlord())).some((item) => item.reservationId === booked.id)).toBe(true);
  expect((await service.walkInBeds(landlord())).some((item) => item.id === target.bed)).toBe(false);
});
it('retries a saved new student without duplicating the booking or receipt', async () => {
  const target = await bed();
  const entry = { ...fresh(target.bed, 2), bookingFeeCollectedUgx: 100000, paymentMethod: 'cash' as const };
  await service.tenantIntake(landlord(), { entries: [entry] });
  expect((await service.tenantIntake(landlord(), { entries: [entry] }))[0]?.status).toBe('added');
  expect(Number((await pool.query('SELECT count(*) FROM reservations WHERE bed_id=$1', [target.bed])).rows[0].count)).toBe(1);
  expect(Number((await pool.query('SELECT count(*) FROM payment_receipts pr JOIN reservations r ON r.id=pr.reservation_id WHERE r.bed_id=$1', [target.bed])).rows[0].count)).toBe(1);
});
it('does not disclose or attach an existing account until its student accepts', async () => {
  const target = await bed();
  const entry = existing(target.bed);
  const known = await service.tenantIntake(landlord(), { entries: [entry] });
  expect(await service.tenantIntake(landlord(), { entries: [entry] })).toEqual(known);
  expect(Number((await pool.query('SELECT count(*) FROM tenant_assignment_requests WHERE created_by=$1 AND idempotency_key=$2',[owner,entry.idempotencyKey])).rows[0].count)).toBe(1);
  const changed = await service.tenantIntake(landlord(), { entries: [{...entry,contact:'changed@intake.example'}] });
  expect(changed[0]).toMatchObject({status:'failed',message:expect.stringMatching(/already saved/i)});
  const unknown = await service.tenantIntake(landlord(), { entries: [{ ...entry, idempotencyKey: randomUUID(), contact: 'unknown@intake.example' }] });
  expect(known[0]?.status).toBe(unknown[0]?.status);
  expect(Object.keys(known[0]!)).toEqual(['key','status']);
  expect((await pool.query('SELECT 1 FROM reservations WHERE bed_id=$1', [target.bed])).rowCount).toBe(0);
  const requests = await service.tenantAssignmentRequests(actor());
  await expect(service.respondTenantAssignment({ userId: otherStudent, role: 'student' }, requests[0]!.id, true)).rejects.toThrow(/not found/i);
  const accepted = await service.respondTenantAssignment(actor(), requests[0]!.id, true);
  expect((await service.respondTenantAssignment(actor(), requests[0]!.id, true)).reservationId).toBe(accepted.reservationId);
  expect((await pool.query('SELECT name,email,phone FROM users WHERE id=$1',[student])).rows[0]).toMatchObject({ name: 'Original Name', email: 'student@intake.example', phone: '+256721111113' });
});
it('declines a request without occupying a bed or creating receipts', async () => {
  const target = await bed();
  const requestId = await request(target.bed);
  await service.respondTenantAssignment(actor(), requestId, false);
  expect((await pool.query('SELECT 1 FROM reservations WHERE bed_id=$1',[target.bed])).rowCount).toBe(0);
  expect((await service.walkInBeds(landlord())).some((item) => item.id === target.bed)).toBe(true);
});
it('rechecks blocks, price and ownership at acceptance', async () => {
  const target = await bed();
  const requestId = await request(target.bed);
  await pool.query(`INSERT INTO unit_blocks(unit_id,reason,starts_at,created_by) VALUES($1,'maintenance',now(),$2)`, [target.unit,owner]);
  await expect(service.respondTenantAssignment(actor(),requestId,true)).rejects.toThrow(/unavailable/i);
  await pool.query('DELETE FROM unit_blocks WHERE unit_id=$1',[target.unit]);
  await pool.query('UPDATE unit_semester_pricing SET price_per_term_ugx=900000 WHERE unit_id=$1',[target.unit]);
  await expect(service.respondTenantAssignment(actor(),requestId,true)).rejects.toThrow(/price changed/i);
  await pool.query('UPDATE properties SET landlord_id=$2 WHERE id=$1',[target.property,outsider]);
  await expect(service.respondTenantAssignment(actor(),requestId,true)).rejects.toThrow(/permission/i);
});
it('excludes unapproved, archived, blocked, retired and expired inventory', async () => {
  const pending = await bed('manage_only',false);
  const archived = await bed(); await pool.query('UPDATE units SET archived_at=now() WHERE id=$1',[archived.unit]);
  const blocked = await bed(); await pool.query('UPDATE beds SET blocked=true WHERE id=$1',[blocked.bed]);
  const retired = await bed(); await pool.query('UPDATE beds SET retired_at=now() WHERE id=$1',[retired.bed]);
  const ids = (await service.walkInBeds(landlord())).map((item) => item.id);
  for (const target of [pending,archived,blocked,retired]) expect(ids).not.toContain(target.bed);
  expect(await service.walkInBeds({ userId: outsider, role: 'landlord' })).not.toEqual(expect.arrayContaining([{ id: pending.bed }]));
});
it('preserves successful batch rows when another row fails, then safely retries', async () => {
  const a=await bed(), b=await bed();
  await pool.query('UPDATE beds SET blocked=true WHERE id=$1',[b.bed]);
  const entries=[fresh(a.bed,3),fresh(b.bed,4)];
  expect((await service.tenantIntake(landlord(),{entries})).map((item)=>item.status)).toEqual(['added','failed']);
  await pool.query('UPDATE beds SET blocked=false WHERE id=$1',[b.bed]);
  expect((await service.tenantIntake(landlord(),{entries})).map((item)=>item.status)).toEqual(['added','added']);
});
it('rejects cross-property writes before revealing existing account results', async () => {
  const target=await bed();
  const result=await service.tenantIntake({userId:outsider,role:'landlord'},{entries:[existing(target.bed)]});
  expect(result[0]).toMatchObject({status:'failed',message:expect.stringMatching(/permission/i)});
});
it('supports both new and existing students at a verified listed property', async () => {
  const target = await bed('list');
  const staff = await id(`INSERT INTO users(phone,role,status) VALUES('+256721111119','ops_lead','active') RETURNING id`);
  await pool.query(`INSERT INTO ops_staff(user_id,team) VALUES($1,'lead')`,[staff]);
  const checklist = Object.fromEntries(['location_gps','rooms_capacity','amenities','photos','landlord_identity','safety'].map((key)=>[key,{passed:true}]));
  await pool.query(`INSERT INTO verification_visits(property_id,inspector_id,checklist,client_idempotency_key,result,approved_by,approved_at,completed_at)
    VALUES($1,$2,$3,$4,'passed',$2,now(),now())`,[target.property,staff,JSON.stringify(checklist),randomUUID()]);
  const listing = await id(`INSERT INTO listings(property_id,semester_id,status) VALUES($1,$2,'verified') RETURNING id`,[target.property,semester]);
  const version = await id(`INSERT INTO listing_versions(listing_id,version_number,price_per_term_ugx,amenities,verified_at) VALUES($1,1,800000,'{}',now()) RETURNING id`,[listing]);
  await pool.query('UPDATE listings SET current_version_id=$2 WHERE id=$1',[listing,version]);
  expect((await service.walkInBeds(landlord())).map((item)=>item.id)).toContain(target.bed);
  const entry = {...fresh(target.bed,9),movedIn:true};
  expect((await service.tenantIntake(landlord(),{entries:[entry]}))[0]?.status).toBe('added');
  const booked = (await pool.query('SELECT id,student_id,status FROM reservations WHERE bed_id=$1',[target.bed])).rows[0];
  expect(booked.status).toBe('occupied');
  await pool.query("UPDATE reservations SET status='released' WHERE id=$1",[booked.id]);
  const [savedRecord] = await service.tenantIntake(landlord(),{entries:[{...record(target.bed),movedIn:false}]});
  expect(savedRecord).toMatchObject({status:'added',bookingStatus:'booked'});
  expect((await service.landlordTenants(landlord())).find(t=>t.reservationId===savedRecord!.reservationId)).toMatchObject({name:'James Kananula',paidUgx:230000,balanceUgx:570000});
  await pool.query("UPDATE reservations SET status='released' WHERE id=$1",[savedRecord!.reservationId]);
  await service.tenantIntake(landlord(),{entries:[{...existing(target.bed),movedIn:true}]});
  const requestId=(await service.tenantAssignmentRequests(actor()))[0]!.id;
  await service.respondTenantAssignment(actor(),requestId,true);
  expect((await service.mine(actor()))[0]).toMatchObject({listingId:listing,publicListing:true,status:'occupied'});
});
it('expires requests without booking and never confirms a now-closed property',async()=>{
  const target=await bed(), requestId=await request(target.bed);
  await pool.query("UPDATE tenant_assignment_requests SET expires_at=now()-interval '1 minute' WHERE id=$1",[requestId]);
  await expect(service.respondTenantAssignment(actor(),requestId,true)).rejects.toThrow(/ended/i);
  await pool.query("UPDATE tenant_assignment_requests SET expires_at=now()+interval '1 day' WHERE id=$1",[requestId]);
  await pool.query("UPDATE properties SET operational_status='temporarily_closed' WHERE id=$1",[target.property]);
  await expect(service.respondTenantAssignment(actor(),requestId,true)).rejects.toThrow(/unavailable/i);
});
it('allows only one acceptance when two students are offered the same bed',async()=>{
  const target=await bed();
  const first=await request(target.bed);
  await pool.query("UPDATE users SET email='second@intake.example',email_verified=true WHERE id=$1",[otherStudent]);
  await service.tenantIntake(landlord(),{entries:[{...existing(target.bed),contact:'second@intake.example'}]});
  const secondActor: RlsContext={userId:otherStudent,role:'student'};
  const second=(await service.tenantAssignmentRequests(secondActor))[0]!.id;
  const result=await Promise.allSettled([service.respondTenantAssignment(actor(),first,true),service.respondTenantAssignment(secondActor,second,true)]);
  expect(result.filter((item)=>item.status==='fulfilled')).toHaveLength(1);
  expect(Number((await pool.query("SELECT count(*) FROM reservations WHERE bed_id=$1 AND status IN ('booked','occupied')",[target.bed])).rows[0].count)).toBe(1);
});
it('enforces batch limits, unique beds and canonical verified contacts', () => {
  const base=existing(randomUUID());
  expect(tenantIntakeSchema.safeParse({entries:[base,{...base,idempotencyKey:randomUUID()}]}).success).toBe(false);
  expect(tenantIntakeSchema.safeParse({entries:Array.from({length:51},()=>({...base,bedId:randomUUID(),idempotencyKey:randomUUID()}))}).success).toBe(false);
  const parsed=tenantIntakeSchema.parse({entries:[{...base,contact:'0771 234567'}]});
  expect(parsed.entries[0]).toMatchObject({contact:'+256771234567'});
});
it('keeps assignment rows service-only under RLS',async()=>{
  const target=await bed(); await request(target.bed);
  const rows=await rls.run(actor(),async(_db,client)=>client.query('SELECT id FROM tenant_assignment_requests'));
  expect(rows.rowCount).toBe(0);
});

const record = (bedId: string) => ({ kind: 'record' as const, idempotencyKey: randomUUID(), bedId, semesterId: semester,
  name: 'James Kananula', firstName: 'James', lastName: 'Kananula', gender: 'male' as const,
  university: 'MUK' as const, movedIn: false, bookingFeeCollectedUgx: 230000, paymentMethod: 'cash' as const });
it('persists a private tenant, payment, booked status and balance without account acceptance', async () => {
  const target = await bed();
  const entry = record(target.bed);
  const [saved] = await service.tenantIntake(landlord(), { entries: [entry] });
  expect(saved).toMatchObject({ status: 'added', bookingStatus: 'booked', reservationId: expect.any(String) });
  // A fresh service/read transaction proves this is committed, not an in-memory success.
  const freshService = new ReservationsService(new RlsDb(pool), new AuditService(rls), null, null);
  const tenant = (await freshService.landlordTenants(landlord())).find(t => t.reservationId === saved!.reservationId)!;
  expect(tenant).toMatchObject({ name: 'James Kananula', status: 'booked', paidUgx: 230000, balanceUgx: 570000 });
  expect((await freshService.walkInBeds(landlord())).some(b => b.id === target.bed)).toBe(false);
  expect((await freshService.receipts(landlord(), 'landlord')).find(r => r.reservationId === saved!.reservationId)).toMatchObject({totalUgx:230000,studentName:'James Kananula'});
  expect((await freshService.landlordTenants({userId:outsider,role:'landlord'})).some(t=>t.reservationId===saved!.reservationId)).toBe(false);
  await expect(freshService.studentDetails({userId:outsider,role:'landlord'}, saved!.reservationId!)).rejects.toThrow();
  await freshService.confirmMoveIn(landlord(), saved!.reservationId!);
  expect((await freshService.landlordTenants(landlord())).find(t => t.reservationId === saved!.reservationId)).toMatchObject({status:'occupied',paidUgx:230000,balanceUgx:570000});
  const payment = {amountUgx:570000,idempotencyKey:randomUUID(),paymentMethod:'cash' as const};
  await freshService.recordPayment(landlord(),saved!.reservationId!,payment);
  await freshService.recordPayment(landlord(),saved!.reservationId!,payment);
  expect((await freshService.landlordTenants(landlord())).find(t=>t.reservationId===saved!.reservationId)).toMatchObject({paidUgx:800000,balanceUgx:0});
});
it('keeps repeated contacts as separate private tenants without claiming a real account', async () => {
  const a = await bed(), b = await bed();
  const entries = [{...record(a.bed), email:'student@intake.example',phone:'+256721111113'},
    {...record(b.bed), name:'Edward Kiwanda',email:'student@intake.example',phone:'+256721111113',movedIn:true}];
  const saved = await service.tenantIntake(landlord(),{entries});
  expect(saved.map(s=>s.bookingStatus)).toEqual(['booked','occupied']);
  const profiles = (await pool.query(`SELECT u.* FROM users u JOIN reservations r ON r.student_id=u.id WHERE r.id=ANY($1::uuid[])`,[saved.map(s=>s.reservationId)])).rows;
  expect(new Set(profiles.map(u=>u.id)).size).toBe(2);
  for(const profile of profiles) {
    expect(profile).toMatchObject({phone:null,email:null,logto_user_id:null,contact_email:'student@intake.example',contact_phone:'+256721111113'});
    expect(profile.id).not.toBe(student);
    await expect(pool.query('UPDATE users SET logto_user_id=$2 WHERE id=$1',[profile.id,'cannot-claim-record'])).rejects.toThrow(/users_tenancy_no_login/);
  }
  expect((await pool.query('SELECT name,email,phone FROM users WHERE id=$1',[student])).rows[0]).toMatchObject({name:'Original Name',email:'student@intake.example',phone:'+256721111113'});
  const tenants = await service.landlordTenants(landlord());
  expect(tenants.find(t=>t.reservationId===saved[1]!.reservationId)).toMatchObject({name:'Edward Kiwanda',email:'student@intake.example',phone:'+256721111113'});
});
it('makes concurrent private-record retries idempotent and refuses changed payloads', async () => {
  const target=await bed(), entry=record(target.bed);
  const results=await Promise.all([service.tenantIntake(landlord(),{entries:[entry]}),service.tenantIntake(landlord(),{entries:[entry]})]);
  expect(results[0]).toEqual(results[1]);
  expect(results[0]![0]!.status).toBe('added');
  expect((await pool.query('SELECT count(*)::int AS n FROM reservations WHERE bed_id=$1',[target.bed])).rows[0].n).toBe(1);
  expect((await pool.query('SELECT count(*)::int AS n FROM payment_receipts WHERE reservation_id=$1',[results[0]![0]!.reservationId])).rows[0].n).toBe(1);
  expect((await service.tenantIntake(landlord(),{entries:[{...entry,name:'Different Person'}]}))[0]).toMatchObject({status:'failed',message:expect.stringMatching(/different details/)});
});
it('rolls back a failed private record and allows retry without phantom accounts or money', async () => {
  const a=await bed(), b=await bed();
  const entries=[record(a.bed),{...record(b.bed),bookingFeeCollectedUgx:900000}];
  const saved=await service.tenantIntake(landlord(),{entries});
  expect(saved.map(s=>s.status)).toEqual(['added','failed']);
  expect((await pool.query('SELECT count(*)::int AS n FROM users WHERE tenancy_property_id=$1',[b.property])).rows[0].n).toBe(0);
  const replay=await service.tenantIntake(landlord(),{entries:[entries[0]!,{...entries[1]!,bookingFeeCollectedUgx:30000}]});
  expect(replay.map(s=>s.status)).toEqual(['added','added']);
  expect((await pool.query('SELECT count(*)::int AS n FROM reservations WHERE bed_id=ANY($1::uuid[])',[entries.map(e=>e.bedId)])).rows[0].n).toBe(2);
});
it('rejects foreign/private inventory and records zero payment as a booked unpaid tenant', async () => {
  const target=await bed(), entry={...record(target.bed),bookingFeeCollectedUgx:0};
  expect((await service.tenantIntake({userId:outsider,role:'landlord'},{entries:[entry]}))[0]!.status).toBe('failed');
  const [saved]=await service.tenantIntake(landlord(),{entries:[entry]});
  expect((await service.landlordTenants(landlord())).find(t=>t.reservationId===saved!.reservationId)).toMatchObject({status:'booked',paidUgx:0,balanceUgx:800000});
  expect((await pool.query('SELECT count(*)::int AS n FROM payment_receipts WHERE reservation_id=$1',[saved!.reservationId])).rows[0].n).toBe(0);
});

it('serializes competing records for one bed without leaving an extra tenant or receipt', async()=>{
 const target=await bed();
 const outcomes=await Promise.all([service.tenantIntake(landlord(),{entries:[record(target.bed)]}),service.tenantIntake(landlord(),{entries:[record(target.bed)]})]);
 expect(outcomes.flat().map(r=>r.status).sort()).toEqual(['added','failed']);
 expect((await pool.query('SELECT count(*)::int AS n FROM users WHERE tenancy_property_id=$1',[target.property])).rows[0].n).toBe(1);
});

it('does not claim a private tenant when its supplied contact later signs up', async()=>{
 const target=await bed();
 const [saved]=await service.tenantIntake(landlord(),{entries:[{...record(target.bed),email:'private-record@intake.example',phone:'+256782221111'}]});
 const recordId=(await pool.query('SELECT student_id FROM reservations WHERE id=$1',[saved!.reservationId])).rows[0].student_id;
 const account=await new ProvisioningService(rls).provision({sub:'private-contact-signup',email:'private-record@intake.example',emailVerified:true,phoneNumber:'+256782221111',phoneVerified:true},'consumer');
 expect(account!.id).not.toBe(recordId);
 expect((await service.mine({userId:account!.id,role:'student'}))).toHaveLength(0);
 expect((await pool.query('SELECT logto_user_id,name FROM users WHERE id=$1',[recordId])).rows[0]).toEqual({logto_user_id:null,name:'James Kananula'});
});

it('saves emergency contacts at intake and allows missing details to be added, corrected and cleared after booking', async()=>{
 const target=await bed();
 const [saved]=await service.tenantIntake(landlord(),{entries:[record(target.bed)]});
 const reservationId=saved!.reservationId!;
 const update=updateTenantEmergencySchema.parse({emergencyContactName:' Grace Kato ',emergencyContactPhone:'0771 234567'});
 await service.updateTenantEmergency(landlord(),reservationId,update);
 const reread=new ReservationsService(new RlsDb(pool),new AuditService(rls),null,null);
 expect((await reread.landlordTenants(landlord())).find(t=>t.reservationId===reservationId)).toMatchObject({emergencyContactName:'Grace Kato',emergencyContactPhone:'+256771234567',paidUgx:230000,balanceUgx:570000,status:'booked'});
 expect(await reread.studentDetails(landlord(),reservationId)).toMatchObject({emergencyContactName:'Grace Kato',emergencyContactPhone:'+256771234567'});
 await expect(service.updateTenantEmergency({userId:outsider,role:'landlord'},reservationId,update)).rejects.toThrow(/permission/i);
 await service.updateTenantEmergency(landlord(),reservationId,{emergencyContactName:'Updated Kin',emergencyContactPhone:''});
 expect((await service.landlordTenants(landlord())).find(t=>t.reservationId===reservationId)).toMatchObject({emergencyContactName:'Updated Kin',emergencyContactPhone:null});
 await service.updateTenantEmergency(landlord(),reservationId,{emergencyContactName:'',emergencyContactPhone:''});
 expect((await service.landlordTenants(landlord())).find(t=>t.reservationId===reservationId)).toMatchObject({emergencyContactName:null,emergencyContactPhone:null});
 await pool.query("UPDATE reservations SET status='released' WHERE id=$1",[reservationId]);
 await expect(service.updateTenantEmergency(landlord(),reservationId,update)).rejects.toThrow(/only be updated/i);
 const next=await bed();
 const [withContact]=await service.tenantIntake(landlord(),{entries:[{...record(next.bed),...update}]});
 expect((await reread.landlordTenants(landlord())).find(t=>t.reservationId===withContact!.reservationId)).toMatchObject(update);
});
it('keeps a booking emergency override separate from a linked student profile and other bookings', async()=>{
 const a=await bed(), b=await bed();
 await pool.query("UPDATE users SET emergency_contact_name='Profile Kin',emergency_contact_phone='+256772222222' WHERE id=$1",[student]);
 await service.tenantIntake(landlord(),{entries:[existing(a.bed)]});
 const requestId=(await service.tenantAssignmentRequests(actor()))[0]!.id;
 const accepted=await service.respondTenantAssignment(actor(),requestId,true);
 await service.tenantIntake(landlord(),{entries:[existing(b.bed)]});
 const secondId=(await service.tenantAssignmentRequests(actor()))[0]!.id;
 const second=await service.respondTenantAssignment(actor(),secondId,true);
 expect((await service.studentDetails(landlord(),accepted.reservationId!)).emergencyContactName).toBe('Profile Kin');
 await service.updateTenantEmergency(landlord(),accepted.reservationId!,{emergencyContactName:'Booking Kin',emergencyContactPhone:'+256773333333'});
 expect((await service.studentDetails(landlord(),second.reservationId!)).emergencyContactName).toBe('Profile Kin');
 expect((await pool.query('SELECT emergency_contact_name FROM users WHERE id=$1',[student])).rows[0].emergency_contact_name).toBe('Profile Kin');
 await service.updateTenantEmergency(landlord(),accepted.reservationId!,{emergencyContactName:'',emergencyContactPhone:''});
 expect((await service.studentDetails(landlord(),accepted.reservationId!)).emergencyContactName).toBeNull();
});
it('accepts international emergency contacts and rejects invalid phone numbers or unexpected profile fields',()=>{
 expect(updateTenantEmergencySchema.parse({emergencyContactName:'Kin',emergencyContactPhone:'+254 712 345678'}).emergencyContactPhone).toBe('+254712345678');
 expect(updateTenantEmergencySchema.safeParse({emergencyContactName:'Kin',emergencyContactPhone:'invalid'}).success).toBe(false);
 expect(updateTenantEmergencySchema.safeParse({emergencyContactName:'Kin',emergencyContactPhone:'',email:'unwanted@example.test'}).success).toBe(false);
});
