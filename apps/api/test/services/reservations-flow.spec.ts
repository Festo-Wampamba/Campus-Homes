/**
 * Service-level flow tests (brief §18): the reservation-hold state machine,
 * payment-webhook idempotency, and the offline-sync checklist endpoint's
 * idempotency. Runs against the docker test DB through the real services.
 */
import { Pool } from 'pg';

import { StubPayments } from '../../src/adapters/payments.adapter';
import { RlsDb } from '../../src/db/db.module';
import type { LogtoManagementClient } from '../../src/modules/auth/logto-management.client';
import { LedgerService } from '../../src/modules/finance/ledger.service';
import { AuditService } from '../../src/modules/ops/audit.service';
import { OpsService } from '../../src/modules/ops/ops.service';
import type { NotificationsService } from '../../src/modules/notifications/notifications.service';
import { ReservationsService } from '../../src/modules/reservations/reservations.service';
import type { RlsContext } from '../../src/db/rls-context';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://campushomes:campushomes_test@localhost:54329/campushomes_test';

// Must be set before ReservationsService is constructed below — it reads
// PAYMENTS_ENABLED once via loadEnv() at construction time. This suite
// specifically exercises the paid/held flow (platform_settings overrides
// the fee back to a nonzero value in beforeAll), so it needs the gate open,
// unlike the app's real Phase 1 default (RESERVATION_FEE_UGX = 0, gate
// irrelevant since a free reservation never reaches it).
process.env.PAYMENTS_ENABLED = 'true';
// Same construction-time loadEnv() also requires DATABASE_URL; bare
// `pnpm test` doesn't export one, so fall back to the docker test DB.
process.env.DATABASE_URL = process.env.DATABASE_URL || TEST_DATABASE_URL;

const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 5 });
const rlsDb = new RlsDb(pool);
const audit = new AuditService(rlsDb);
// Only inviteLandlord() touches auth.api — unused by anything these tests exercise.
const ops = new OpsService(rlsDb, audit, {} as NotificationsService, {} as LogtoManagementClient);
const ledger = new LedgerService();
const reservationsService = new ReservationsService(
  rlsDb,
  audit,
  new StubPayments('http://localhost:3000'),
  null,
  null,
  ledger,
);

let student1: string;
let student2: string;
let landlord1: string;
let opsLead: string;
let inspectorId: string;
let listingId: string;
let unitId: string;

const studentCtx = (): RlsContext => ({ userId: student1, role: 'student' });
const leadCtx = (): RlsContext => ({ userId: opsLead, role: 'ops_lead' });

const FULL_CHECKLIST = Object.fromEntries(
  ['location_gps', 'rooms_capacity', 'amenities', 'photos', 'landlord_identity', 'safety'].map(
    (c) => [c, { passed: true }],
  ),
) as Record<string, { passed: boolean }>;

async function seed(sql: string, params: unknown[] = []): Promise<string> {
  const res = await pool.query(sql, params);
  return res.rows[0]?.id as string;
}

