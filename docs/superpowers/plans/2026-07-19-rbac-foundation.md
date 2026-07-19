# RBAC Foundation (Phase A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a data-driven RBAC layer (7 staff roles, resource.action permissions, catchment/platform-wide scoping, separation-of-duty) on top of the existing 5-value `app.user_role` DB enum, with a new staff-management API surface, without touching the locked RLS migration or the existing Ops module.

**Architecture:** New Drizzle tables (`roles`, `permissions`, `role_permissions`, `user_role_assignments`, `approval_requests`), all `service_role`-only under RLS (same posture as `accounts`/`verifications`). A `PermissionsGuard` + `@RequirePermission()` decorator (mirrors the existing `RolesGuard`/`@Roles()` pattern) does a per-request DB lookup — not session-baked — so revocation is immediate. A new `StaffModule` exposes 6 endpoints under `/api/v1/admin` for inviting staff, listing them, deactivating them, and granting/revoking roles.

**Tech Stack:** NestJS 11, Drizzle ORM (`drizzle-orm/pg-core`), NeonDB Postgres, nestjs-zod, Jest (`--runInBand` against the docker test DB), pnpm workspaces.

## Global Constraints

- Use `pnpm`, not `npm`, for every command.
- Run everything under Node 24 (`nvm use 24` if not already active).
- Migrations are forward-only — this phase adds `apps/api/migrations/0003_rbac.sql` only. Never edit `0000`/`0001`/`0002`.
- `apps/api/migrations/0001_rls_hardening.sql` and its 16 RLS tests are locked — no edits.
- Existing Ops module endpoints (`apps/api/src/modules/ops/`) are not touched or retrofitted.
- Every new table gets `svc_all` RLS + a proof test in `apps/api/test/rls/rls.spec.ts` (CLAUDE.md: "Any new table ⇒ new policies in a new migration ⇒ new tests in this suite. No exceptions.").
- Full verification gate: `pnpm lint && pnpm typecheck && pnpm test` green at root. RLS/service tests need the docker test DB up: `docker compose -f apps/api/docker-compose.test.yml up -d --wait` (already running locally), then `DATABASE_URL=postgresql://campushomes:campushomes_test@localhost:54329/campushomes_test pnpm --filter @campushomes/api db:migrate`.
- Spec: `docs/superpowers/specs/2026-07-19-rbac-foundation-design.md` — read it for the full rationale behind every decision below.

---

### Task 1: RBAC schema + migration

**Files:**
- Create: `apps/api/src/db/schema/rbac.ts`
- Modify: `apps/api/src/db/schema/index.ts`
- Create (via `db:generate`, then hand-edited): `apps/api/migrations/0003_rbac.sql`
- Modify: `apps/api/migrations/meta/_journal.json`

**Interfaces:**
- Produces: Drizzle tables `roles`, `permissions`, `rolePermissions`, `userRoleAssignments`, `approvalRequests` (exported from `../../db/schema`), each with the exact column names below — later tasks import these directly.
- Produces (DB): 7 seeded rows in `roles.key`, 63 seeded rows in `permissions.key`, and the full `role_permissions` grant matrix — later tasks (`PermissionsGuard`, `StaffService`, tests) query these by `key` string, not by hardcoded UUID.

- [ ] **Step 1: Write the schema file**

```typescript
// apps/api/src/db/schema/rbac.ts
import { sql } from 'drizzle-orm';
import {
  boolean,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { users } from './identity';

export const roles = pgTable('roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  isSystem: boolean('is_system').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const permissions = pgTable('permissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(), // 'resource.action', e.g. 'kyc_documents.read'
  description: text('description').notNull(),
  requiresStepUp: boolean('requires_step_up').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })],
);

export const userRoleAssignments = pgTable(
  'user_role_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'restrict' }),
    // 'platform_wide' | 'catchment' — free-form, not a pgEnum: adding a scope
    // type later (university/region/assigned_case/...) needs no migration.
    scopeType: text('scope_type').notNull(),
    scopeId: text('scope_id'), // catchment value when scopeType='catchment', else null
    validFrom: timestamp('valid_from', { withTimezone: true }).notNull().defaultNow(),
    validUntil: timestamp('valid_until', { withTimezone: true }),
    assignedBy: uuid('assigned_by')
      .notNull()
      .references(() => users.id),
    reason: text('reason').notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedBy: uuid('revoked_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('user_role_assignments_active_uk')
      .on(t.userId, t.roleId, t.scopeType, t.scopeId)
      .where(sql`revoked_at IS NULL`),
  ],
);

// Schema only, no consumer yet in this phase — see design doc "Explicitly deferred".
export const approvalRequests = pgTable('approval_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  requestType: text('request_type').notNull(),
  requestedBy: uuid('requested_by')
    .notNull()
    .references(() => users.id),
  targetType: text('target_type').notNull(),
  targetId: uuid('target_id'),
  payload: jsonb('payload').notNull().default({}),
  status: text('status').notNull().default('pending'), // 'pending' | 'approved' | 'rejected'
  decidedBy: uuid('decided_by').references(() => users.id),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  reason: text('reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 2: Export it from the schema barrel**

Add one line to `apps/api/src/db/schema/index.ts`:

```typescript
export * from './enums';
export * from './identity';
export * from './property';
export * from './listing';
export * from './reservation';
export * from './trust';
export * from './comms';
export * from './rbac';
```

- [ ] **Step 3: Generate the migration**

Run (from `apps/api/`):
```bash
cd apps/api && pnpm db:generate
```
Expected: a new file `migrations/0003_<random_name>.sql` containing `CREATE TABLE` statements for `roles`, `permissions`, `role_permissions`, `user_role_assignments`, `approval_requests` plus the partial unique index and FKs, and a new entry appended to `migrations/meta/_journal.json` with `"idx": 3` and a random `"tag"`.

- [ ] **Step 4: Rename the migration and fix the journal tag**

```bash
mv apps/api/migrations/0003_<random_name>.sql apps/api/migrations/0003_rbac.sql
```
Edit `apps/api/migrations/meta/_journal.json`: change the `idx: 3` entry's `"tag"` value from `"0003_<random_name>"` to `"0003_rbac"` (must match the new filename stem exactly, same convention as `0001_rls_hardening` and `0002_better_auth`).

- [ ] **Step 5: Append RLS, grants, and seed data to the migration**

Append to the end of `apps/api/migrations/0003_rbac.sql` (after the generated DDL, following the exact `0002_better_auth.sql` convention — hand-written SQL after generated DDL, `--> statement-breakpoint` between every statement):

```sql

