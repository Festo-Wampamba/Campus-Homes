/**
 * scheduleVisit hardening: an Ops Lead assigning an Inspector must notify that
 * inspector, must be idempotent against a double-submit, and must refuse an
 * inactive inspector. RLS already scopes the property to the lead's catchment
 * (visits_scoped_lead_insert, 0035); these tests cover the service-level
 * guarantees layered on top.
 */
import { BadRequestException } from '@nestjs/common';
import { Pool } from 'pg';

import type { MessagingAdapter } from '../../src/adapters/messaging.adapter';
import { RlsDb } from '../../src/db/db.module';
import type { LogtoManagementClient } from '../../src/modules/auth/logto-management.client';
import { AuditService } from '../../src/modules/ops/audit.service';
import { NotificationsService } from '../../src/modules/notifications/notifications.service';
import { OpsService } from '../../src/modules/ops/ops.service';
import type { RlsContext } from '../../src/db/rls-context';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://campushomes:campushomes_test@localhost:54329/campushomes_test';

const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 5 });
const rlsDb = new RlsDb(pool);
const audit = new AuditService(rlsDb);
const sentSms: Array<{ to: string; body: string }> = [];
const messaging = {
  sendSms: async (to: string, body: string) => {
    sentSms.push({ to, body });
  },
} as unknown as MessagingAdapter;
const notifications = new NotificationsService(rlsDb, messaging);
const ops = new OpsService(rlsDb, audit, notifications, {} as LogtoManagementClient);

let opsLead: string;
let inspector: string;
let inspectorInactive: string;
let property: string;

async function seed(sql: string, params: unknown[] = []): Promise<string> {
  return (await pool.query(sql, params)).rows[0]?.id as string;
}

const leadCtx = (): RlsContext => ({ userId: opsLead, role: 'ops_lead', mfaVerified: true });
const scheduledAt = '2026-10-01T09:00:00.000Z';

beforeAll(async () => {
  await pool.query(
    `TRUNCATE users, ops_staff, user_role_assignments, properties, verification_visits, notifications CASCADE`,
  );

  opsLead = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000300', 'ops_lead', 'active') RETURNING id`,
  );
  inspector = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000301', 'ops_inspector', 'active') RETURNING id`,
  );
  inspectorInactive = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000302', 'ops_inspector', 'active') RETURNING id`,
  );
  await pool.query(
    `INSERT INTO ops_staff (user_id, team, active) VALUES ($1, 'lead', true), ($2, 'inspector', true), ($3, 'inspector', false)`,
    [opsLead, inspector, inspectorInactive],
  );
  await pool.query(
    `INSERT INTO user_role_assignments (user_id, role_id, scope_type, scope_id, assigned_by, reason)
     SELECT $1, id, 'platform_wide', NULL, $1, 'test fixture' FROM roles WHERE key = 'ops_lead'`,
    [opsLead],
  );
  const landlord = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000303', 'landlord', 'active') RETURNING id`,
  );
  await pool.query(
    `INSERT INTO landlords (user_id, legal_name, kyc_status) VALUES ($1, 'Assign LL', 'verified')`,
    [landlord],
  );
  property = await seed(
    `INSERT INTO properties (landlord_id, name, street_address, status, catchment)
     VALUES ($1, 'Assign Test Hostel', 'Kikoni', 'active', 'MUK') RETURNING id`,
    [landlord],
  );
});

afterAll(async () => {
  await pool.end();
});

describe('scheduleVisit assignment hardening', () => {
  it('notifies the assigned inspector', async () => {
    await ops.scheduleVisit(leadCtx(), { propertyId: property, inspectorId: inspector, scheduledAt });
    const rows = (
      await pool.query<{ count: string }>(
        `SELECT count(*) AS count FROM notifications WHERE user_id = $1 AND template_key = 'visit.assigned'`,
        [inspector],
      )
    ).rows;
    expect(Number(rows[0]!.count)).toBe(1);
  });

  it('is idempotent — a repeated identical assignment creates no second visit or notification', async () => {
    const first = await ops.scheduleVisit(leadCtx(), {
      propertyId: property,
      inspectorId: inspector,
      scheduledAt: '2026-10-02T09:00:00.000Z',
    });
    const second = await ops.scheduleVisit(leadCtx(), {
      propertyId: property,
      inspectorId: inspector,
      scheduledAt: '2026-10-02T09:00:00.000Z',
    });
    expect(second.id).toBe(first.id);

    const visits = await pool.query(
      `SELECT id FROM verification_visits WHERE property_id = $1 AND scheduled_at = $2`,
      [property, '2026-10-02T09:00:00.000Z'],
    );
    const notifs = await pool.query(
      `SELECT id FROM notifications WHERE user_id = $1 AND template_key = 'visit.assigned'
         AND payload->>'visitId' = $2`,
      [inspector, first.id],
    );
    expect(visits.rowCount).toBe(1);
    expect(notifs.rowCount).toBe(1);
  });

  it('refuses to assign an inactive inspector', async () => {
    await expect(
      ops.scheduleVisit(leadCtx(), {
        propertyId: property,
        inspectorId: inspectorInactive,
        scheduledAt: '2026-10-03T09:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