beforeAll(async () => {
  await pool.query(
    `TRUNCATE users, students, landlords, ops_staff, semesters, properties,
     property_documents, verification_visits, listings, listing_versions,
     units, reservations, payments, refunds, move_ins, audit_log,
     notifications CASCADE`,
  );

  // The Phase 1 default (RESERVATION_FEE_UGX = 0) skips the whole paid
  // flow — this describe block specifically tests that flow, so it needs
  // the platform_settings override a real deployment would use to turn
  // the fee back on, same mechanism, not a test-only shortcut.
  await pool.query(
    `INSERT INTO platform_settings (key, value, description)
     VALUES ('reservation_fee_ugx', '5000'::jsonb, 'test override')
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
  );

  student1 = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000001', 'student', 'active') RETURNING id`,
  );
  student2 = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000002', 'student', 'active') RETURNING id`,
  );
  landlord1 = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000003', 'landlord', 'active') RETURNING id`,
  );
  opsLead = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000004', 'ops_lead', 'active') RETURNING id`,
  );
  inspectorId = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000005', 'ops_inspector', 'active') RETURNING id`,
  );
  await pool.query(`INSERT INTO students (user_id, university) VALUES ($1), ($2)`.replace('($1), ($2)', `($1, 'MUK'), ($2, 'MUK')`), [student1, student2]);
  await pool.query(
    `INSERT INTO landlords (user_id, legal_name, kyc_status) VALUES ($1, 'LL One', 'verified')`,
    [landlord1],
  );
  await pool.query(
    `INSERT INTO ops_staff (user_id, team) VALUES ($1, 'lead'), ($2, 'inspector')`,
    [opsLead, inspectorId],
  );

  const semester = await seed(
    `INSERT INTO semesters (name, starts_on, ends_on, re_verification_window_starts_on)
     VALUES ('Sem 1 26/27', '2026-08-01', '2026-12-15', '2026-11-15') RETURNING id`,
  );
  const property = await seed(
    `INSERT INTO properties (landlord_id, name, street_address, status, gps_lat, gps_lon, catchment)
     VALUES ($1, 'Test Hostel', 'Wandegeya', 'active', 0.33, 32.57, 'MUK') RETURNING id`,
    [landlord1],
  );
  await pool.query(
    `INSERT INTO verification_visits
       (property_id, inspector_id, checklist, client_idempotency_key, result, approved_by, approved_at, completed_at)
     VALUES ($1, $2, $3, 'seed-visit-key-0001', 'passed', $4, now(), now())`,
    [property, inspectorId, JSON.stringify(FULL_CHECKLIST), opsLead],
  );
  listingId = await seed(
    `INSERT INTO listings (property_id, semester_id, status) VALUES ($1, $2, 'pending_verification') RETURNING id`,
    [property, semester],
  );

  // Publish through the real ops path: version snapshot + verified flip + unit.
  const published = await ops.publishListing(leadCtx(), {
    listingId,
    amenities: { water: true, power: true },
    description: 'Test listing',
    units: [{ label: 'Room 1A', capacity: 1, roomCategory: 'single', pricePerTermUgx: 800_000 }],
  });
  expect(published.listing.status).toBe('verified');
  const unitRes = await pool.query(`SELECT id FROM units WHERE listing_id = $1`, [listingId]);
  unitId = unitRes.rows[0].id as string;
});

afterAll(async () => {
  await pool.end();
});

describe('listing publish (ops path)', () => {
  it('created version 1 as the listing current version', async () => {
    const res = await pool.query(
      `SELECT l.current_version_id, v.version_number
       FROM listings l JOIN listing_versions v ON v.id = l.current_version_id
       WHERE l.id = $1`,
      [listingId],
    );
    expect(res.rows[0].version_number).toBe(1);
  });

  it("promotes the approving visit's staged photos into listing_photos", async () => {
    const semester2 = await seed(
      `INSERT INTO semesters (name, starts_on, ends_on, re_verification_window_starts_on)
       VALUES ('Sem 2 26/27', '2027-01-05', '2027-05-15', '2027-04-15') RETURNING id`,
    );
    const property2 = await seed(
      `INSERT INTO properties (landlord_id, name, street_address, status, gps_lat, gps_lon, catchment)
       VALUES ($1, 'Photo Test Hostel', 'Kikoni', 'active', 0.335, 32.58, 'MUK') RETURNING id`,
      [landlord1],
    );
    await pool.query(
      `INSERT INTO verification_visits
         (property_id, inspector_id, checklist, client_idempotency_key, result, approved_by,
          approved_at, completed_at, visit_gps_lat, visit_gps_lon, photo_storage_keys)
       VALUES ($1, $2, $3, 'seed-visit-key-0002', 'passed', $4, now(), now(), 0.335, 32.58, $5)`,
      [
        property2,
        inspectorId,
        JSON.stringify(FULL_CHECKLIST),
        opsLead,
        JSON.stringify(['photo-key-1', 'photo-key-2']),
      ],
    );
    const listing2 = await seed(
      `INSERT INTO listings (property_id, semester_id, status) VALUES ($1, $2, 'pending_verification') RETURNING id`,
      [property2, semester2],
    );

    const published2 = await ops.publishListing(leadCtx(), {
      listingId: listing2,
      amenities: {},
      units: [{ label: 'Room 1', capacity: 1, roomCategory: 'single', pricePerTermUgx: 500_000 }],
    });

    const photos = await pool.query(
      `SELECT storage_key, captured_by, is_primary, sort_order, gps_lat, gps_lon
       FROM listing_photos WHERE listing_version_id = $1 ORDER BY sort_order`,
      [published2.version.id],
    );
    expect(photos.rows.map((r) => r.storage_key)).toEqual(['photo-key-1', 'photo-key-2']);
    expect(photos.rows.every((r) => r.captured_by === inspectorId)).toBe(true);
    expect(photos.rows[0].is_primary).toBe(true);
    expect(photos.rows[1].is_primary).toBe(false);
    expect(photos.rows[0].gps_lat).toBe('0.3350000');
  });

  it('publishing a listing with no staged photos leaves listing_photos empty (no crash)', async () => {
    // The very first describe's listingId/version — beforeAll seeded that
    // visit with no photo_storage_keys at all (column left null).
    const version = await pool.query(
      `SELECT current_version_id FROM listings WHERE id = $1`,
      [listingId],
    );
    const photos = await pool.query(
      `SELECT id FROM listing_photos WHERE listing_version_id = $1`,
      [version.rows[0].current_version_id],
    );
    expect(photos.rows).toHaveLength(0);
  });
});