-- ── RLS: RBAC tables are service-role only; fine-grained enforcement is the
-- application-layer PermissionsGuard, same posture as accounts/verifications
-- (0002) — see docs/superpowers/specs/2026-07-19-rbac-foundation-design.md
-- "Enforcement". ────────────────────────────────────────────────────────────

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE user_role_assignments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY svc_all ON roles FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY svc_all ON permissions FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY svc_all ON role_permissions FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY svc_all ON user_role_assignments FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
CREATE POLICY svc_all ON approval_requests FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint

-- ── Grants ───────────────────────────────────────────────────────────────────
-- 0001's blanket GRANT predates these tables (Postgres GRANT ON ALL TABLES
-- only covers tables that exist at execution time) — same gap 0002 hit.

GRANT SELECT, INSERT, UPDATE ON roles, permissions, role_permissions, user_role_assignments, approval_requests TO app_user;
--> statement-breakpoint

-- ── Seed: 7 MVP roles ────────────────────────────────────────────────────────

INSERT INTO roles (key, name, description) VALUES
  ('super_admin', 'Super Admin', 'Emergency ownership and top-level governance. Max 2 active accounts recommended.'),
  ('platform_admin', 'Platform Admin', 'Ordinary platform configuration and internal staff access.'),
  ('ops_lead', 'Ops Lead', 'Landlord verification, inspections, and listing approval.'),
  ('ops_inspector', 'Ops Inspector', 'Conducts assigned property inspection visits.'),
  ('finance_admin', 'Finance Admin', 'Financial operations: payments, refunds, reconciliation.'),
  ('support_admin', 'Support Admin', 'Student/landlord support without elevated system power.'),
  ('auditor', 'Auditor', 'Read-only compliance and access review.');
--> statement-breakpoint

-- ── Seed: full permission catalog ───────────────────────────────────────────
-- Data only — enforcement this phase covers only the staff.*/roles.*/
-- audit.read subset via the new StaffModule; the rest is correct-but-inert
-- until a later phase retrofits its module (design doc "Explicitly deferred").

INSERT INTO permissions (key, description, requires_step_up) VALUES
  ('staff.read', 'View staff accounts', false),
  ('staff.invite', 'Invite a new staff account', false),
  ('staff.update', 'Update a staff account', false),
  ('staff.deactivate', 'Deactivate a staff account', true),
  ('roles.read', 'View roles and assignments', false),
  ('roles.assign', 'Assign a role to a staff member', true),
  ('roles.revoke', 'Revoke a role assignment', true),
  ('roles.manage_super_admin', 'Grant or revoke the super_admin role', true),
  ('students.read', 'View student records', false),
  ('students.verify', 'Verify a student record', false),
  ('students.flag', 'Flag a student', false),
  ('students.suspend', 'Suspend a student account', true),
  ('landlords.read', 'View landlord records', false),
  ('landlords.review_kyc', 'Review landlord KYC submissions', false),
  ('landlords.suspend', 'Suspend a landlord account', true),
  ('kyc_documents.read', 'View KYC document metadata via signed links', false),
  ('kyc_documents.download', 'Download a KYC document', true),
  ('properties.read', 'View property records', false),
  ('properties.update', 'Update a property record', false),
  ('properties.archive', 'Archive a property record', false),
  ('visits.read', 'View verification visits', false),
  ('visits.assign', 'Assign a verification visit to an inspector', false),
  ('visits.inspect', 'Submit inspection evidence for an assigned visit', false),
  ('visits.review', 'Review completed inspection evidence', false),
  ('listings.read', 'View listings', false),
  ('listings.publish', 'Publish a verified listing', false),
  ('listings.reject', 'Reject a listing submission', false),
  ('listings.suspend', 'Suspend a published listing', true),
  ('listing_versions.read', 'View listing version history', false),
  ('listing_versions.approve', 'Approve a listing version change', false),
  ('reservations.read', 'View reservations', false),
  ('reservations.support', 'Assist with a reservation as support', false),
  ('reservations.override', 'Override a reservation state', true),
  ('payments.read', 'View payment records', false),
  ('payments.reconcile', 'Reconcile provider transactions', false),
  ('payments.export', 'Export financial reports', true),
  ('refunds.read', 'View refund records', false),
  ('refunds.request', 'Request a refund', false),
  ('refunds.approve', 'Approve and execute a refund', true),
  ('refunds.retry', 'Retry a failed refund', true),
  ('disputes.read', 'View disputes', false),
  ('disputes.assign', 'Assign or escalate a dispute', false),
  ('disputes.resolve', 'Resolve a dispute outcome', true),
  ('strikes.read', 'View landlord strikes', false),
  ('strikes.issue', 'Issue a landlord strike', true),
  ('strikes.reverse', 'Reverse a landlord strike', true),
  ('accounts.suspend', 'Suspend any user account', true),
  ('reviews.read', 'View reviews', false),
  ('reviews.moderate', 'Moderate a review', false),
  ('chat.read_assigned', 'Read chat threads for assigned cases', false),
  ('chat.read_dispute', 'Read chat threads under an open dispute', false),
  ('notifications.read', 'View notification delivery status', false),
  ('notifications.resend', 'Resend a notification', false),
  ('templates.manage', 'Manage notification templates', false),
  ('analytics.read', 'View analytics dashboards', false),
  ('analytics.export', 'Export analytics reports', true),
  ('audit.read', 'View the audit log', false),
  ('audit.export', 'Export audit log records', true),
  ('semesters.manage', 'Manage semester configuration', false),
  ('universities.manage', 'Manage supported universities', false),
  ('settings.manage', 'Manage platform security/configuration settings', true),
  ('integrations.read', 'View integration status', false),
  ('integrations.manage', 'Manage integration credentials', true);
--> statement-breakpoint

-- ── Seed: role_permissions matrix ───────────────────────────────────────────

-- super_admin: every permission.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p WHERE r.key = 'super_admin';
--> statement-breakpoint

