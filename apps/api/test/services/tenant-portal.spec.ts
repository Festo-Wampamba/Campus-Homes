/**
 * Portal activation for a private tenant record (0090): the landlord issues a
 * single-use code for that one record and a signed-in student redeems it,
 * taking over the same booking and receipts. Nothing else proves ownership.
 */
import { randomUUID } from 'node:crypto';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';

import { ConsoleMessaging } from '../../src/adapters/messaging.adapter';
import { RlsDb } from '../../src/db/db.module';
import type { RlsContext } from '../../src/db/rls-context';
import { NotificationsService } from '../../src/modules/notifications/notifications.service';
import { AuditService } from '../../src/modules/ops/audit.service';
import { ReservationsService } from '../../src/modules/reservations/reservations.service';
import { TenantPortalService } from '../../src/modules/reservations/tenant-portal.service';
import { testDatabaseUrl } from '../test-database-url';

process.env.DATABASE_URL = testDatabaseUrl();
const pool = new Pool({ connectionString: testDatabaseUrl(), max: 5 });
const rls = new RlsDb(pool);
const audit = new AuditService(rls);
const reservations = new ReservationsService(rls, audit, null, null);
const portal = new TenantPortalService(rls, audit, new NotificationsService(rls, new ConsoleMessaging()));

let owner: string, outsider: string, student: string, otherStudent: string, semester: string;
const landlord = (): RlsContext => ({ userId: owner, role: 'landlord' });
const asStudent = (userId = student): RlsContext => ({ userId, role: 'student' });

async function id(sql: string, params: unknown[] = []) { return (await pool.query(sql, params)).rows[0].id as string; }

async function account(n: number) {
  const userId = await id(
    `INSERT INTO users(phone,logto_user_id,name,role,status) VALUES($1,$2,$3,'student','active') RETURNING id`,
    [`+2567300000${n}`, `logto-portal-${n}`, `Portal Student ${n}`],
  );
  await pool.query(`INSERT INTO students(user_id,university) VALUES($1,'MUK')`, [userId]);
  return userId;
}

/** A private tenant booked on a fresh bed, with UGX 100,000 paid; returns the booking id. */
async function privateTenant(movedIn = false) {
  const property = await id(
    `INSERT INTO properties(landlord_id,name,street_address,status,catchment,listing_intent)
     VALUES($1,'Portal Hostel','Kampala','active','MUK','manage_only') RETURNING id`, [owner]);
  await rls.run({ userId: owner, role: 'service_role' }, (_db, client) =>
    client.query(`UPDATE properties SET manage_review_status='approved' WHERE id=$1`, [property]));
  const unit = await id(`INSERT INTO units(property_id,label,capacity,room_category,self_contained) VALUES($1,'A01',1,'single',false) RETURNING id`, [property]);
  const bed = await id(`INSERT INTO beds(unit_id,label) VALUES($1,'Bed 1') RETURNING id`, [unit]);
  await pool.query(`INSERT INTO unit_semester_pricing(unit_id,semester_id,price_per_term_ugx) VALUES($1,$2,800000)`, [unit, semester]);
  const [saved] = await reservations.tenantIntake(landlord(), { entries: [{
    kind: 'record', idempotencyKey: randomUUID(), bedId: bed, semesterId: semester, name: 'Private Resident',
    university: 'MUK', movedIn, bookingFeeCollectedUgx: 100000, paymentMethod: 'cash',
  }] });
  return (saved as { reservationId: string }).reservationId;
}

const booking = async (reservationId: string) =>
  (await pool.query(`SELECT student_id, status::text AS status FROM reservations WHERE id=$1`, [reservationId])).rows[0];

beforeAll(async () => {
  await pool.query('TRUNCATE users,semesters,properties CASCADE');
  owner = await id(`INSERT INTO users(phone,role,status) VALUES('+256730000001','landlord','active') RETURNING id`);
  outsider = await id(`INSERT INTO users(phone,role,status) VALUES('+256730000002','landlord','active') RETURNING id`);
  await pool.query(`INSERT INTO landlords(user_id,legal_name,kyc_status) VALUES($1,'Owner','verified'),($2,'Outsider','verified')`, [owner, outsider]);
  student = await account(3);
  otherStudent = await account(4);
  semester = await id(`INSERT INTO semesters(name,starts_on,ends_on,re_verification_window_starts_on)
    VALUES('Current',CURRENT_DATE-30,CURRENT_DATE+90,CURRENT_DATE+60) RETURNING id`);
});
afterAll(async () => { await pool.end(); });