describe('reservation hold state machine', () => {
  const KEY_1 = 'hold-key-0000000001';

  it('creates a held reservation with a pending payment and checkout url', async () => {
    const result = await reservationsService.createHold(
      studentCtx(),
      { unitId, idempotencyKey: KEY_1 },
      'http://localhost:3000/r',
    );
    expect({
      status: result.reservation.status,
      paymentStatus: result.payment?.status,
      hasCheckout: 'checkoutUrl' in result && Boolean(result.checkoutUrl && result.checkoutUrl.length > 0),
    }).toEqual({ status: 'held', paymentStatus: 'pending', hasCheckout: true });
  });

  it('replays the same idempotency key onto the same reservation', async () => {
    const first = await pool.query(`SELECT id FROM reservations WHERE idempotency_key = $1`, [
      KEY_1,
    ]);
    const replay = await reservationsService.createHold(
      studentCtx(),
      { unitId, idempotencyKey: KEY_1 },
      'http://localhost:3000/r',
    );
    expect(replay.reservation.id).toBe(first.rows[0].id);
  });

  it('rejects a second live hold on the same unit', async () => {
    await expect(
      reservationsService.createHold(
        { userId: student2, role: 'student' },
        { unitId, idempotencyKey: 'hold-key-0000000002' },
        'http://localhost:3000/r',
      ),
    ).rejects.toThrow(/live hold/i);
  });

  it('fulfills the reservation when the payment webhook succeeds', async () => {
    const payment = await pool.query(
      `SELECT p.provider_ref FROM payments p
       JOIN reservations r ON r.id = p.reservation_id
       WHERE r.idempotency_key = $1`,
      [KEY_1],
    );
    const outcome = await reservationsService.applyPaymentWebhook({
      txRef: payment.rows[0].provider_ref as string,
      providerTxnId: 'fw-txn-1001',
      status: 'successful',
      paymentMethod: 'mobilemoneyug',
      raw: { test: true },
    });
    expect(outcome).toEqual({ applied: true, outcome: 'fulfilled' });
  });

  it('posts a balanced hold-fee revenue journal entry alongside the succeeded payment', async () => {
    const rows = await pool.query(
      `SELECT a.code, jl.debit_ugx AS "debitUgx", jl.credit_ugx AS "creditUgx"
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.entry_id
       JOIN ledger_accounts a ON a.id = jl.account_id
       JOIN payments p ON p.id = je.payment_id
       WHERE p.provider_txn_id = 'fw-txn-1001'
       ORDER BY a.code`,
    );
    expect(rows.rows).toEqual([
      { code: '1000', debitUgx: 5000, creditUgx: 0 },
      { code: '4000', debitUgx: 0, creditUgx: 5000 },
    ]);
  });

  it('ignores a duplicate webhook for the same transaction', async () => {
    const payment = await pool.query(
      `SELECT p.provider_ref FROM payments p
       JOIN reservations r ON r.id = p.reservation_id
       WHERE r.idempotency_key = $1`,
      [KEY_1],
    );
    const outcome = await reservationsService.applyPaymentWebhook({
      txRef: payment.rows[0].provider_ref as string,
      providerTxnId: 'fw-txn-1001',
      status: 'successful',
      raw: {},
    });
    expect(outcome).toEqual({ applied: false, reason: 'duplicate webhook' });
  });

  it('confirms move-in by the student on the fulfilled reservation', async () => {
    const r = await pool.query(`SELECT id FROM reservations WHERE idempotency_key = $1`, [KEY_1]);
    const moveIn = await reservationsService.confirmMoveIn(
      studentCtx(),
      r.rows[0].id as string,
    );
    expect(moveIn).toMatchObject({ confirmedByRole: 'student' });
  });

  it('refunds instead of activating when the webhook lands on an expired hold', async () => {
    // Free the unit, then build an already-expired hold directly.
    await pool.query(
      `INSERT INTO units (listing_id, label, capacity, room_category, price_per_term_ugx, available_for_semester_id)
       SELECT listing_id, 'Room 2B', 1, room_category, price_per_term_ugx, available_for_semester_id FROM units WHERE id = $1`,
      [unitId],
    );
    const unit2 = (
      await pool.query(`SELECT id FROM units WHERE label = 'Room 2B'`)
    ).rows[0].id as string;

    const hold = await reservationsService.createHold(
      { userId: student2, role: 'student' },
      { unitId: unit2, idempotencyKey: 'hold-key-0000000003' },
      'http://localhost:3000/r',
    );
    await pool.query(
      `UPDATE reservations SET hold_expires_at = now() - interval '1 hour' WHERE id = $1`,
      [hold.reservation.id],
    );
    const payment = await pool.query(
      `SELECT provider_ref FROM payments WHERE reservation_id = $1`,
      [hold.reservation.id],
    );
    const outcome = await reservationsService.applyPaymentWebhook({
      txRef: payment.rows[0].provider_ref as string,
      providerTxnId: 'fw-txn-2002',
      status: 'successful',
      raw: {},
    });
    expect(outcome).toEqual({ applied: true, outcome: 'refunded_expired_hold' });
  });

  it('records the refund row for the expired-hold payment', async () => {
    const res = await pool.query(
      `SELECT reason FROM refunds rf
       JOIN payments p ON p.id = rf.payment_id
       WHERE p.provider_txn_id = 'fw-txn-2002'`,
    );
    expect(res.rows[0].reason).toBe('cooling_off');
  });

  it('posts a balanced refund journal entry for the expired-hold payment, linked to the refund row', async () => {
    const rows = await pool.query(
      `SELECT a.code, jl.debit_ugx AS "debitUgx", jl.credit_ugx AS "creditUgx"
       FROM journal_lines jl
       JOIN ledger_accounts a ON a.id = jl.account_id
       JOIN journal_entries je ON je.id = jl.entry_id
       JOIN refunds rf ON rf.id = je.refund_id
       JOIN payments p ON p.id = rf.payment_id
       WHERE p.provider_txn_id = 'fw-txn-2002'
       ORDER BY a.code`,
    );
    expect(rows.rows).toEqual([
      { code: '1000', debitUgx: 0, creditUgx: 5000 },
      { code: '4900', debitUgx: 5000, creditUgx: 0 },
    ]);
  });

  it('lets a student cancel their own held reservation', async () => {
    await pool.query(
      `INSERT INTO units (listing_id, label, capacity, room_category, price_per_term_ugx, available_for_semester_id)
       SELECT listing_id, 'Room 3C', 1, room_category, price_per_term_ugx, available_for_semester_id FROM units WHERE id = $1`,
      [unitId],
    );
    const unit3 = (
      await pool.query(`SELECT id FROM units WHERE label = 'Room 3C'`)
    ).rows[0].id as string;
    const hold = await reservationsService.createHold(
      studentCtx(),
      { unitId: unit3, idempotencyKey: 'hold-key-0000000004' },
      'http://localhost:3000/r',
    );
    const result = await reservationsService.cancel(studentCtx(), hold.reservation.id);
    expect(result).toEqual({ outcome: 'cancelled' });
  });
});

