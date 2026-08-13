/**
 * Service-level tests for the Phase 5 ops-facing lookups (§9): inspector
 * picker, an inspector's own visit queue, single-visit review, and the
 * property→listing lookup that links visit approval to publish.
 */
import { Pool } from 'pg';

import type { VerificationChecklist } from '@campushomes/shared';

import { RlsDb } from '../../src/db/db.module';
import { AuditService } from '../../src/modules/ops/audit.service';
import { OpsService } from '../../src/modules/ops/ops.service';
import type { RlsContext } from '../../src/db/rls-context';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://campushomes:campushomes_test@localhost:54329/campushomes_test';

const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 5 });
const rlsDb = new RlsDb(pool);
const audit = new AuditService(rlsDb);
const ops = new OpsService(rlsDb, audit);

let opsLead: string;
let inspectorActive: string;
let inspectorInactive: string;
let propertyA: string;
let propertyB: string;
let visitA: string;
let approvedVisitA: string;
let pendingListingA: string;

const leadCtx = (): RlsContext => ({ userId: opsLead, role: 'ops_lead' });
const inspectorActiveCtx = (): RlsContext => ({
  userId: inspectorActive,
  role: 'ops_inspector',
});

async function seed(sql: string, params: unknown[] = []): Promise<string> {
  const res = await pool.query(sql, params);
  return res.rows[0]?.id as string;
}

beforeAll(async () => {
  await pool.query(
    `TRUNCATE users, students, landlords, ops_staff, semesters, properties,
     verification_visits, listings CASCADE`,
  );

  opsLead = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000010', 'ops_lead', 'active') RETURNING id`,
  );
  inspectorActive = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000011', 'ops_inspector', 'active') RETURNING id`,
  );
  inspectorInactive = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000012', 'ops_inspector', 'active') RETURNING id`,
  );
  const landlord = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000013', 'landlord', 'active') RETURNING id`,
  );
  await pool.query(
    `INSERT INTO landlords (user_id, legal_name) VALUES ($1, 'LL Directory Test')`,
    [landlord],
  );
  await pool.query(
    `INSERT INTO ops_staff (user_id, team, active) VALUES ($1, 'lead', true), ($2, 'inspector', true), ($3, 'inspector', false)`,
    [opsLead, inspectorActive, inspectorInactive],
  );

  const semester = await seed(
    `INSERT INTO semesters (name, starts_on, ends_on, re_verification_window_starts_on)
     VALUES ('Sem Directory Test', '2026-08-01', '2026-12-15', '2026-11-15') RETURNING id`,
  );
  propertyA = await seed(
    `INSERT INTO properties (landlord_id, name, street_address, status, catchment)
     VALUES ($1, 'Property A', 'Kikoni', 'active', 'MUK') RETURNING id`,
    [landlord],
  );
  propertyB = await seed(
    `INSERT INTO properties (landlord_id, name, street_address, status, catchment)
     VALUES ($1, 'Property B', 'Wandegeya', 'active', 'MUK') RETURNING id`,
    [landlord],
  );
  const priorSemester = await seed(
    `INSERT INTO semesters (name, starts_on, ends_on, re_verification_window_starts_on)
     VALUES ('Sem Directory Test — Prior', '2026-01-01', '2026-05-15', '2026-04-15') RETURNING id`,
  );
  // The 6-component-checklist trigger requires a lead-approved, fully-passed
  // visit to exist before a listing can be inserted as 'verified'.
  const fullChecklist = JSON.stringify(
    Object.fromEntries(
      ['location_gps', 'rooms_capacity', 'amenities', 'photos', 'landlord_identity', 'safety'].map(
        (c) => [c, { passed: true }],
      ),
    ),
  );
  approvedVisitA = await seed(
    `INSERT INTO verification_visits
       (property_id, inspector_id, checklist, client_idempotency_key, result, approved_by, approved_at)
     VALUES ($1, $2, $3, 'directory-test-visit-prior-verified', 'passed', $4, now()) RETURNING id`,
    [propertyA, inspectorActive, fullChecklist, opsLead],
  );
  // A prior-semester listing already verified — re-verification means a
  // property can carry more than one listing row over time; propertyListings
  // must not surface this one as a publish target.
  await seed(
    `INSERT INTO listings (property_id, semester_id, status) VALUES ($1, $2, 'verified') RETURNING id`,
    [propertyA, priorSemester],
  );
  pendingListingA = await seed(
    `INSERT INTO listings (property_id, semester_id, status) VALUES ($1, $2, 'pending_verification') RETURNING id`,
    [propertyA, semester],
  );
  visitA = await seed(
    `INSERT INTO verification_visits (property_id, inspector_id, checklist, client_idempotency_key, result)
     VALUES ($1, $2, $3, 'directory-test-visit-a', 'passed') RETURNING id`,
    [propertyA, inspectorActive, JSON.stringify({ location_gps: { passed: true } })],
  );
  await seed(
    `INSERT INTO verification_visits (property_id, inspector_id, client_idempotency_key)
     VALUES ($1, $2, 'directory-test-visit-b') RETURNING id`,
    [propertyB, inspectorInactive],
  );
});