describe('issuing a portal code', () => {
  it('marks the tenant as invited in the landlord ledger', async () => {
    const reservationId = await privateTenant();

    await portal.issue(landlord(), reservationId);

    const tenant = (await reservations.landlordTenants(landlord())).find((row) => row.reservationId === reservationId);
    expect(tenant?.portalStatus).toBe('invited');
  });

  it("is refused for another landlord's tenant", async () => {
    const reservationId = await privateTenant();

    await expect(portal.issue({ userId: outsider, role: 'landlord' }, reservationId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('stores only a hash of the code', async () => {
    const reservationId = await privateTenant();

    const { code } = await portal.issue(landlord(), reservationId);

    const { rowCount } = await pool.query(`SELECT 1 FROM tenancy_claims WHERE code_hash IN ($1, $2)`, [code, code.replace('-', '')]);
    expect(rowCount).toBe(0);
  });
});

describe('redeeming a portal code', () => {
  it('moves the booking to the signed-in student', async () => {
    const reservationId = await privateTenant();
    const { code } = await portal.issue(landlord(), reservationId);

    await portal.redeem(asStudent(), code);

    expect((await booking(reservationId)).student_id).toBe(student);
  });

  it('accepts the code typed in lower case without the dash', async () => {
    const reservationId = await privateTenant();
    const { code } = await portal.issue(landlord(), reservationId);

    await portal.redeem(asStudent(), code.replace('-', '').toLowerCase());

    expect((await booking(reservationId)).student_id).toBe(student);
  });

  it('shows the student the receipts already recorded for the booking', async () => {
    const reservationId = await privateTenant();
    const { code } = await portal.issue(landlord(), reservationId);

    await portal.redeem(asStudent(), code);

    const receipts = (await reservations.receipts(asStudent(), 'student')) as { reservationId: string; totalUgx: number }[];
    expect(receipts.filter((receipt) => receipt.reservationId === reservationId).map((receipt) => Number(receipt.totalUgx))).toEqual([100000]);
  });

  it("does not show another student's receipts", async () => {
    const reservationId = await privateTenant();
    const { code } = await portal.issue(landlord(), reservationId);
    await portal.redeem(asStudent(), code);

    const receipts = (await reservations.receipts(asStudent(otherStudent), 'student')) as { reservationId: string }[];

    expect(receipts.filter((receipt) => receipt.reservationId === reservationId)).toEqual([]);
  });

  it('does not mark a booked tenant as moved in', async () => {
    const reservationId = await privateTenant(false);
    const { code } = await portal.issue(landlord(), reservationId);

    await portal.redeem(asStudent(), code);

    expect((await booking(reservationId)).status).toBe('booked');
  });

  it('keeps the amount paid and the balance', async () => {
    const reservationId = await privateTenant();
    const { code } = await portal.issue(landlord(), reservationId);

    await portal.redeem(asStudent(), code);

    const tenant = (await reservations.landlordTenants(landlord())).find((row) => row.reservationId === reservationId);
    expect(tenant).toMatchObject({ paidUgx: 100000, balanceUgx: 700000, portalStatus: 'active' });
  });

  it('cannot be used a second time by someone else', async () => {
    const reservationId = await privateTenant();
    const { code } = await portal.issue(landlord(), reservationId);
    await portal.redeem(asStudent(), code);

    await expect(portal.redeem(asStudent(otherStudent), code)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('is a no-op when the same student submits it again', async () => {
    const reservationId = await privateTenant();
    const { code } = await portal.issue(landlord(), reservationId);
    await portal.redeem(asStudent(), code);

    await expect(portal.redeem(asStudent(), code)).resolves.toEqual({ linked: true });
  });

  it('fails once the landlord has revoked it', async () => {
    const reservationId = await privateTenant();
    const { code } = await portal.issue(landlord(), reservationId);
    await portal.revoke(landlord(), reservationId);

    await expect(portal.redeem(asStudent(), code)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('fails for the earlier code once a new one is issued', async () => {
    const reservationId = await privateTenant();
    const first = await portal.issue(landlord(), reservationId);
    await portal.issue(landlord(), reservationId);

    await expect(portal.redeem(asStudent(), first.code)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('fails after it expires', async () => {
    const reservationId = await privateTenant();
    const { code } = await portal.issue(landlord(), reservationId);
    await pool.query(`UPDATE tenancy_claims SET expires_at = now() - interval '1 minute' WHERE status='pending'`);

    await expect(portal.redeem(asStudent(), code)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('fails for a code that was never issued', async () => {
    await expect(portal.redeem(asStudent(), 'AAAAA-AAAAA')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('is refused for an account with no student profile', async () => {
    const reservationId = await privateTenant();
    const { code } = await portal.issue(landlord(), reservationId);
    const bare = await id(`INSERT INTO users(phone,logto_user_id,role,status) VALUES('+256730000009','logto-portal-9','student','active') RETURNING id`);

    await expect(portal.redeem(asStudent(bare), code)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('tells the landlord the portal was activated', async () => {
    const reservationId = await privateTenant();
    const { code } = await portal.issue(landlord(), reservationId);
    const before = new Date();

    await portal.redeem(asStudent(), code);

    const { rowCount } = await pool.query(
      `SELECT 1 FROM notifications WHERE user_id=$1 AND template_key='tenant.portal_activated' AND created_at >= $2`, [owner, before],
    );
    expect(rowCount).toBe(1);
  });
});