describe('free reservation (Phase 1 default: reservation_fee_ugx = 0)', () => {
  beforeAll(async () => {
    // Overrides this file's own paid-flow setup back to the app's real
    // Phase 1 default for this block only — subsequent describes below
    // don't call createHold(), so nothing needs restoring after.
    await pool.query(
      `UPDATE platform_settings SET value = '0'::jsonb WHERE key = 'reservation_fee_ugx'`,
    );
  });

  it('creates a reservation as fulfilled immediately, no payment or checkout', async () => {
    await pool.query(
      `INSERT INTO units (listing_id, label, capacity, room_category, price_per_term_ugx, available_for_semester_id)
       SELECT listing_id, 'Room 4D', 1, room_category, price_per_term_ugx, available_for_semester_id FROM units WHERE id = $1`,
      [unitId],
    );
    const freeUnit = (
      await pool.query(`SELECT id FROM units WHERE label = 'Room 4D'`)
    ).rows[0].id as string;

    const result = await reservationsService.createHold(
      studentCtx(),
      { unitId: freeUnit, idempotencyKey: 'hold-key-free-0000001' },
      'http://localhost:3000/r',
    );

    expect(result.reservation.status).toBe('fulfilled');
    expect(result.reservation.holdExpiresAt).toBeNull();
    expect(result.payment).toBeNull();
    expect('checkoutUrl' in result && result.checkoutUrl).toBeNull();

    const paymentRow = await pool.query(`SELECT id FROM payments WHERE reservation_id = $1`, [
      result.reservation.id,
    ]);
    expect(paymentRow.rows).toHaveLength(0);
  });

  it('lets the student confirm move-in immediately, with no payment step in between', async () => {
    await pool.query(
      `INSERT INTO units (listing_id, label, capacity, room_category, price_per_term_ugx, available_for_semester_id)
       SELECT listing_id, 'Room 4E', 1, room_category, price_per_term_ugx, available_for_semester_id FROM units WHERE id = $1`,
      [unitId],
    );
    const freeUnit = (
      await pool.query(`SELECT id FROM units WHERE label = 'Room 4E'`)
    ).rows[0].id as string;
    const hold = await reservationsService.createHold(
      studentCtx(),
      { unitId: freeUnit, idempotencyKey: 'hold-key-free-0000002' },
      'http://localhost:3000/r',
    );
    const moveIn = await reservationsService.confirmMoveIn(studentCtx(), hold.reservation.id);
    expect(moveIn).toMatchObject({ confirmedByRole: 'student' });
  });
});

