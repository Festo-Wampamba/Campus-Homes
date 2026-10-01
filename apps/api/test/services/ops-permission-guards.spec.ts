/**
 * Ops routes run AuthGuard → PermissionsGuard → RolesGuard. These tests run the
 * real guards against each route's real decorators, with the session access
 * resolved from the seeded role/permission matrix, so the matrix (not @Roles
 * alone) is what decides who reaches an ops handler.
 */
import { type CanActivate, type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { Pool } from 'pg';

import { RlsDb } from '../../src/db/db.module';
import { resolveAccountAccess } from '../../src/modules/auth/access-resolver';
import { AuthGuard, type AuthenticatedRequest } from '../../src/modules/auth/auth.guard';
import type { LogtoManagementClient } from '../../src/modules/auth/logto-management.client';
import { rlsCtx } from '../../src/modules/auth/roles';
import type { NotificationsService } from '../../src/modules/notifications/notifications.service';
import { AuditService } from '../../src/modules/ops/audit.service';
import { OpsController } from '../../src/modules/ops/ops.controller';
import { OpsService } from '../../src/modules/ops/ops.service';

// This suite TRUNCATEs users CASCADE, so it must never fall back to a default database.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
if (!TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL must be set to a disposable database; this suite truncates tables');
}

const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 5 });
const rlsDb = new RlsDb(pool);
const ops = new OpsService(rlsDb, new AuditService(rlsDb), {} as NotificationsService, {} as LogtoManagementClient);

let superAdmin: string;
let platformAdmin: string;
let lead: string;
let inspector: string;
let scopedLead: string;
let scopedPlatformAdmin: string;
let scopedInspector: string;
let kiuProperty: string;
let mukVisit: string;
let kiuVisit: string;
let semester: string;

type GuardClass = new (reflector: Reflector, rlsDb: RlsDb) => CanActivate;

async function seed(sql: string, params: unknown[] = []): Promise<string> {
  return (await pool.query(sql, params)).rows[0]?.id as string;
}

async function staffUser(email: string, role: string, scopeType: string, scopeId: string | null): Promise<string> {
  const id = await seed(`INSERT INTO users (email, role, status) VALUES ($1, 'admin', 'active') RETURNING id`, [email]);
  await pool.query(
    `INSERT INTO user_role_assignments (user_id, role_id, scope_type, scope_id, assigned_by, reason)
     SELECT $1, id, $3, $4, $1, 'ops guard test' FROM roles WHERE key = $2`,
    [id, role, scopeType, scopeId],
  );
  return id;
}

