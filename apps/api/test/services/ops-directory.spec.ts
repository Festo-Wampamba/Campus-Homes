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
let propertyC: string;
let propertyD: string;
let visitA: string;
let approvedVisitA: string;
let pendingListingA: string;
let semester: string;
let priorSemester: string;

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

  semester = await seed(
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
  priorSemester = await seed(
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

  // propertyC: latest (only) visit failed — must stay visible to the lead
  // so a re-visit can be scheduled, not vanish from every ops screen.
  propertyC = await seed(
    `INSERT INTO properties (landlord_id, name, street_address, status, catchment)
     VALUES ($1, 'Property C', 'Ntinda', 'active', 'MUK') RETURNING id`,
    [landlord],
  );
  // Attributed to inspectorInactive, not inspectorActive — myVisits/
  // myVisitHistory assert exact equality against inspectorActive's own rows
  // elsewhere in this file, and this fixture only needs to exist for
  // queue(), not for any inspector-scoped read.
  await seed(
    `INSERT INTO verification_visits
       (property_id, inspector_id, checklist, client_idempotency_key, result, failure_reason)
     VALUES ($1, $2, $3, 'directory-test-visit-c-failed', 'failed', 'Rooms did not match listing') RETURNING id`,
    [propertyC, inspectorInactive, JSON.stringify({ rooms_capacity: { passed: false } })],
  );

  // propertyD: latest visit passed and already lead-approved — fully
  // resolved, so it must NOT reappear in the queue.
  propertyD = await seed(
    `INSERT INTO properties (landlord_id, name, street_address, status, catchment)
     VALUES ($1, 'Property D', 'Kamwokya', 'active', 'MUK') RETURNING id`,
    [landlord],
  );
  await seed(
    `INSERT INTO verification_visits
       (property_id, inspector_id, checklist, client_idempotency_key, result, approved_by, approved_at)
     VALUES ($1, $2, $3, 'directory-test-visit-d-approved', 'passed', $4, now()) RETURNING id`,
    [propertyD, inspectorInactive, fullChecklist, opsLead],
  );
});

afterAll(async () => {
  await pool.end();
});

describe('queue', () => {
  it('surfaces pending, unapproved-passed, and failed visits, but not a fully-approved one', async () => {
    const rows = (await ops.queue(leadCtx())) as Array<{ id: string; result: string | null }>;
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.has(propertyA)).toBe(true); // latest visit: passed, unapproved
    expect(byId.get(propertyA)?.result).toBe('passed');
    expect(byId.has(propertyB)).toBe(true); // latest visit: pending
    expect(byId.get(propertyB)?.result).toBe('pending');
    expect(byId.has(propertyC)).toBe(true); // latest visit: failed
    expect(byId.get(propertyC)?.result).toBe('failed');
    expect(byId.has(propertyD)).toBe(false); // latest visit: passed and approved
  });
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

describe('publishableSemesters', () => {
  it('offers every applicable semester for a property with no listing yet', async () => {
    const rows = (await ops.publishableSemesters(leadCtx(), propertyB)) as Array<{ id: string }>;
    expect(rows.map((r) => r.id)).toEqual([semester, priorSemester]);
  });

  it('excludes semesters the property already has a listing for', async () => {
    const rows = await ops.publishableSemesters(leadCtx(), propertyA);
    expect(rows).toEqual([]);
  });
});

describe('createDraftListing', () => {
  it('creates a draft listing and is idempotent on the property+semester unique index', async () => {
    const first = await ops.createDraftListing(leadCtx(), {
      propertyId: propertyB,
      semesterId: semester,
    });
    const second = await ops.createDraftListing(leadCtx(), {
      propertyId: propertyB,
      semesterId: semester,
    });
    expect({ status: first.status, sameRow: first.id === second.id }).toEqual({
      status: 'draft',
      sameRow: true,
    });
  });

  it('drops a semester from the publishable set once its listing exists', async () => {
    const rows = (await ops.publishableSemesters(leadCtx(), propertyB)) as Array<{ id: string }>;
    expect(rows.map((r) => r.id)).toEqual([priorSemester]);
  });

  it('refuses when the property is already verified for that semester', async () => {
    await expect(
      ops.createDraftListing(leadCtx(), { propertyId: propertyA, semesterId: priorSemester }),
    ).rejects.toThrow(/already verified/i);
  });

  it('refuses an archived semester even if the picker offered it before archival', async () => {
    const archived = await seed(
      `INSERT INTO semesters (name, starts_on, ends_on, re_verification_window_starts_on, archived_at)
       VALUES ('Sem Archived', '2026-08-01', '2026-12-15', '2026-11-15', now()) RETURNING id`,
    );
    await expect(
      ops.createDraftListing(leadCtx(), { propertyId: propertyB, semesterId: archived }),
    ).rejects.toThrow(/active semester/i);
  });

  it("refuses a semester scoped to a different university than the property's catchment", async () => {
    const otherUni = await seed(
      `INSERT INTO semesters (name, university, starts_on, ends_on, re_verification_window_starts_on)
       VALUES ('Sem KYU', 'KYU', '2026-08-01', '2026-12-15', '2026-11-15') RETURNING id`,
    );
    await expect(
      ops.createDraftListing(leadCtx(), { propertyId: propertyB, semesterId: otherUni }),
    ).rejects.toThrow(/active semester/i);
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