-- Every other role: explicit grant list.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM (VALUES
  ('platform_admin','staff.read'), ('platform_admin','staff.invite'), ('platform_admin','staff.update'),
  ('platform_admin','staff.deactivate'), ('platform_admin','roles.read'), ('platform_admin','roles.assign'),
  ('platform_admin','students.read'), ('platform_admin','landlords.read'), ('platform_admin','properties.read'),
  ('platform_admin','visits.read'), ('platform_admin','listings.read'), ('platform_admin','listing_versions.read'),
  ('platform_admin','reservations.read'), ('platform_admin','payments.read'), ('platform_admin','refunds.read'),
  ('platform_admin','disputes.read'), ('platform_admin','strikes.read'), ('platform_admin','accounts.suspend'),
  ('platform_admin','reviews.read'), ('platform_admin','chat.read_assigned'), ('platform_admin','notifications.read'),
  ('platform_admin','notifications.resend'), ('platform_admin','templates.manage'), ('platform_admin','analytics.read'),
  ('platform_admin','analytics.export'), ('platform_admin','audit.read'), ('platform_admin','semesters.manage'),
  ('platform_admin','universities.manage'), ('platform_admin','settings.manage'), ('platform_admin','integrations.read'),
  ('platform_admin','integrations.manage'),

  ('ops_lead','landlords.read'), ('ops_lead','landlords.review_kyc'), ('ops_lead','landlords.suspend'),
  ('ops_lead','kyc_documents.read'), ('ops_lead','kyc_documents.download'), ('ops_lead','visits.read'),
  ('ops_lead','visits.assign'), ('ops_lead','visits.review'), ('ops_lead','listings.read'),
  ('ops_lead','listings.publish'), ('ops_lead','listings.reject'), ('ops_lead','listings.suspend'),
  ('ops_lead','listing_versions.read'), ('ops_lead','listing_versions.approve'), ('ops_lead','properties.read'),
  ('ops_lead','properties.update'), ('ops_lead','reservations.read'), ('ops_lead','payments.read'),
  ('ops_lead','refunds.read'), ('ops_lead','refunds.request'), ('ops_lead','refunds.approve'),
  ('ops_lead','disputes.read'), ('ops_lead','disputes.assign'), ('ops_lead','disputes.resolve'),
  ('ops_lead','strikes.read'), ('ops_lead','strikes.issue'), ('ops_lead','strikes.reverse'),
  ('ops_lead','reviews.read'), ('ops_lead','chat.read_dispute'), ('ops_lead','audit.read'),

  ('ops_inspector','visits.read'), ('ops_inspector','visits.inspect'), ('ops_inspector','properties.read'),

  ('finance_admin','payments.read'), ('finance_admin','payments.reconcile'), ('finance_admin','payments.export'),
  ('finance_admin','refunds.read'), ('finance_admin','refunds.approve'), ('finance_admin','refunds.retry'),
  ('finance_admin','reservations.read'), ('finance_admin','disputes.read'), ('finance_admin','audit.read'),

  ('support_admin','students.read'), ('support_admin','landlords.read'), ('support_admin','reservations.read'),
  ('support_admin','reservations.support'), ('support_admin','listings.read'), ('support_admin','notifications.read'),
  ('support_admin','notifications.resend'), ('support_admin','disputes.read'), ('support_admin','disputes.assign'),
  ('support_admin','chat.read_dispute'), ('support_admin','audit.read'),

  ('auditor','staff.read'), ('auditor','roles.read'), ('auditor','students.read'), ('auditor','landlords.read'),
  ('auditor','properties.read'), ('auditor','visits.read'), ('auditor','listings.read'), ('auditor','listing_versions.read'),
  ('auditor','reservations.read'), ('auditor','payments.read'), ('auditor','refunds.read'), ('auditor','disputes.read'),
  ('auditor','strikes.read'), ('auditor','reviews.read'), ('auditor','notifications.read'), ('auditor','analytics.read'),
  ('auditor','audit.read'), ('auditor','audit.export')
) AS grant_map(role_key, permission_key)
JOIN roles r ON r.key = grant_map.role_key
JOIN permissions p ON p.key = grant_map.permission_key;
```

- [ ] **Step 6: Apply the migration to the docker test DB and verify**

```bash
cd apps/api
DATABASE_URL=postgresql://campushomes:campushomes_test@localhost:54329/campushomes_test pnpm db:migrate
```
Expected: no errors, migration `0003_rbac` applied.

```bash
DATABASE_URL=postgresql://campushomes:campushomes_test@localhost:54329/campushomes_test pnpm db:check
```
Expected: "Everything's fine 🐶🔥" (or equivalent no-pending-changes message) — confirms `rbac.ts` and the migration agree.

Sanity check the seed data landed:
```bash
docker exec -i api-db-1 psql -U campushomes -d campushomes_test -c "SELECT count(*) FROM roles; SELECT count(*) FROM permissions; SELECT count(*) FROM role_permissions;"
```
Expected: `roles` = 7, `permissions` = 63, `role_permissions` > 60 (super_admin alone contributes 63).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/db/schema/rbac.ts apps/api/src/db/schema/index.ts apps/api/migrations/0003_rbac.sql apps/api/migrations/meta/_journal.json
git commit -m "feat(api): add RBAC schema — roles, permissions, assignments, approval_requests"
```

---

### Task 2: RLS proof tests for the new tables

**Files:**
- Modify: `apps/api/test/rls/rls.spec.ts`

