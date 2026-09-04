/**
 * POST /chat/pusher/auth service-level test (brief §18): a participant gets
 * a signed subscription, a non-participant is rejected, and a malformed
 * channel name never reaches the DB lookup.
 */
import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { Pool } from 'pg';

import { NoopRealtime, SoketiRealtime } from '../../src/adapters/realtime.adapter';
import { RlsDb } from '../../src/db/db.module';
import type { LogtoManagementClient } from '../../src/modules/auth/logto-management.client';
import { AuditService } from '../../src/modules/ops/audit.service';
import { ChatService } from '../../src/modules/chat/chat.service';
import { OpsService } from '../../src/modules/ops/ops.service';
import type { NotificationsService } from '../../src/modules/notifications/notifications.service';
import type { RlsContext } from '../../src/db/rls-context';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://campushomes:campushomes_test@localhost:54329/campushomes_test';

const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 5 });
const rlsDb = new RlsDb(pool);
const audit = new AuditService(rlsDb);
// Only inviteLandlord() touches auth.api — unused by anything these tests exercise.
const ops = new OpsService(rlsDb, audit, {} as NotificationsService, {} as LogtoManagementClient);
// Local HMAC signing fixture only — pusher.authorizeChannel() never makes a
// network call, so these values are never sent anywhere.
const realtime = new SoketiRealtime({
  host: 'fake.soketi.test',
  port: 443,
  appId: 'fakeapp',
  key: 'fakekey',
  secret: 'fakesec',
});
const chat = new ChatService(rlsDb, realtime);
const noopChat = new ChatService(rlsDb, new NoopRealtime());

let participantStudent: string;
let otherStudent: string;
let landlord1: string;
let threadId: string;

const participantCtx = (): RlsContext => ({ userId: participantStudent, role: 'student' });
const otherCtx = (): RlsContext => ({ userId: otherStudent, role: 'student' });

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
     units, beds, reservations, chat_threads, chat_messages CASCADE`,
  );

  participantStudent = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000101', 'student', 'active') RETURNING id`,
  );
  otherStudent = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000102', 'student', 'active') RETURNING id`,
  );
  landlord1 = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000103', 'landlord', 'active') RETURNING id`,
  );
  const opsLead = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000104', 'ops_lead', 'active') RETURNING id`,
  );
  const inspector = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000105', 'ops_inspector', 'active') RETURNING id`,
  );
  await pool.query(`INSERT INTO students (user_id, university) VALUES ($1, 'MUK'), ($2, 'MUK')`, [
    participantStudent,
    otherStudent,
  ]);
  await pool.query(
    `INSERT INTO landlords (user_id, legal_name, kyc_status) VALUES ($1, 'LL Chat Test', 'verified')`,
    [landlord1],
  );
  await pool.query(`INSERT INTO ops_staff (user_id, team) VALUES ($1, 'lead'), ($2, 'inspector')`, [
    opsLead,
    inspector,
  ]);

  const semester = await seed(
    `INSERT INTO semesters (name, starts_on, ends_on, re_verification_window_starts_on)
     VALUES ('Chat Test Sem', '2026-08-01', '2026-12-15', '2026-11-15') RETURNING id`,
  );
  const property = await seed(
    `INSERT INTO properties (landlord_id, name, street_address, status, gps_lat, gps_lon, catchment)
     VALUES ($1, 'Chat Test Hostel', 'Wandegeya', 'active', 0.33, 32.57, 'MUK') RETURNING id`,
    [landlord1],
  );
  await pool.query(
    `INSERT INTO verification_visits
       (property_id, inspector_id, checklist, client_idempotency_key, result, approved_by, approved_at, completed_at)
     VALUES ($1, $2, $3, 'chat-test-visit-0001', 'passed', $4, now(), now())`,
    [property, inspector, JSON.stringify(FULL_CHECKLIST), opsLead],
  );
  const listingId = await seed(
    `INSERT INTO listings (property_id, semester_id, status) VALUES ($1, $2, 'pending_verification') RETURNING id`,
    [property, semester],
  );

  const published = await ops.publishListing(
    { userId: opsLead, role: 'ops_lead' },
    {
      listingId,
      amenities: { water: true, power: true },
      description: 'Chat test listing',
      units: [{ label: 'Room 1A', capacity: 1, roomCategory: 'single', pricePerTermUgx: 800_000 }],
    },
  );
  const unitRes = await pool.query(`SELECT id FROM units WHERE property_id = $1`, [property]);
  const unitId = unitRes.rows[0].id as string;
  const bedRes = await pool.query(`SELECT id FROM beds WHERE unit_id = $1`, [unitId]);
  const bedId = bedRes.rows[0].id as string;

  const reservationId = await seed(
    `INSERT INTO reservations (student_id, bed_id, listing_version_id, idempotency_key, price_per_term_ugx)
     VALUES ($1, $2, $3, 'chat-test-res-0001', 800000) RETURNING id`,
    [participantStudent, bedId, published.listing.currentVersionId],
  );

  const thread = await chat.ensureThread(participantCtx(), reservationId);
  threadId = (thread as { id: string }).id;
});

afterAll(async () => {
  await pool.end();
});

describe('ChatService.authorizeChannel', () => {
  it('signs the subscription for a thread participant', async () => {
    const result = await chat.authorizeChannel(participantCtx(), '111.111', `private-thread-${threadId}`);
    expect(result.auth).toMatch(/^fakekey:[0-9a-f]+$/);
  });

  it('rejects a caller who is not a thread participant', async () => {
    await expect(
      chat.authorizeChannel(otherCtx(), '111.112', `private-thread-${threadId}`),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a malformed channel name before any DB lookup', () => {
    // authorizeChannel is synchronous up to this point (regex check runs
    // before the async RLS-scoped DB lookup), so it throws immediately
    // instead of returning a rejected promise — assert with toThrow, not
    // .rejects, or the throw happens while evaluating the expect() argument.
    expect(() =>
      chat.authorizeChannel(participantCtx(), '111.113', 'private-thread-not-a-uuid'),
    ).toThrow(ForbiddenException);
  });

  it('returns 503 when Soketi is not configured', async () => {
    await expect(
      noopChat.authorizeChannel(participantCtx(), '111.114', `private-thread-${threadId}`),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
