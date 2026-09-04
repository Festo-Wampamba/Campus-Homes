/**
 * Service-level flow tests (brief §18, redesigned 2026-09 for the bed-level
 * Reserve -> Book -> Move-in state machine): reservation state transitions,
 * the 3-active-reservations-platform-wide cap, walk-in booking, release, and
 * expiry. Runs against the docker test DB through the real services.
 */
import { Pool } from 'pg';
import { eq } from 'drizzle-orm';

import { RlsDb } from '../../src/db/db.module';
import type { LogtoManagementClient } from '../../src/modules/auth/logto-management.client';
import { reservations } from '../../src/db/schema';
import { AuditService } from '../../src/modules/ops/audit.service';
import { OpsService } from '../../src/modules/ops/ops.service';
import type { NotificationsService } from '../../src/modules/notifications/notifications.service';
import { ReservationsService } from '../../src/modules/reservations/reservations.service';
import type { RlsContext } from '../../src/db/rls-context';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://campushomes:campushomes_test@localhost:54329/campushomes_test';

// ReservationsService reads DATABASE_URL once via loadEnv() at construction
// time; bare `pnpm test` doesn't export one, so fall back to the docker test DB.
process.env.DATABASE_URL = process.env.DATABASE_URL || TEST_DATABASE_URL;

const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 5 });
const rlsDb = new RlsDb(pool);
const audit = new AuditService(rlsDb);
// Only inviteLandlord() touches Logto's management API — unused by anything these tests exercise.
const ops = new OpsService(rlsDb, audit, {} as NotificationsService, {} as LogtoManagementClient);
const reservationsService = new ReservationsService(rlsDb, audit, null, null);

const NIL_UUID = '00000000-0000-0000-0000-000000000000';

/** Mirrors JobsRunner.expireReservation (jobs.module.ts) exactly, without
 * importing the real module — that pulls in AuthModule and its Logto
 * client setup, more weight than this suite needs to construct just to
 * exercise the expiry transition. Only 'reserved' expires; 'booked' is
 * left untouched. */
async function expireReservation(reservationId: string): Promise<void> {
  await rlsDb.run({ userId: NIL_UUID, role: 'service_role' }, async (db) => {
    const reservation = await db.query.reservations.findFirst({
      where: eq(reservations.id, reservationId),
    });
    if (!reservation || reservation.status !== 'reserved') return;
    await db
      .update(reservations)
      .set({ status: 'expired', updatedAt: new Date() })
      .where(eq(reservations.id, reservationId));
  });
}

let student1: string;
let student2: string;
let student3: string;
let landlord1: string;
let landlord2: string;
let opsLead: string;
let inspectorId: string;
let listingId: string;
let semester: string;
let unitId: string;
let bedId: string; // the sole bed on unitId (capacity 1)

const studentCtx = (userId: string): RlsContext => ({ userId, role: 'student' });
const landlordCtx = (userId: string): RlsContext => ({ userId, role: 'landlord' });
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

/** Clones a fresh single-bed unit off the same listing as unitId, with its
 * one bed, for tests that need inventory beyond the beforeAll-seeded Room 1A. */
async function seedUnitWithBed(label: string): Promise<{ unitId: string; bedId: string }> {
  const newUnitId = await seed(
    `INSERT INTO units (property_id, label, capacity, room_category)
     SELECT property_id, $2, 1, room_category
     FROM units WHERE id = $1 RETURNING id`,
    [unitId, label],
  );
  const priceRes = await pool.query(
    `SELECT price_per_term_ugx, deposit_ugx FROM unit_semester_pricing WHERE unit_id = $1 AND semester_id = $2`,
    [unitId, semester],
  );
  await pool.query(
    `INSERT INTO unit_semester_pricing (unit_id, semester_id, price_per_term_ugx, deposit_ugx)
     VALUES ($1, $2, $3, $4)`,
    [newUnitId, semester, priceRes.rows[0].price_per_term_ugx, priceRes.rows[0].deposit_ugx],
  );
  const newBedId = await seed(`INSERT INTO beds (unit_id, label) VALUES ($1, 'Bed 1') RETURNING id`, [
    newUnitId,
  ]);
  return { unitId: newUnitId, bedId: newBedId };
}