**Interfaces:**
- Consumes: `roles`, `permissions`, `user_role_assignments` tables and their `svc_all` policies from Task 1. `asIdentity`/`seed`/`pool` helpers from `./helpers` (already imported at the top of the file).
- Uses existing fixture identities from the file: `landlord1`, `opsLead` (already seeded in the file's top-level `beforeAll`).

- [ ] **Step 1: Write the test block**

Append to `apps/api/test/rls/rls.spec.ts`, after the existing `describe('auth infra (0002): ...)` block (do not modify anything above it):

```typescript
describe('rbac (0003): roles/permissions/assignments are service-only', () => {
  let opsLeadRoleId: string;
  let superAdminRoleId: string;
  let assignmentId: string;

  beforeAll(async () => {
    opsLeadRoleId = await seed(`SELECT id FROM roles WHERE key = 'ops_lead'`);
    superAdminRoleId = await seed(`SELECT id FROM roles WHERE key = 'super_admin'`);
    assignmentId = await seed(
      `INSERT INTO user_role_assignments (user_id, role_id, scope_type, scope_id, assigned_by, reason)
       VALUES ($1, $2, 'catchment', 'MUK', $1, 'rls test fixture') RETURNING id`,
      [opsLead, opsLeadRoleId],
    );
  });

  it('a landlord cannot read role assignments', async () => {
    const rows = await asIdentity({ userId: landlord1, role: 'landlord' }, async (c) =>
      c.query('SELECT * FROM user_role_assignments').then((r) => r.rows),
    );
    expect(rows).toHaveLength(0);
  });

  it('an admin-mapped identity cannot read the permission catalog directly', async () => {
    const rows = await asIdentity({ userId: opsLead, role: 'admin' }, async (c) =>
      c.query('SELECT * FROM permissions').then((r) => r.rows),
    );
    expect(rows).toHaveLength(0);
  });

  it('a landlord cannot insert a role assignment for themselves', async () => {
    await expect(
      asIdentity({ userId: landlord1, role: 'landlord' }, async (c) =>
        c.query(
          `INSERT INTO user_role_assignments (user_id, role_id, scope_type, assigned_by, reason)
           VALUES ($1, $2, 'platform_wide', $1, 'self-grant attempt')`,
          [landlord1, superAdminRoleId],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('service_role reads role assignments', async () => {
    const rows = await asIdentity({ role: 'service_role' }, async (c) =>
      c.query('SELECT * FROM user_role_assignments').then((r) => r.rows),
    );
    expect(rows.map((r) => r.id)).toContain(assignmentId);
  });

  it('service_role can revoke a role assignment', async () => {
    const res = await asIdentity({ role: 'service_role' }, async (c) =>
      c.query(`UPDATE user_role_assignments SET revoked_at = now() WHERE id = $1`, [assignmentId]),
    );
    expect(res.rowCount).toBe(1);
  });
});
```

- [ ] **Step 2: Run the RLS suite**

```bash
cd apps/api && pnpm test:rls
```
Expected: all tests pass, including the 5 new ones (total count increases from 22 to 27).

- [ ] **Step 3: Commit**

```bash
git add apps/api/test/rls/rls.spec.ts
git commit -m "test(api): add RLS proof tests for rbac tables"
```

---

### Task 3: Shared zod schemas

**Files:**
- Modify: `packages/shared/src/enums.ts`
- Create: `packages/shared/src/rbac.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Produces: `STAFF_ROLE_KEYS` (readonly array), `StaffRoleKey` (type) from `enums.ts`. `grantRoleSchema`/`GrantRoleInput`, `inviteStaffSchema`/`InviteStaffInput` from `rbac.ts` — Task 5's controller imports these by exact name.

- [ ] **Step 1: Add `STAFF_ROLE_KEYS` to enums.ts**

In `packages/shared/src/enums.ts`, immediately after the existing `USER_STATUSES` line:

```typescript
export const USER_ROLES = ['student', 'landlord', 'ops_inspector', 'ops_lead', 'admin'] as const;
export const USER_STATUSES = ['active', 'suspended', 'pending'] as const;

// Fine-grained staff roles for the RBAC layer — distinct from USER_ROLES.
// These map onto users.role via a fixed table (apps/api/src/modules/staff/
// staff.service.ts ROLE_TO_DB_ROLE); they don't replace the DB enum.
export const STAFF_ROLE_KEYS = [
  'super_admin',
  'platform_admin',
  'ops_lead',
  'ops_inspector',
  'finance_admin',
  'support_admin',
  'auditor',
] as const;
export type StaffRoleKey = (typeof STAFF_ROLE_KEYS)[number];
```

(Everything below `USER_STATUSES` in the file — `UNIVERSITIES`, `OPS_TEAMS`, `CATCHMENTS`, etc. — is unchanged; just insert this block before it.)

- [ ] **Step 2: Write the schema file**

```typescript
// packages/shared/src/rbac.ts
import { z } from 'zod';

import { ugPhone } from './common.js';
import { CATCHMENTS, STAFF_ROLE_KEYS } from './enums.js';

const grantRoleFieldsSchema = z.object({
  roleKey: z.enum(STAFF_ROLE_KEYS),
  scopeType: z.enum(['platform_wide', 'catchment']),
  scopeId: z.enum(CATCHMENTS).optional(),
  validUntil: z.iso.datetime().optional(),
});

export const grantRoleSchema = grantRoleFieldsSchema
  .extend({ reason: z.string().min(1).max(500) })
  .refine((v) => v.scopeType === 'platform_wide' || v.scopeId !== undefined, {
    message: 'scopeId is required when scopeType is catchment',
    path: ['scopeId'],
  });
export type GrantRoleInput = z.infer<typeof grantRoleSchema>;

export const inviteStaffSchema = grantRoleFieldsSchema
  .extend({
    name: z.string().min(1).max(200),
    email: z.email().optional(),
    phone: ugPhone.optional(),
    reason: z.string().min(1).max(500),
  })
  .refine((v) => v.scopeType === 'platform_wide' || v.scopeId !== undefined, {
    message: 'scopeId is required when scopeType is catchment',
    path: ['scopeId'],
  })
  .refine((v) => v.email !== undefined || v.phone !== undefined, {
    message: 'email or phone is required',
    path: ['email'],
  });
export type InviteStaffInput = z.infer<typeof inviteStaffSchema>;
```

- [ ] **Step 3: Export it from the barrel**

Add one line to `packages/shared/src/index.ts`:

```typescript
export * from './enums.js';
export * from './common.js';
export * from './auth.js';
export * from './user.js';
export * from './property.js';
export * from './listing.js';
export * from './reservation.js';
export * from './ops.js';
export * from './chat.js';
export * from './notification.js';
export * from './rbac.js';
```

- [ ] **Step 4: Build and typecheck the shared package**

```bash
cd packages/shared && pnpm build && pnpm typecheck
```
Expected: no errors. (`apps/api` and `apps/web` consume the compiled `dist/`, per CLAUDE.md — this rebuild is required before Task 5 can import the new exports.)

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/enums.ts packages/shared/src/rbac.ts packages/shared/src/index.ts
git commit -m "feat(shared): add STAFF_ROLE_KEYS and grant/invite RBAC schemas"
```

---

### Task 4: PermissionsGuard

**Files:**
- Create: `apps/api/src/modules/auth/permissions.ts`
- Test: `apps/api/test/services/rbac-permissions.spec.ts`

**Interfaces:**
- Consumes: `RlsDb` (`apps/api/src/db/db.module.ts`), `roles`/`permissions`/`rolePermissions`/`userRoleAssignments` (`apps/api/src/db/schema`), `AuthenticatedRequest` (`./auth.guard`).
- Produces: `RequirePermission(permission: string)` decorator, `PermissionsGuard` class, `loadPermissions(rlsDb: RlsDb, userId: string): Promise<{ permissions: Set<string>; stepUpRequired: Set<string>; assignments: RoleAssignment[] }>`, `hasCoveringScope(assignments: RoleAssignment[], targetScopeType: string, targetScopeId: string | null): boolean`, `RoleAssignment` interface (`{ scopeType: string; scopeId: string | null }`), `PermissionedRequest` interface. Task 5's `StaffService`/`StaffController` import `loadPermissions`, `hasCoveringScope`, `RoleAssignment`, `PermissionedRequest`, `RequirePermission`, `PermissionsGuard` from this file.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/test/services/rbac-permissions.spec.ts
/**
 * PermissionsGuard's core logic (loadPermissions, hasCoveringScope) against
 * the real docker test DB — the role/permission seed data from migration
 * 0003 is the fixture, no mocking of the permission catalog.
 */
import { Pool } from 'pg';

import { RlsDb } from '../../src/db/db.module';
import { hasCoveringScope, loadPermissions } from '../../src/modules/auth/permissions';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://campushomes:campushomes_test@localhost:54329/campushomes_test';

const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 5 });
const rlsDb = new RlsDb(pool);

let superAdmin: string;
let plainOpsLead: string;