describe('offline-sync checklist idempotency (§9 flow 2)', () => {
  let visitId: string;
  let inspector: string;
  const SYNC_KEY = 'sync-key-00000000000001';

  beforeAll(async () => {
    inspector = (
      await pool.query(`SELECT user_id FROM ops_staff WHERE team = 'inspector'`)
    ).rows[0].user_id as string;
    const property = (
      await pool.query(`SELECT id FROM properties LIMIT 1`)
    ).rows[0].id as string;
    visitId = await seed(
      `INSERT INTO verification_visits (property_id, inspector_id, client_idempotency_key)
       VALUES ($1, $2, 'server-created-sync-test') RETURNING id`,
      [property, inspector],
    );
  });

  it('applies the checklist on first sync', async () => {
    const visit = await ops.syncVisit(
      { userId: inspector, role: 'ops_inspector' },
      {
        clientIdempotencyKey: SYNC_KEY,
        visitId,
        checklist: FULL_CHECKLIST as never,
        visitGpsLat: 0.33,
        visitGpsLon: 32.57,
        startedAt: new Date(Date.now() - 3600_000).toISOString(),
        completedAt: new Date().toISOString(),
        result: 'passed',
        photoStorageKeys: [],
      },
    );
    expect(visit.result).toBe('passed');
  });

  it('a replayed sync with the same key does not double-apply', async () => {
    const replay = await ops.syncVisit(
      { userId: inspector, role: 'ops_inspector' },
      {
        clientIdempotencyKey: SYNC_KEY,
        visitId,
        checklist: FULL_CHECKLIST as never,
        visitGpsLat: 0.99, // different data — must be ignored
        visitGpsLon: 30.0,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        result: 'failed',
        photoStorageKeys: [],
      },
    );
    expect({ id: replay.id, result: replay.result, lat: replay.visitGpsLat }).toEqual({
      id: visitId,
      result: 'passed',
      lat: '0.3300000',
    });
  });
});