beforeAll(async () => {
  await pool.query(
    `TRUNCATE users, students, landlords, ops_staff, semesters, properties,
     property_documents, verification_visits, listings, listing_versions,
     units, beds, reservations, reservation_releases, payments, refunds,
     move_ins, audit_log, notifications CASCADE`,
  );

  student1 = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000001', 'student', 'active') RETURNING id`,
  );
  student2 = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000002', 'student', 'active') RETURNING id`,
  );
  student3 = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000006', 'student', 'active') RETURNING id`,
  );
  landlord1 = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000003', 'landlord', 'active') RETURNING id`,
  );
  landlord2 = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000007', 'landlord', 'active') RETURNING id`,
  );
  opsLead = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000004', 'ops_lead', 'active') RETURNING id`,
  );
  inspectorId = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000005', 'ops_inspector', 'active') RETURNING id`,
  );
  await pool.query(
    `INSERT INTO students (user_id, university) VALUES ($1, 'MUK'), ($2, 'MUK'), ($3, 'MUK')`,
    [student1, student2, student3],
  );
  await pool.query(
    `INSERT INTO landlords (user_id, legal_name, kyc_status) VALUES ($1, 'LL One', 'verified'), ($2, 'LL Two', 'verified')`,
    [landlord1, landlord2],
  );
  await pool.query(
    `INSERT INTO ops_staff (user_id, team) VALUES ($1, 'lead'), ($2, 'inspector')`,
    [opsLead, inspectorId],
  );

  semester = await seed(
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

  // Publish through the real ops path: version snapshot + verified flip + unit + beds.
  const published = await ops.publishListing(leadCtx(), {
    listingId,
    amenities: { water: true, power: true },
    description: 'Test listing',
    units: [{ label: 'Room 1A', capacity: 1, roomCategory: 'single', pricePerTermUgx: 800_000 }],
  });
  expect(published.listing.status).toBe('verified');
  const unitRes = await pool.query(`SELECT id FROM units WHERE property_id = $1`, [property]);
  unitId = unitRes.rows[0].id as string;
  const bedRes = await pool.query(`SELECT id FROM beds WHERE unit_id = $1`, [unitId]);
  bedId = bedRes.rows[0].id as string;
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

  it("publishing creates a bed per unit of capacity (bed-level inventory, §5)", async () => {
    const res = await pool.query(`SELECT label FROM beds WHERE unit_id = $1 ORDER BY label`, [unitId]);
    expect(res.rows.map((r) => r.label)).toEqual(['Bed 1']);
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

describe('reserve -> book -> move-in (bed-level state machine, §6-8)', () => {
  const KEY_1 = 'reserve-key-0000000001';

  it('creates a reserved bed with a 24h expiry, no payment involved', async () => {
    const reservation = await reservationsService.reserve(studentCtx(student1), {
      listingId,
      bedId,
      idempotencyKey: KEY_1,
    });
    expect(reservation.status).toBe('reserved');
    expect(reservation.reservedExpiresAt).not.toBeNull();
    expect(reservation.bookedAt).toBeNull();
  });

  it('replays the same idempotency key onto the same reservation', async () => {
    const first = await pool.query(`SELECT id FROM reservations WHERE idempotency_key = $1`, [KEY_1]);
    const replay = await reservationsService.reserve(studentCtx(student1), {
      listingId,
      bedId,
      idempotencyKey: KEY_1,
    });
    expect(replay.id).toBe(first.rows[0].id);
  });

  it('rejects a second live reservation on the same bed', async () => {
    await expect(
      reservationsService.reserve(studentCtx(student2), {
        listingId,
        bedId,
        idempotencyKey: 'reserve-key-0000000002',
      }),
    ).rejects.toThrow(/live reservation/i);
  });

  it("a different landlord cannot Book someone else's bed", async () => {
    const r = await pool.query(`SELECT id FROM reservations WHERE idempotency_key = $1`, [KEY_1]);
    await expect(
      reservationsService.book(landlordCtx(landlord2), { reservationId: r.rows[0].id as string }),
    ).rejects.toThrow(/permission/i);
  });

  it('the bed\'s landlord Books the reserved bed, recording an offline fee', async () => {
    const r = await pool.query(`SELECT id FROM reservations WHERE idempotency_key = $1`, [KEY_1]);
    const booked = (await reservationsService.book(landlordCtx(landlord1), {
      reservationId: r.rows[0].id as string,
      bookingFeeCollectedUgx: 50_000,
      paymentMethod: 'bank_transfer',
    }))!;
    expect(booked.status).toBe('booked');
    expect(booked.bookedBy).toBe(landlord1);
    expect(booked.reservedExpiresAt).toBeNull();
    expect(booked.bookingFeeCollectedUgx).toBe(50_000);
  });

  it('cannot Book a reservation that is already booked', async () => {
    const r = await pool.query(`SELECT id FROM reservations WHERE idempotency_key = $1`, [KEY_1]);
    await expect(
      reservationsService.book(landlordCtx(landlord1), { reservationId: r.rows[0].id as string }),
    ).rejects.toThrow(/cannot book/i);
  });

  it('confirms move-in by the student on the booked reservation, flipping to occupied', async () => {
    const r = await pool.query(`SELECT id FROM reservations WHERE idempotency_key = $1`, [KEY_1]);
    const moveIn = await reservationsService.confirmMoveIn(
      studentCtx(student1),
      r.rows[0].id as string,
    );
    expect(moveIn).toMatchObject({ confirmedByRole: 'student' });

    const status = await pool.query(`SELECT status FROM reservations WHERE id = $1`, [
      r.rows[0].id,
    ]);
    expect(status.rows[0].status).toBe('occupied');
  });

  it('cannot confirm move-in twice (already occupied, not booked)', async () => {
    const r = await pool.query(`SELECT id FROM reservations WHERE idempotency_key = $1`, [KEY_1]);
    await expect(
      reservationsService.confirmMoveIn(studentCtx(student1), r.rows[0].id as string),
    ).rejects.toThrow(/only a booked reservation/i);
  });

  it('the landlord can also confirm move-in (not just the student)', async () => {
    // A dedicated student, never reused after this test — moving into
    // 'occupied' on the default far-future semester would otherwise trip
    // the new occupancy-lock-in rule for every later reserve() call student2
    // makes in this file.
    const landlordMoveInStudent = await seed(
      `INSERT INTO users (phone, role, status) VALUES ('+256710000095', 'student', 'active') RETURNING id`,
    );
    await pool.query(`INSERT INTO students (user_id, university) VALUES ($1, 'MUK')`, [
      landlordMoveInStudent,
    ]);
    const { bedId: bed2 } = await seedUnitWithBed('Room 1B');
    const reserved = await reservationsService.reserve(studentCtx(landlordMoveInStudent), {
      listingId,
      bedId: bed2,
      idempotencyKey: 'reserve-key-landlord-movein',
    });
    const booked = (await reservationsService.book(landlordCtx(landlord1), {
      reservationId: reserved.id,
    }))!;
    const moveIn = await reservationsService.confirmMoveIn(landlordCtx(landlord1), booked.id);
    expect(moveIn).toMatchObject({ confirmedByRole: 'landlord' });
  });
});

describe('walk-in booking (Book directly on an Available bed, §7)', () => {
  it('a landlord can Book an available bed directly with no prior Reserve', async () => {
    const { bedId: bed3 } = await seedUnitWithBed('Room 1C');
    const booked = (await reservationsService.book(landlordCtx(landlord1), {
      bedId: bed3,
      studentPhone: '+256710000006', // student3
      depositCollectedUgx: 100_000,
      paymentMethod: 'mtn_momo',
    }))!;
    expect(booked.status).toBe('booked');
    expect(booked.studentId).toBe(student3);
    expect(booked.depositCollectedUgx).toBe(100_000);
  });

  it('rejects walk-in booking for a phone number with no student profile', async () => {
    const { bedId: bed4 } = await seedUnitWithBed('Room 1D');
    await expect(
      reservationsService.book(landlordCtx(landlord1), {
        bedId: bed4,
        studentPhone: '+256799999999',
      }),
    ).rejects.toThrow(/no student account/i);
  });
});

describe('release (landlord frees a Reserved or Booked bed, §15-16)', () => {
  it('releases a Reserved bed with a reason, no refund flagged when nothing was collected', async () => {
    const { bedId: bed5 } = await seedUnitWithBed('Room 2A');
    const reserved = await reservationsService.reserve(studentCtx(student2), {
      listingId,
      bedId: bed5,
      idempotencyKey: 'reserve-key-release-1',
    });
    const outcome = await reservationsService.release(landlordCtx(landlord1), reserved.id, {
      reason: 'Student never showed up',
      refundRequired: false,
    });
    expect(outcome).toEqual({ outcome: 'released' });

    const row = await pool.query(`SELECT status FROM reservations WHERE id = $1`, [reserved.id]);
    expect(row.rows[0].status).toBe('released');

    const release = await pool.query(
      `SELECT reason, refund_required FROM reservation_releases WHERE reservation_id = $1`,
      [reserved.id],
    );
    expect(release.rows[0]).toEqual({ reason: 'Student never showed up', refund_required: false });
  });

  it('releasing a Booked bed defaults refundRequired to true when money was collected', async () => {
    const { bedId: bed6 } = await seedUnitWithBed('Room 2B');
    const reserved = await reservationsService.reserve(studentCtx(student2), {
      listingId,
      bedId: bed6,
      idempotencyKey: 'reserve-key-release-2',
    });
    const booked = (await reservationsService.book(landlordCtx(landlord1), {
      reservationId: reserved.id,
      bookingFeeCollectedUgx: 20_000,
    }))!;
    // refundRequired deliberately omitted — testing the service's own
    // hadMoneyCollected default, not the zod-schema default (bypassed here).
    await reservationsService.release(landlordCtx(landlord1), booked.id, {
      reason: 'Property double-let by mistake',
    } as never);
    const release = await pool.query(
      `SELECT refund_required FROM reservation_releases WHERE reservation_id = $1`,
      [booked.id],
    );
    expect(release.rows[0].refund_required).toBe(true);
  });

  it('a different landlord cannot release a bed on someone else\'s property', async () => {
    const { bedId: bed7 } = await seedUnitWithBed('Room 2C');
    const reserved = await reservationsService.reserve(studentCtx(student2), {
      listingId,
      bedId: bed7,
      idempotencyKey: 'reserve-key-release-3',
    });
    await expect(
      reservationsService.release(landlordCtx(landlord2), reserved.id, {
        reason: 'attack',
        refundRequired: false,
      }),
    ).rejects.toThrow(/permission/i);
  });

  it('cannot release an already-released reservation', async () => {
    const { bedId: bed8 } = await seedUnitWithBed('Room 2D');
    const reserved = await reservationsService.reserve(studentCtx(student2), {
      listingId,
      bedId: bed8,
      idempotencyKey: 'reserve-key-release-4',
    });
    await reservationsService.release(landlordCtx(landlord1), reserved.id, {
      reason: 'first release',
      refundRequired: false,
    });
    await expect(
      reservationsService.release(landlordCtx(landlord1), reserved.id, {
        reason: 'second release',
        refundRequired: false,
      }),
    ).rejects.toThrow(/cannot release/i);
  });

  it('releasing a bed frees it for a new reservation', async () => {
    const { bedId: bed9 } = await seedUnitWithBed('Room 2E');
    const reserved = await reservationsService.reserve(studentCtx(student2), {
      listingId,
      bedId: bed9,
      idempotencyKey: 'reserve-key-release-5',
    });
    await reservationsService.release(landlordCtx(landlord1), reserved.id, {
      reason: 'freed up',
      refundRequired: false,
    });
    const rereserved = await reservationsService.reserve(studentCtx(student3), {
      listingId,
      bedId: bed9,
      idempotencyKey: 'reserve-key-release-5-again',
    });
    expect(rereserved.status).toBe('reserved');
  });
});

describe('3 active reservations per student, platform-wide (§12-13)', () => {
  it('allows exactly 3 concurrent reserved/booked reservations, rejects the 4th', async () => {
    // A fresh student with none of the above describe blocks' reservations.
    const freshStudent = await seed(
      `INSERT INTO users (phone, role, status) VALUES ('+256710000099', 'student', 'active') RETURNING id`,
    );
    await pool.query(`INSERT INTO students (user_id, university) VALUES ($1, 'MUK')`, [freshStudent]);
    const ctx = studentCtx(freshStudent);

    const [bedCap1, bedCap2, bedCap3, bedCap4] = await Promise.all([
      seedUnitWithBed('Cap 1'),
      seedUnitWithBed('Cap 2'),
      seedUnitWithBed('Cap 3'),
      seedUnitWithBed('Cap 4'),
    ]);

    for (const [i, bed] of [bedCap1, bedCap2, bedCap3].entries()) {
      const r = await reservationsService.reserve(ctx, {
        listingId,
        bedId: bed.bedId,
        idempotencyKey: `reserve-key-cap-${i}`,
      });
      expect(r.status).toBe('reserved');
    }

    await expect(
      reservationsService.reserve(ctx, {
        listingId,
        bedId: bedCap4.bedId,
        idempotencyKey: 'reserve-key-cap-3',
      }),
    ).rejects.toThrow(/3 active reservations/i);
  });

  it('a walk-in Book also counts against the platform-wide cap', async () => {
    const freshStudent = await seed(
      `INSERT INTO users (phone, role, status) VALUES ('+256710000098', 'student', 'active') RETURNING id`,
    );
    await pool.query(`INSERT INTO students (user_id, university) VALUES ($1, 'MUK')`, [freshStudent]);
    const phone = '+256710000098';

    const [bedWalk1, bedWalk2, bedWalk3, bedWalk4] = await Promise.all([
      seedUnitWithBed('Walk 1'),
      seedUnitWithBed('Walk 2'),
      seedUnitWithBed('Walk 3'),
      seedUnitWithBed('Walk 4'),
    ]);
    for (const bed of [bedWalk1, bedWalk2, bedWalk3]) {
      await reservationsService.book(landlordCtx(landlord1), {
        bedId: bed.bedId,
        studentPhone: phone,
      });
    }

    await expect(
      reservationsService.book(landlordCtx(landlord1), {
        bedId: bedWalk4.bedId,
        studentPhone: phone,
      }),
    ).rejects.toThrow(/3 active reservations/i);
  });
});

describe('cancel (student cancels their own Reserved bed, §6)', () => {
  it('lets a student cancel their own reserved bed', async () => {
    const { bedId: bedC1 } = await seedUnitWithBed('Cancel A');
    const reserved = await reservationsService.reserve(studentCtx(student2), {
      listingId,
      bedId: bedC1,
      idempotencyKey: 'reserve-key-cancel-1',
    });
    const result = await reservationsService.cancel(studentCtx(student2), reserved.id);
    expect(result).toEqual({ outcome: 'cancelled' });
  });

  it('a student cannot cancel a reservation that is not theirs', async () => {
    const { bedId: bedC2 } = await seedUnitWithBed('Cancel B');
    const reserved = await reservationsService.reserve(studentCtx(student2), {
      listingId,
      bedId: bedC2,
      idempotencyKey: 'reserve-key-cancel-2',
    });
    await expect(
      reservationsService.cancel(studentCtx(student3), reserved.id),
    ).rejects.toThrow(/not found/i);
  });

  it('a student cannot cancel a reservation once it is booked (only Release can free it)', async () => {
    const { bedId: bedC3 } = await seedUnitWithBed('Cancel C');
    const reserved = await reservationsService.reserve(studentCtx(student2), {
      listingId,
      bedId: bedC3,
      idempotencyKey: 'reserve-key-cancel-3',
    });
    await reservationsService.book(landlordCtx(landlord1), { reservationId: reserved.id });
    await expect(
      reservationsService.cancel(studentCtx(student2), reserved.id),
    ).rejects.toThrow(/cannot cancel/i);
  });
});

describe('occupancy lock-in: an occupied student can only rebook within 3 weeks of term end', () => {
  function isoDaysFromNow(days: number): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  /** A whole one-bed verified listing on a semester ending on `endsOn` —
   * isolated from the shared fixture listing so each test controls its own
   * term end date precisely. */
  async function seedListingEndingOn(endsOn: string): Promise<{ bedId: string; listingId: string }> {
    const semesterId = await seed(
      `INSERT INTO semesters (name, starts_on, ends_on, re_verification_window_starts_on)
       VALUES ('Lock-in test semester', '2026-01-01', $1, '2026-01-01') RETURNING id`,
      [endsOn],
    );
    const propertyId = await seed(
      `INSERT INTO properties (landlord_id, name, street_address, status, gps_lat, gps_lon, catchment)
       VALUES ($1, 'Lock-in Test Hostel', 'Wandegeya', 'active', 0.33, 32.57, 'MUK') RETURNING id`,
      [landlord1],
    );
    // enforce_listing_verification (0001) requires a lead-approved, complete-
    // checklist visit before a listing can be inserted/updated as 'verified'.
    await pool.query(
      `INSERT INTO verification_visits
         (property_id, inspector_id, checklist, client_idempotency_key, result, approved_by, approved_at, completed_at)
       VALUES ($1, $2, $3, $4, 'passed', $5, now(), now())`,
      [propertyId, inspectorId, JSON.stringify(FULL_CHECKLIST), `lockin-visit-${propertyId}`, opsLead],
    );
    const listingId = await seed(
      `INSERT INTO listings (property_id, semester_id, status) VALUES ($1, $2, 'verified') RETURNING id`,
      [propertyId, semesterId],
    );
    const versionId = await seed(
      `INSERT INTO listing_versions (listing_id, version_number, price_per_term_ugx, amenities, verified_at, verified_by)
       VALUES ($1, 1, 500000, '{}'::jsonb, now(), $2) RETURNING id`,
      [listingId, opsLead],
    );
    await pool.query(`UPDATE listings SET current_version_id = $1 WHERE id = $2`, [versionId, listingId]);
    const unitId = await seed(
      `INSERT INTO units (property_id, label, capacity, room_category) VALUES ($1, 'Room X', 1, 'single') RETURNING id`,
      [propertyId],
    );
    await pool.query(
      `INSERT INTO unit_semester_pricing (unit_id, semester_id, price_per_term_ugx) VALUES ($1, $2, 500000)`,
      [unitId, semesterId],
    );
    const bedId = await seed(`INSERT INTO beds (unit_id, label) VALUES ($1, 'Bed 1') RETURNING id`, [unitId]);
    return { bedId, listingId };
  }

  async function seedStudent(phone: string): Promise<string> {
    const id = await seed(
      `INSERT INTO users (phone, role, status) VALUES ($1, 'student', 'active') RETURNING id`,
      [phone],
    );
    await pool.query(`INSERT INTO students (user_id, university) VALUES ($1, 'MUK')`, [id]);
    return id;
  }

  it('blocks a new reservation while occupying a bed on a term ending far away', async () => {
    const student = await seedStudent('+256710000090');
    const { bedId: currentBed, listingId: currentListingId } = await seedListingEndingOn(isoDaysFromNow(60));
    const reserved = await reservationsService.reserve(studentCtx(student), {
      listingId: currentListingId,
      bedId: currentBed,
      idempotencyKey: 'reserve-key-lockin-1',
    });
    const booked = (await reservationsService.book(landlordCtx(landlord1), {
      reservationId: reserved.id,
    }))!;
    await reservationsService.confirmMoveIn(studentCtx(student), booked.id);

    const { bedId: nextBed } = await seedUnitWithBed('Lock-in Next A');
    await expect(
      reservationsService.reserve(studentCtx(student), {
        listingId,
        bedId: nextBed,
        idempotencyKey: 'reserve-key-lockin-2',
      }),
    ).rejects.toThrow(/already moved into a bed/i);
  });

  it('allows a new reservation once the occupied term is within 3 weeks of ending', async () => {
    const student = await seedStudent('+256710000091');
    const { bedId: currentBed, listingId: currentListingId } = await seedListingEndingOn(isoDaysFromNow(10));
    const reserved = await reservationsService.reserve(studentCtx(student), {
      listingId: currentListingId,
      bedId: currentBed,
      idempotencyKey: 'reserve-key-lockin-3',
    });
    const booked = (await reservationsService.book(landlordCtx(landlord1), {
      reservationId: reserved.id,
    }))!;
    await reservationsService.confirmMoveIn(studentCtx(student), booked.id);

    const { bedId: nextBed } = await seedUnitWithBed('Lock-in Next B');
    const next = await reservationsService.reserve(studentCtx(student), {
      listingId,
      bedId: nextBed,
      idempotencyKey: 'reserve-key-lockin-4',
    });
    expect(next.status).toBe('reserved');
  });

  it('a walk-in Book is also blocked by current occupancy on a far-away term', async () => {
    const student = await seedStudent('+256710000092');
    const { bedId: currentBed, listingId: currentListingId } = await seedListingEndingOn(isoDaysFromNow(90));
    const reserved = await reservationsService.reserve(studentCtx(student), {
      listingId: currentListingId,
      bedId: currentBed,
      idempotencyKey: 'reserve-key-lockin-5',
    });
    const booked = (await reservationsService.book(landlordCtx(landlord1), {
      reservationId: reserved.id,
    }))!;
    await reservationsService.confirmMoveIn(studentCtx(student), booked.id);

    const { bedId: nextBed } = await seedUnitWithBed('Lock-in Next C');
    await expect(
      reservationsService.book(landlordCtx(landlord1), {
        bedId: nextBed,
        studentPhone: '+256710000092',
      }),
    ).rejects.toThrow(/already moved into a bed/i);
  });
});

describe('reservation expiry (JobsRunner, 24h)', () => {
  // Dedicated students — student2/student3 accumulate leftover active
  // reservations from earlier describe blocks' rejection-path tests (a
  // reserve/book that a failed cancel/release never resolved), and this
  // block's own reserve() calls would otherwise trip the 3-active cap.
  let expireStudentA: string;
  let expireStudentB: string;

  beforeAll(async () => {
    expireStudentA = await seed(
      `INSERT INTO users (phone, role, status) VALUES ('+256710000097', 'student', 'active') RETURNING id`,
    );
    expireStudentB = await seed(
      `INSERT INTO users (phone, role, status) VALUES ('+256710000096', 'student', 'active') RETURNING id`,
    );
    await pool.query(
      `INSERT INTO students (user_id, university) VALUES ($1, 'MUK'), ($2, 'MUK')`,
      [expireStudentA, expireStudentB],
    );
  });

  it('a reserved bed past its expiry flips to expired', async () => {
    const { bedId: bedE1 } = await seedUnitWithBed('Expire A');
    const reserved = await reservationsService.reserve(studentCtx(expireStudentA), {
      listingId,
      bedId: bedE1,
      idempotencyKey: 'reserve-key-expire-1',
    });
    await pool.query(`UPDATE reservations SET reserved_expires_at = now() - interval '1 hour' WHERE id = $1`, [
      reserved.id,
    ]);
    await expireReservation(reserved.id);
    const row = await pool.query(`SELECT status FROM reservations WHERE id = $1`, [reserved.id]);
    expect(row.rows[0].status).toBe('expired');
  });

  it('a booked reservation is left untouched by expiry (never auto-expires once booked)', async () => {
    const { bedId: bedE2 } = await seedUnitWithBed('Expire B');
    const reserved = await reservationsService.reserve(studentCtx(expireStudentA), {
      listingId,
      bedId: bedE2,
      idempotencyKey: 'reserve-key-expire-2',
    });
    const booked = (await reservationsService.book(landlordCtx(landlord1), {
      reservationId: reserved.id,
    }))!;
    await expireReservation(booked.id);
    const row = await pool.query(`SELECT status FROM reservations WHERE id = $1`, [booked.id]);
    expect(row.rows[0].status).toBe('booked');
  });

  it('an expired bed can be reserved again', async () => {
    const { bedId: bedE3 } = await seedUnitWithBed('Expire C');
    const reserved = await reservationsService.reserve(studentCtx(expireStudentA), {
      listingId,
      bedId: bedE3,
      idempotencyKey: 'reserve-key-expire-3',
    });
    await pool.query(`UPDATE reservations SET reserved_expires_at = now() - interval '1 hour' WHERE id = $1`, [
      reserved.id,
    ]);
    await expireReservation(reserved.id);
    const rereserved = await reservationsService.reserve(studentCtx(expireStudentB), {
      listingId,
      bedId: bedE3,
      idempotencyKey: 'reserve-key-expire-3-again',
    });
    expect(rereserved.status).toBe('reserved');
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
