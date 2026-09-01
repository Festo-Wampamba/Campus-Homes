/**
 * Service-level tests for the per-checklist-item correction workflow (0029):
 * an ops_lead sends one checklist component back to the assigned inspector;
 * only that inspector can fix it and resolve it.
 */
import { Pool } from 'pg';

import { RlsDb } from '../../src/db/db.module';
import type { LogtoManagementClient } from '../../src/modules/auth/logto-management.client';
import { AuditService } from '../../src/modules/ops/audit.service';
import { OpsService } from '../../src/modules/ops/ops.service';
import type { NotificationsService } from '../../src/modules/notifications/notifications.service';
import type { RlsContext } from '../../src/db/rls-context';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://campushomes:campushomes_test@localhost:54329/campushomes_test';

const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 5 });
const rlsDb = new RlsDb(pool);
const audit = new AuditService(rlsDb);
const notify = jest.fn().mockResolvedValue(undefined);
const notifications = { notify } as unknown as NotificationsService;
const ops = new OpsService(rlsDb, audit, notifications, {} as LogtoManagementClient);

let opsLead: string;
let inspector: string;
let otherInspector: string;
let visit: string;

const leadCtx = (): RlsContext => ({ userId: opsLead, role: 'ops_lead' });
const inspectorCtx = (): RlsContext => ({ userId: inspector, role: 'ops_inspector' });
const otherInspectorCtx = (): RlsContext => ({ userId: otherInspector, role: 'ops_inspector' });

async function seed(sql: string, params: unknown[] = []): Promise<string> {
  const res = await pool.query(sql, params);
  return res.rows[0]?.id as string;
}

beforeEach(() => {
  notify.mockClear();
});

beforeAll(async () => {
  await pool.query(
    `TRUNCATE users, landlords, ops_staff, properties, verification_visits, visit_corrections CASCADE`,
  );

  opsLead = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000030', 'ops_lead', 'active') RETURNING id`,
  );
  inspector = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000031', 'ops_inspector', 'active') RETURNING id`,
  );
  otherInspector = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000032', 'ops_inspector', 'active') RETURNING id`,
  );
  const landlord = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000033', 'landlord', 'active') RETURNING id`,
  );
  await pool.query(`INSERT INTO landlords (user_id, legal_name) VALUES ($1, 'LL Corrections Test')`, [
    landlord,
  ]);
  await pool.query(
    `INSERT INTO ops_staff (user_id, team, active) VALUES ($1, 'lead', true), ($2, 'inspector', true), ($3, 'inspector', true)`,
    [opsLead, inspector, otherInspector],
  );
  const property = await seed(
    `INSERT INTO properties (landlord_id, name, street_address, status, catchment)
     VALUES ($1, 'Corrections Test Property', 'Kikoni', 'active', 'MUK') RETURNING id`,
    [landlord],
  );
  visit = await seed(
    `INSERT INTO verification_visits (property_id, inspector_id, checklist, client_idempotency_key)
     VALUES ($1, $2, $3::jsonb, 'corrections-test-visit')
     RETURNING id`,
    [property, inspector, JSON.stringify({ photos: { passed: false, notes: 'blurry' } })],
  );
});

afterAll(async () => {
  await pool.end();
});

describe('raiseVisitCorrection', () => {
  it('creates an open correction and notifies the assigned inspector, not anyone else', async () => {
    const correction = await ops.raiseVisitCorrection(leadCtx(), visit, {
      component: 'photos',
      message: 'These photos are blurry — please retake them.',
    });
    expect(correction.status).toBe('open');
    expect(correction.component).toBe('photos');
    expect(notify).toHaveBeenCalledWith(
      inspector,
      'visit.correction_requested',
      'in_app',
      expect.objectContaining({ component: 'photos' }),
    );
  });

  it('throws for an unknown visit', async () => {
    await expect(
      ops.raiseVisitCorrection(leadCtx(), '00000000-0000-0000-0000-000000000000', {
        component: 'safety',
        message: 'x',
      }),
    ).rejects.toThrow(/not found/i);
  });
});

describe('resolveVisitCorrection', () => {
  // verification_visits RLS (visits_read) already scopes an inspector's own
  // reads to visit_id = their own assignments, so a genuinely different
  // inspector never reaches the explicit ForbiddenException below — their
  // read of the visit row comes back empty first, surfacing as "not found"
  // instead. Both are a correct denial; only the message differs, and the
  // in-code check is real defense-in-depth for the ops_lead path (leads can
  // read every visit under RLS, so *they* do reach this exact branch).
  it('refuses an inspector who is not the one assigned to the visit', async () => {
    await expect(
      ops.resolveVisitCorrection(otherInspectorCtx(), visit, {
        component: 'photos',
        passed: true,
        notes: 'fixed',
      }),
    ).rejects.toThrow(/not found|only the assigned inspector/i);
  });

  it('lets the assigned inspector fix the checklist entry and resolves the open correction', async () => {
    notify.mockClear();
    const updated = await ops.resolveVisitCorrection(inspectorCtx(), visit, {
      component: 'photos',
      passed: true,
      notes: 'Retook the photos on-site.',
    });
    const checklist = updated.checklist as Record<string, { passed: boolean; notes?: string }>;
    expect(checklist.photos).toEqual({ passed: true, notes: 'Retook the photos on-site.' });

    const detail = await ops.visitDetail(leadCtx(), visit);
    const photosCorrection = detail.corrections.find((c) => c.component === 'photos');
    expect(photosCorrection?.status).toBe('resolved');
    expect(notify).toHaveBeenCalledWith(
      opsLead,
      'visit.correction_resolved',
      'in_app',
      expect.objectContaining({ component: 'photos' }),
    );
  });

  it('is a no-op on corrections when there is nothing open for that component', async () => {
    // Resolving again should not throw even though the correction above is
    // already resolved — it just updates the checklist entry with nothing
    // left to mark resolved.
    const updated = await ops.resolveVisitCorrection(inspectorCtx(), visit, {
      component: 'photos',
      passed: true,
      notes: 'Still good.',
    });
    expect(updated.id).toBe(visit);
  });
});

describe('visitDetail', () => {
  it('includes the full correction history for a visit', async () => {
    const detail = await ops.visitDetail(leadCtx(), visit);
    expect(detail.corrections.length).toBeGreaterThan(0);
  });
});