async function seed(sql: string, params: unknown[] = []): Promise<string> {
  const res = await pool.query(sql, params);
  return res.rows[0]?.id as string;
}

beforeAll(async () => {
  await pool.query(`TRUNCATE users RESTART IDENTITY CASCADE`);

  superAdmin = await seed(
    `INSERT INTO users (phone, role, status, name) VALUES ($1, 'admin', 'active', 'Super Admin') RETURNING id`,
    ['+256700000201'],
  );
  plainOpsLead = await seed(
    `INSERT INTO users (phone, role, status, name) VALUES ($1, 'ops_lead', 'active', 'No Assignment') RETURNING id`,
    ['+256700000202'],
  );

  const superAdminRoleId = await seed(`SELECT id FROM roles WHERE key = 'super_admin'`);
  await pool.query(
    `INSERT INTO user_role_assignments (user_id, role_id, scope_type, assigned_by, reason)
     VALUES ($1, $2, 'platform_wide', $1, 'seed')`,
    [superAdmin, superAdminRoleId],
  );
});

afterAll(async () => {
  await pool.end();
});

describe('loadPermissions', () => {
  it('grants the seeded super_admin permission roles.manage_super_admin', async () => {
    const { permissions } = await loadPermissions(rlsDb, superAdmin);
    expect(permissions.has('roles.manage_super_admin')).toBe(true);
  });

  it('flags refunds.approve as requiring step-up', async () => {
    const { stepUpRequired } = await loadPermissions(rlsDb, superAdmin);
    expect(stepUpRequired.has('refunds.approve')).toBe(true);
  });

  it('returns no permissions for a user with no active assignment', async () => {
    const { permissions } = await loadPermissions(rlsDb, plainOpsLead);
    expect(permissions.size).toBe(0);
  });
});

describe('hasCoveringScope', () => {
  it('a platform_wide assignment covers any catchment target', () => {
    expect(hasCoveringScope([{ scopeType: 'platform_wide', scopeId: null }], 'catchment', 'MUK')).toBe(true);
  });

  it("a catchment assignment scoped 'all' covers a specific catchment target", () => {
    expect(hasCoveringScope([{ scopeType: 'catchment', scopeId: 'all' }], 'catchment', 'MUK')).toBe(true);
  });

  it('a catchment assignment for one catchment does not cover a different catchment', () => {
    expect(hasCoveringScope([{ scopeType: 'catchment', scopeId: 'MUK' }], 'catchment', 'MUBS')).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd apps/api && pnpm test test/services/rbac-permissions.spec.ts
```
Expected: FAIL — `Cannot find module '../../src/modules/auth/permissions'`.

- [ ] **Step 3: Write the implementation**

```typescript
// apps/api/src/modules/auth/permissions.ts
import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  NotImplementedException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { and, eq, isNull, or, sql } from 'drizzle-orm';

import { RlsDb } from '../../db/db.module';
import type { RlsContext } from '../../db/rls-context';
import { permissions, rolePermissions, userRoleAssignments } from '../../db/schema';
import type { AuthenticatedRequest } from './auth.guard';

export const PERMISSION_KEY = 'permission';

/** Restricts a route to callers holding the given permission. Must be paired
 * with AuthGuard (AuthGuard attaches the session PermissionsGuard reads). */
export const RequirePermission = (permission: string) => SetMetadata(PERMISSION_KEY, permission);

export interface RoleAssignment {
  scopeType: string;
  scopeId: string | null;
}

export interface PermissionedRequest extends AuthenticatedRequest {
  permissions: Set<string>;
  assignments: RoleAssignment[];
}

const SERVICE_CTX: RlsContext = {
  userId: '00000000-0000-0000-0000-000000000000',
  role: 'service_role',
};

/** Loads every permission granted by a user's active (not revoked, within
 * validity window) role assignments. Runs as service_role — these tables are
 * svc_all-only under RLS, same posture as accounts/verifications. */
export async function loadPermissions(
  rlsDb: RlsDb,
  userId: string,
): Promise<{ permissions: Set<string>; stepUpRequired: Set<string>; assignments: RoleAssignment[] }> {
  const rows = await rlsDb.run(SERVICE_CTX, (db) =>
    db
      .select({
        permissionKey: permissions.key,
        requiresStepUp: permissions.requiresStepUp,
        scopeType: userRoleAssignments.scopeType,
        scopeId: userRoleAssignments.scopeId,
      })
      .from(userRoleAssignments)
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, userRoleAssignments.roleId))
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(
        and(
          eq(userRoleAssignments.userId, userId),
          isNull(userRoleAssignments.revokedAt),
          sql`${userRoleAssignments.validFrom} <= now()`,
          or(isNull(userRoleAssignments.validUntil), sql`${userRoleAssignments.validUntil} > now()`),
        ),
      ),
  );

  return {
    permissions: new Set(rows.map((r) => r.permissionKey)),
    stepUpRequired: new Set(rows.filter((r) => r.requiresStepUp).map((r) => r.permissionKey)),
    assignments: rows.map((r) => ({ scopeType: r.scopeType, scopeId: r.scopeId })),
  };
}

/** True if any assignment covers the target scope: platform_wide covers
 * everything; a catchment assignment covers the same catchment or 'all'. */
export function hasCoveringScope(
  assignments: RoleAssignment[],
  targetScopeType: string,
  targetScopeId: string | null,
): boolean {
  return assignments.some((a) => {
    if (a.scopeType === 'platform_wide') return true;
    if (targetScopeType === 'platform_wide') return false;
    return a.scopeId === 'all' || a.scopeId === targetScopeId;
  });
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rlsDb: RlsDb,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string | undefined>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) {
      return true;
    }

    const req = context.switchToHttp().getRequest<PermissionedRequest>();
    const { permissions: granted, stepUpRequired, assignments } = await loadPermissions(
      this.rlsDb,
      req.session.user.id,
    );
    req.permissions = granted;
    req.assignments = assignments;

    if (!granted.has(required)) {
      return false;
    }
    if (stepUpRequired.has(required)) {
      // Real MFA reverification ships in the Auth phase — fail closed rather
      // than silently allowing a step-up-gated action.
      throw new NotImplementedException(`${required} requires step-up verification (not yet available)`);
    }
    return true;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd apps/api && pnpm test test/services/rbac-permissions.spec.ts
```
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/auth/permissions.ts apps/api/test/services/rbac-permissions.spec.ts
git commit -m "feat(api): add PermissionsGuard and RequirePermission decorator"
```

---

### Task 5: StaffModule

**Files:**
- Create: `apps/api/src/modules/staff/staff.service.ts`
- Create: `apps/api/src/modules/staff/staff.controller.ts`
- Create: `apps/api/src/modules/staff/audit-log.controller.ts`
- Create: `apps/api/src/modules/staff/staff.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/services/rbac-staff.spec.ts`

**Interfaces:**
- Consumes: `RlsDb`, `roles`/`userRoleAssignments`/`users`/`auditLog` (`../../db/schema`), `RlsContext` (`../../db/rls-context`), `AuditService` (`../ops/audit.service`, exported by `OpsModule`), `AuthGuard`/`AuthenticatedRequest`/`rlsCtx` (`../auth/auth.guard`, `../auth/roles`), `RequirePermission`/`PermissionsGuard`/`loadPermissions`/`hasCoveringScope`/`RoleAssignment`/`PermissionedRequest` (`../auth/permissions`, Task 4), `GrantRoleInput`/`InviteStaffInput`/`grantRoleSchema`/`inviteStaffSchema`/`StaffRoleKey` (`@campushomes/shared`, Task 3).
- Produces: `StaffService` with methods `invite`, `list`, `deactivate`, `grantRole`, `revokeRole` — exact signatures below, used directly by the test file and by `StaffController`.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/test/services/rbac-staff.spec.ts
/**
 * StaffService round trip against the real docker test DB: invite, grant
 * role, revoke role, deactivate, list — plus the separation-of-duty guards
 * (no self-elevation, only manage_super_admin grants super_admin, scope
 * must cover the grant).
 */
import { Pool } from 'pg';

import { RlsDb } from '../../src/db/db.module';
import type { RlsContext } from '../../src/db/rls-context';
import { AuditService } from '../../src/modules/ops/audit.service';
import { StaffService } from '../../src/modules/staff/staff.service';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://campushomes:campushomes_test@localhost:54329/campushomes_test';

const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 5 });
const rlsDb = new RlsDb(pool);
const audit = new AuditService(rlsDb);
const staff = new StaffService(rlsDb, audit);