afterAll(async () => {
  await pool.end();
});

describe('listInspectors', () => {
  it('returns only active inspectors, not the inactive one', async () => {
    const rows = await ops.listInspectors(leadCtx());
    expect(rows.map((r) => r.id).sort()).toEqual([inspectorActive].sort());
  });
});

describe('myVisits', () => {
  it("returns only the calling inspector's own unapproved visits", async () => {
    const rows = (await ops.myVisits(inspectorActiveCtx())) as Array<{ visit_id: string }>;
    expect(rows.map((r) => r.visit_id)).toEqual([visitA]);
  });
});

describe('visitDetail', () => {
  it('returns the full visit row including checklist', async () => {
    const visit = await ops.visitDetail(leadCtx(), visitA);
    const checklist = visit.checklist as VerificationChecklist;
    expect({
      id: visit.id,
      result: visit.result,
      checklistPassed: checklist.location_gps?.passed,
    }).toEqual({ id: visitA, result: 'passed', checklistPassed: true });
  });

  it('throws for an unknown visit id', async () => {
    await expect(
      ops.visitDetail(leadCtx(), '00000000-0000-0000-0000-000000000000'),
    ).rejects.toThrow(/not found/i);
  });
});

describe('propertyListings', () => {
  it("returns only property A's pending listing, excluding its already-verified prior-semester one", async () => {
    const rows = await ops.propertyListings(leadCtx(), propertyA);
    expect(rows.map((r) => ({ id: r.id, status: r.status }))).toEqual([
      { id: pendingListingA, status: 'pending_verification' },
    ]);
  });

  it('returns empty for a property with no listing', async () => {
    const rows = await ops.propertyListings(leadCtx(), propertyB);
    expect(rows).toEqual([]);
  });
});

// Regression coverage for the "approval disappears after logout/login" bug:
// myVisits() correctly drops an approved visit from the inspector's queue
// (it's no longer a to-do item), but nothing surfaced it anywhere else —
// myVisitHistory() is the reviewed half of the same query.
describe('myVisitHistory', () => {
  it("returns only the calling inspector's own approved visits", async () => {
    const rows = (await ops.myVisitHistory(inspectorActiveCtx())) as Array<{
      visit_id: string;
      result: string;
    }>;
    // Seeded in beforeAll: the prior-verified visit on property A is the
    // only approved one belonging to inspectorActive — visitA (passed, but
    // not yet approved) and the inspectorInactive visit on property B must
    // not appear here.
    expect(rows.map((r) => r.visit_id)).toEqual([approvedVisitA]);
    expect(rows[0]?.result).toBe('passed');
  });
});

// Regression coverage for the resubmission-overwrite gap found alongside the
// same bug: a device with no local draft (or a malicious replay) could
// otherwise silently overwrite an already-approved visit's checklist/result
// with a brand-new clientIdempotencyKey, since the idempotency check only
// catches a *replay* of the same submission, not a fresh one.
describe('syncVisit', () => {
  it('rejects a resubmission of an already-approved visit', async () => {
    await expect(
      ops.syncVisit(inspectorActiveCtx(), {
        clientIdempotencyKey: 'directory-test-resubmit-attempt',
        visitId: approvedVisitA,
        checklist: { location_gps: { passed: true } } as unknown as VerificationChecklist,
        visitGpsLat: 0.33,
        visitGpsLon: 32.57,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        result: 'passed',
        photoStorageKeys: [],
      }),
    ).rejects.toThrow(/already been approved/i);
  });
});
