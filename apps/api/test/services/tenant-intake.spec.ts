import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { tenantIntakeSchema } from '@campushomes/shared';
import { RlsDb } from '../../src/db/db.module';
import type { RlsContext } from '../../src/db/rls-context';
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
  expect((await service.walkInBeds(landlord())).map((item) => item.id)).toContain(target.bed);
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