let superAdmin: string;
let platformAdmin: string;

async function seed(sql: string, params: unknown[] = []): Promise<string> {
  const res = await pool.query(sql, params);
  return res.rows[0]?.id as string;
}

const superAdminCtx = (): RlsContext => ({ userId: superAdmin, role: 'admin' });
const platformAdminCtx = (): RlsContext => ({ userId: platformAdmin, role: 'admin' });

beforeAll(async () => {
  await pool.query(`TRUNCATE users RESTART IDENTITY CASCADE`);

  superAdmin = await seed(
    `INSERT INTO users (phone, role, status, name) VALUES ($1, 'admin', 'active', 'Super Admin') RETURNING id`,
    ['+256700000301'],
  );
  platformAdmin = await seed(
    `INSERT INTO users (phone, role, status, name) VALUES ($1, 'admin', 'active', 'Platform Admin') RETURNING id`,
    ['+256700000302'],
  );
});

afterAll(async () => {
  await pool.end();
});

describe('StaffService.grantRole — separation of duty', () => {
  it('blocks an actor from granting a role to themselves', async () => {
    await expect(
      staff.grantRole(
        superAdminCtx(),
        new Set(['roles.assign']),
        [{ scopeType: 'platform_wide', scopeId: null }],
        superAdmin,
        { roleKey: 'finance_admin', scopeType: 'platform_wide', reason: 'self-grant attempt' },
      ),
    ).rejects.toThrow('Cannot assign yourself a role');
  });

  it('blocks a non-manage_super_admin actor from granting super_admin', async () => {
    const target = await seed(
      `INSERT INTO users (phone, role, status, name) VALUES ($1, 'admin', 'pending', 'Target') RETURNING id`,
      ['+256700000303'],
    );
    await expect(
      staff.grantRole(
        platformAdminCtx(),
        new Set(['roles.assign']),
        [{ scopeType: 'platform_wide', scopeId: null }],
        target,
        { roleKey: 'super_admin', scopeType: 'platform_wide', reason: 'escalation attempt' },
      ),
    ).rejects.toThrow('Only a Super Admin can grant the super_admin role');
  });

  it("blocks granting a role outside the actor's own scope", async () => {
    const target = await seed(
      `INSERT INTO users (phone, role, status, name) VALUES ($1, 'ops_lead', 'pending', 'Target2') RETURNING id`,
      ['+256700000304'],
    );
    await expect(
      staff.grantRole(
        platformAdminCtx(),
        new Set(['roles.assign']),
        [{ scopeType: 'catchment', scopeId: 'MUK' }],
        target,
        { roleKey: 'ops_lead', scopeType: 'catchment', scopeId: 'MUBS', reason: 'out of scope' },
      ),
    ).rejects.toThrow('Cannot grant a role outside your own scope');
  });
});

describe('StaffService.grantRole — success path', () => {
  let assignment: Awaited<ReturnType<typeof staff.grantRole>>;

  beforeAll(async () => {
    const target = await seed(
      `INSERT INTO users (phone, role, status, name) VALUES ($1, 'ops_lead', 'pending', 'Target3') RETURNING id`,
      ['+256700000305'],
    );
    assignment = await staff.grantRole(
      superAdminCtx(),
      new Set(['roles.assign']),
      [{ scopeType: 'platform_wide', scopeId: null }],
      target,
      { roleKey: 'ops_lead', scopeType: 'catchment', scopeId: 'MUK', reason: 'onboarding' },
    );
  });

  it('persists the granted scope', () => {
    expect(assignment.scopeId).toBe('MUK');
  });

  it('writes an audit_log row for the grant', async () => {
    const { rows } = await pool.query(
      `SELECT action FROM audit_log WHERE action = 'roles.assign' AND target_id = $1`,
      [assignment.id],
    );
    expect(rows).toHaveLength(1);
  });
});

describe('StaffService.invite + revokeRole round trip', () => {
  it('invites a staff member with the mapped DB role and pending status', async () => {
    const user = await staff.invite(
      superAdminCtx(),
      new Set(['roles.assign']),
      [{ scopeType: 'platform_wide', scopeId: null }],
      {
        name: 'New Support Admin',
        phone: '+256700000306',
        roleKey: 'support_admin',
        scopeType: 'platform_wide',
        reason: 'new hire',
      },
    );
    expect(user.role).toBe('admin');
  });

  it('revoking the granted assignment sets revokedAt', async () => {
    const user = await staff.invite(
      superAdminCtx(),
      new Set(['roles.assign']),
      [{ scopeType: 'platform_wide', scopeId: null }],
      {
        name: 'Another Support Admin',
        phone: '+256700000307',
        roleKey: 'support_admin',
        scopeType: 'platform_wide',
        reason: 'new hire',
      },
    );
    const { rows } = await pool.query(
      `SELECT id FROM user_role_assignments WHERE user_id = $1 AND revoked_at IS NULL`,
      [user.id],
    );
    const revoked = await staff.revokeRole(superAdminCtx(), rows[0].id as string);
    expect(revoked.revokedAt).not.toBeNull();
  });
});