/** Runs the route's own guard chain (after authentication) for a freshly signed-in, MFA-verified user. */
async function guard(handler: keyof OpsController, userId: string) {
  const access = await resolveAccountAccess(rlsDb, userId, { authenticatedAt: new Date().toISOString(), mfaVerified: true });
  const req = { session: { user: { id: userId, status: 'active' }, access } } as unknown as AuthenticatedRequest;
  const ctx = {
    getHandler: () => OpsController.prototype[handler],
    getClass: () => OpsController,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  const guards = (Reflect.getMetadata(GUARDS_METADATA, OpsController) as unknown[])
    .filter((Guard) => Guard !== AuthGuard) as GuardClass[];
  for (const Guard of guards) {
    try {
      if (!(await new Guard(new Reflector(), rlsDb).canActivate(ctx))) return { allowed: false, req };
    } catch (error) {
      if (error instanceof ForbiddenException) return { allowed: false, req };
      throw error;
    }
  }
  return { allowed: true, req };
}

beforeAll(async () => {
  await pool.query('TRUNCATE users CASCADE');
  superAdmin = await staffUser('guard-super@example.test', 'super_admin', 'platform_wide', null);
  platformAdmin = await staffUser('guard-platform@example.test', 'platform_admin', 'platform_wide', null);
  lead = await staffUser('guard-lead@example.test', 'ops_lead', 'platform_wide', null);
  inspector = await staffUser('guard-inspector@example.test', 'ops_inspector', 'platform_wide', null);
  scopedLead = await staffUser('guard-scoped-lead@example.test', 'ops_lead', 'catchment', 'MUK');
  scopedPlatformAdmin = await staffUser('guard-scoped-platform@example.test', 'platform_admin', 'catchment', 'MUK');
  const landlord = await seed(`INSERT INTO users (email, role, status) VALUES ('guard-landlord@example.test', 'landlord', 'active') RETURNING id`);
  await pool.query(`INSERT INTO landlords (user_id, legal_name) VALUES ($1, 'Guard Landlord')`, [landlord]);
  kiuProperty = await seed(
    `INSERT INTO properties (landlord_id, name, street_address, status, catchment)
     VALUES ($1, 'KIU Hostel', 'Kansanga', 'active', 'KIU') RETURNING id`,
    [landlord],
  );
  semester = await seed(
    `INSERT INTO semesters (name, starts_on, ends_on, re_verification_window_starts_on)
     VALUES ('Guard term', '2026-08-01', '2026-12-15', '2026-11-15') RETURNING id`,
  );
  scopedInspector = await staffUser('guard-scoped-inspector@example.test', 'ops_inspector', 'catchment', 'MUK');
  await pool.query(`INSERT INTO ops_staff (user_id, team) VALUES ($1, 'inspector')`, [scopedInspector]);
  const mukProperty = await seed(
    `INSERT INTO properties (landlord_id, name, street_address, status, catchment)
     VALUES ($1, 'MUK Hostel', 'Kikoni', 'active', 'MUK') RETURNING id`,
    [landlord],
  );
  // Both visits are assigned to the scoped inspector, so only catchment scope separates them.
  const visit = `INSERT INTO verification_visits (property_id, inspector_id, client_idempotency_key)
    VALUES ($1, $2, $3) RETURNING id`;
  mukVisit = await seed(visit, [mukProperty, scopedInspector, 'guard-visit-muk']);
  kiuVisit = await seed(visit, [kiuProperty, scopedInspector, 'guard-visit-kiu']);
});

afterAll(async () => {
  await pool.end();
});

describe('listing publish', () => {
  it('refuses a platform_admin, whose seeded grants lack listings.publish', async () => {
    expect((await guard('publishListing', platformAdmin)).allowed).toBe(false);
  });

  it('admits a super_admin', async () => {
    expect((await guard('publishListing', superAdmin)).allowed).toBe(true);
  });

  it('admits a platform-wide ops_lead', async () => {
    expect((await guard('publishListing', lead)).allowed).toBe(true);
  });

  it('refuses an ops_lead once listings.publish is removed from the ops_lead role', async () => {
    const revoke = `DELETE FROM role_permissions WHERE role_id = (SELECT id FROM roles WHERE key = 'ops_lead')
      AND permission_id = (SELECT id FROM permissions WHERE key = 'listings.publish')`;
    await pool.query(revoke);
    try {
      expect((await guard('publishListing', lead)).allowed).toBe(false);
    } finally {
      await pool.query(
        `INSERT INTO role_permissions (role_id, permission_id)
         SELECT r.id, p.id FROM roles r, permissions p WHERE r.key = 'ops_lead' AND p.key = 'listings.publish'`,
      );
    }
  });
});

describe('catchment-scoped ops_lead', () => {
  it('passes the guards for a scope-aware key', async () => {
    expect((await guard('createDraftListing', scopedLead)).allowed).toBe(true);
  });

  it('is still refused by the service for a property outside its catchment', async () => {
    const { req } = await guard('createDraftListing', scopedLead);
    await expect(ops.createDraftListing(rlsCtx(req), { propertyId: kiuProperty, semesterId: semester }))
      .rejects.toMatchObject({ status: 403 });
  });

  it('is refused a platform-only key', async () => {
    expect((await guard('kycQueue', scopedLead)).allowed).toBe(false);
  });
});

describe('catchment-scoped platform_admin', () => {
  it('is refused an admin route even though its scoped grant passes the permission check', async () => {
    expect((await guard('propertyListings', scopedPlatformAdmin)).allowed).toBe(false);
  });
});

describe('ops workflows kept by 0058', () => {
  it('lets an ops_lead run the inspection sync for a visit it assigned itself', async () => {
    expect((await guard('syncVisit', lead)).allowed).toBe(true);
  });

  it("lets an ops_inspector set a unit's operational status", async () => {
    expect((await guard('updateUnitOperationalStatus', inspector)).allowed).toBe(true);
  });

  it('lets an ops_lead review landlord onboarding leads', async () => {
    expect((await guard('leadsQueue', lead)).allowed).toBe(true);
  });
});

describe('catchment-scoped ops_inspector reading visits', () => {
  it('is admitted to the verification queue', async () => {
    expect((await guard('queue', scopedInspector)).allowed).toBe(true);
  });

  it('sees no property outside its catchment in the verification queue', async () => {
    const { req } = await guard('queue', scopedInspector);
    const rows = (await ops.queue(rlsCtx(req))) as { id: string }[];
    expect(rows.map((row) => row.id)).not.toContain(kiuProperty);
  });

  it('is admitted to visit detail', async () => {
    expect((await guard('visitDetail', scopedInspector)).allowed).toBe(true);
  });

  it('reads the detail of a visit inside its catchment', async () => {
    const { req } = await guard('visitDetail', scopedInspector);
    await expect(ops.visitDetail(rlsCtx(req), mukVisit)).resolves.toHaveProperty('id', mukVisit);
  });

  it('gets not found for a visit outside its catchment', async () => {
    const { req } = await guard('visitDetail', scopedInspector);
    await expect(ops.visitDetail(rlsCtx(req), kiuVisit)).rejects.toMatchObject({ status: 404 });
  });
});