describe('StaffService.deactivate and list', () => {
  it('deactivating a staff member sets status to suspended', async () => {
    const target = await seed(
      `INSERT INTO users (phone, role, status, name) VALUES ($1, 'ops_lead', 'active', 'Target4') RETURNING id`,
      ['+256700000308'],
    );
    const updated = await staff.deactivate(target);
    expect(updated.status).toBe('suspended');
  });

  it('list includes the seeded super admin', async () => {
    const rows = await staff.list();
    expect(rows.some((r) => r.id === superAdmin)).toBe(true);
  });

  it('list only returns admin-tier roles', async () => {
    const rows = await staff.list();
    expect(rows.every((r) => ['admin', 'ops_lead', 'ops_inspector'].includes(r.role))).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd apps/api && pnpm test test/services/rbac-staff.spec.ts
```
Expected: FAIL — `Cannot find module '../../src/modules/staff/staff.service'`.

- [ ] **Step 3: Write the service**

```typescript
// apps/api/src/modules/staff/staff.service.ts
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray, isNull } from 'drizzle-orm';

import type { GrantRoleInput, InviteStaffInput, StaffRoleKey, UserRole } from '@campushomes/shared';

import { RlsDb } from '../../db/db.module';
import type { RlsContext } from '../../db/rls-context';
import { roles, userRoleAssignments, users } from '../../db/schema';
import { hasCoveringScope, type RoleAssignment } from '../auth/permissions';
import { AuditService } from '../ops/audit.service';

const SERVICE_CTX: RlsContext = {
  userId: '00000000-0000-0000-0000-000000000000',
  role: 'service_role',
};

// Which existing app.user_role value a granted StaffRoleKey maps onto — RLS
// keeps branching on the locked 5-value enum; fine-grained gating is
// PermissionsGuard. ops_lead/ops_inspector already have their own RLS-tested
// enum values, so they map 1:1 instead of collapsing into 'admin'.
const ROLE_TO_DB_ROLE: Record<StaffRoleKey, UserRole> = {
  super_admin: 'admin',
  platform_admin: 'admin',
  finance_admin: 'admin',
  support_admin: 'admin',
  auditor: 'admin',
  ops_lead: 'ops_lead',
  ops_inspector: 'ops_inspector',
};

@Injectable()
export class StaffService {
  constructor(
    private readonly rlsDb: RlsDb,
    private readonly audit: AuditService,
  ) {}

  async invite(
    actorCtx: RlsContext,
    actorPermissions: Set<string>,
    actorAssignments: RoleAssignment[],
    input: InviteStaffInput,
  ) {
    const dbRole = ROLE_TO_DB_ROLE[input.roleKey];
    const user = await this.rlsDb.run(SERVICE_CTX, async (db) => {
      const [row] = await db
        .insert(users)
        .values({
          name: input.name,
          email: input.email,
          phone: input.phone,
          role: dbRole,
          status: 'pending',
        })
        .returning();
      return row;
    });
    await this.grantRole(actorCtx, actorPermissions, actorAssignments, user.id, input);
    return user;
  }

  list() {
    return this.rlsDb.run(SERVICE_CTX, (db) =>
      db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          phone: users.phone,
          role: users.role,
          status: users.status,
        })
        .from(users)
        .where(inArray(users.role, ['admin', 'ops_lead', 'ops_inspector'])),
    );
  }

  deactivate(targetUserId: string) {
    return this.rlsDb.run(SERVICE_CTX, async (db) => {
      const [row] = await db
        .update(users)
        .set({ status: 'suspended' })
        .where(eq(users.id, targetUserId))
        .returning();
      if (!row) throw new NotFoundException('Staff member not found');
      return row;
    });
  }

  async grantRole(
    actorCtx: RlsContext,
    actorPermissions: Set<string>,
    actorAssignments: RoleAssignment[],
    targetUserId: string,
    input: GrantRoleInput | InviteStaffInput,
  ) {
    if (actorCtx.userId === targetUserId) {
      throw new ForbiddenException('Cannot assign yourself a role');
    }
    if (input.roleKey === 'super_admin' && !actorPermissions.has('roles.manage_super_admin')) {
      throw new ForbiddenException('Only a Super Admin can grant the super_admin role');
    }
    if (!hasCoveringScope(actorAssignments, input.scopeType, input.scopeId ?? null)) {
      throw new ForbiddenException('Cannot grant a role outside your own scope');
    }

    return this.rlsDb.run(SERVICE_CTX, async (db) => {
      const [role] = await db.select().from(roles).where(eq(roles.key, input.roleKey));
      if (!role) throw new NotFoundException(`Unknown role ${input.roleKey}`);

      await db
        .update(users)
        .set({ role: ROLE_TO_DB_ROLE[input.roleKey] })
        .where(eq(users.id, targetUserId));

      const [assignment] = await db
        .insert(userRoleAssignments)
        .values({
          userId: targetUserId,
          roleId: role.id,
          scopeType: input.scopeType,
          scopeId: input.scopeId ?? null,
          assignedBy: actorCtx.userId,
          reason: input.reason,
          validUntil: input.validUntil ? new Date(input.validUntil) : null,
        })
        .returning();

      await this.audit.record(actorCtx, 'roles.assign', 'user_role_assignment', assignment.id, {
        targetUserId,
        roleKey: input.roleKey,
        scopeType: input.scopeType,
        scopeId: input.scopeId ?? null,
        reason: input.reason,
      });
      return assignment;
    });
  }

  revokeRole(actorCtx: RlsContext, assignmentId: string) {
    return this.rlsDb.run(SERVICE_CTX, async (db) => {
      const [row] = await db
        .update(userRoleAssignments)
        .set({ revokedAt: new Date(), revokedBy: actorCtx.userId })
        .where(and(eq(userRoleAssignments.id, assignmentId), isNull(userRoleAssignments.revokedAt)))
        .returning();
      if (!row) throw new NotFoundException('Active role assignment not found');
      await this.audit.record(actorCtx, 'roles.revoke', 'user_role_assignment', assignmentId, {});
      return row;
    });
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd apps/api && pnpm test test/services/rbac-staff.spec.ts
```
Expected: PASS, 9 tests.

- [ ] **Step 5: Write the controllers**

```typescript
// apps/api/src/modules/staff/staff.controller.ts
import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';

import { grantRoleSchema, inviteStaffSchema } from '@campushomes/shared';

import { AuthGuard } from '../auth/auth.guard';
import { PermissionedRequest, PermissionsGuard, RequirePermission } from '../auth/permissions';
import { rlsCtx } from '../auth/roles';
import { StaffService } from './staff.service';

class InviteStaffDto extends createZodDto(inviteStaffSchema) {}
class GrantRoleDto extends createZodDto(grantRoleSchema) {}

@Controller('admin/staff')
@UseGuards(AuthGuard, PermissionsGuard)
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Post('invite')
  @RequirePermission('staff.invite')
  invite(@Req() req: PermissionedRequest, @Body() body: InviteStaffDto) {
    return this.staffService.invite(rlsCtx(req), req.permissions, req.assignments, body);
  }

  @Get()
  @RequirePermission('staff.read')
  list() {
    return this.staffService.list();
  }

  @Patch(':id/deactivate')
  @RequirePermission('staff.deactivate')
  deactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.staffService.deactivate(id);
  }

  @Post(':id/roles')
  @RequirePermission('roles.assign')
  assignRole(@Req() req: PermissionedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: GrantRoleDto) {
    return this.staffService.grantRole(rlsCtx(req), req.permissions, req.assignments, id, body);
  }

  @Delete(':id/roles/:assignmentId')
  @RequirePermission('roles.revoke')
  revokeRole(@Req() req: PermissionedRequest, @Param('assignmentId', ParseUUIDPipe) assignmentId: string) {
    return this.staffService.revokeRole(rlsCtx(req), assignmentId);
  }
}
```

```typescript
// apps/api/src/modules/staff/audit-log.controller.ts
import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { desc } from 'drizzle-orm';

import { RlsDb } from '../../db/db.module';
import { auditLog } from '../../db/schema';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionedRequest, PermissionsGuard, RequirePermission } from '../auth/permissions';
import { rlsCtx } from '../auth/roles';

@Controller('admin/audit-log')
@UseGuards(AuthGuard, PermissionsGuard)
export class AuditLogController {
  constructor(private readonly rlsDb: RlsDb) {}

  @Get()
  @RequirePermission('audit.read')
  list(@Req() req: PermissionedRequest) {
    // The actor's own ctx, not service_role: audit_log_lead_read (0001)
    // already scopes reads to app_is_lead() at the RLS layer — this
    // endpoint's PermissionsGuard check is the primary gate, RLS the backstop.
    return this.rlsDb.run(rlsCtx(req), (db) =>
      db.select().from(auditLog).orderBy(desc(auditLog.ts)).limit(100),
    );
  }
}
```

```typescript
// apps/api/src/modules/staff/staff.module.ts
import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { OpsModule } from '../ops/ops.module';
import { AuditLogController } from './audit-log.controller';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';

@Module({
  imports: [AuthModule, OpsModule],
  controllers: [StaffController, AuditLogController],
  providers: [StaffService],
})
export class StaffModule {}
```

- [ ] **Step 6: Wire StaffModule into AppModule**

In `apps/api/src/app.module.ts`, add the import and list entry:

```typescript
import { DbModule } from './db/db.module';
import { RedisModule } from './db/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { ChatModule } from './modules/chat/chat.module';
import { HealthController } from './modules/health/health.controller';
import { JobsModule } from './modules/jobs/jobs.module';
import { LandlordsModule } from './modules/landlords/landlords.module';
import { ListingsModule } from './modules/listings/listings.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OpsModule } from './modules/ops/ops.module';
import { ProfileModule } from './modules/profile/profile.module';
import { ReservationsModule } from './modules/reservations/reservations.module';
import { StaffModule } from './modules/staff/staff.module';
import { UploadsModule } from './modules/uploads/uploads.module';

@Module({
  imports: [
    DbModule,
    RedisModule,
    AuthModule,
    ListingsModule,
    LandlordsModule,
    OpsModule,
    ProfileModule,
    ReservationsModule,
    NotificationsModule,
    ChatModule,
    JobsModule,
    UploadsModule,
    StaffModule,
  ],
  controllers: [HealthController],
  providers: [
    // Global: every request body/query hitting a createZodDto() DTO is
    // validated against the shared schema before any handler runs.
    { provide: APP_PIPE, useClass: ZodValidationPipe },
  ],
})
export class AppModule {}
```

- [ ] **Step 7: Typecheck and full test run**

```bash
cd apps/api && pnpm typecheck && pnpm test
```
Expected: no type errors; all suites pass (existing 44 + new RLS 5 + new service tests ~15).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/staff apps/api/src/app.module.ts apps/api/test/services/rbac-staff.spec.ts
git commit -m "feat(api): add StaffModule — invite/list/deactivate/grant-role/revoke-role/audit-log"
```

---

### Task 6: Full verification gate

**Files:** none (verification only).

- [ ] **Step 1: Confirm the docker test DB is up and migrated**

```bash
docker compose -f apps/api/docker-compose.test.yml up -d --wait
DATABASE_URL=postgresql://campushomes:campushomes_test@localhost:54329/campushomes_test pnpm --filter @campushomes/api db:migrate
```
Expected: DB healthy, migrations 0000–0003 all applied (no pending).

- [ ] **Step 2: Run the full gate at root**

```bash
cd /home/festo/Campus-Homes && pnpm lint && pnpm typecheck && pnpm test
```
Expected: all three green. `pnpm test` runs every workspace's Jest suite, including `apps/api` (RLS suite + service specs, `--runInBand`).

- [ ] **Step 3: Confirm no drift between schema and migrations**

```bash
cd apps/api && DATABASE_URL=postgresql://campushomes:campushomes_test@localhost:54329/campushomes_test pnpm db:check
```
Expected: no pending schema changes.

- [ ] **Step 4: Update CLAUDE.md build memory**

Add a new bullet under "Decisions made mid-build" in `/home/festo/Campus-Homes/CLAUDE.md` documenting: migration `0003_rbac` adds `roles`/`permissions`/`role_permissions`/`user_role_assignments`/`approval_requests` (all `svc_all` RLS, mirrors `accounts`/`verifications`); 7 staff roles map onto the existing `app.user_role` enum via `ROLE_TO_DB_ROLE` in `staff.service.ts` (`ops_lead`/`ops_inspector` keep their dedicated enum values, the other 5 collapse to `admin`); `PermissionsGuard` does a per-request DB lookup (not session-baked) so revocation is immediate; step-up-gated permissions fail closed (`501`) until Phase B wires real MFA; `approval_requests` table exists with no consumer yet. Note RLS suite is now 27 tests, and reference this plan + the design spec by path.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: record RBAC foundation (Phase A) build memory"
```

---

## Explicitly not built in this phase

(carried over from the design doc, restated here so execution doesn't drift into scope creep)

- Real step-up MFA reverification — Phase B.
- Invite delivery (email/SMS) — Phase B.
- Retrofitting `@RequirePermission` onto existing Ops endpoints — later, once the Admin Dashboard (Phase C) needs it.
- `access_reviews` table.
- Any consumer of `approval_requests`.
- Admin Dashboard frontend — Phase C, separate spec/plan.
