# RBAC Foundation (Phase A) — Design

Ground truth for the full target system: user-supplied spec (7 admin roles,
permission model, scoped authorization, step-up auth, separation-of-duty,
audit) delivered 2026-07-18. This doc scopes **only the foundation phase** —
data model + enforcement engine + staff-management API. Two follow-on phases
are explicitly out of scope here and get their own spec later:

- **Phase B (Auth):** working email OTP, invite-only staff/landlord account
  creation, fixing the self-signup `role: 'student'` hardcode, real step-up
  MFA reverification.
- **Phase C (Admin Dashboard):** the frontend surface, nav/pages/actions
  generated from the logged-in user's permissions.

## Non-negotiables carried over from CLAUDE.md

- `app.user_role` DB enum (`student | landlord | ops_inspector | ops_lead |
  admin | service_role`) and the ~15 RLS policies that branch on it
  (`apps/api/migrations/0001_rls_hardening.sql`) are **not modified**. 16 RLS
  tests are locked.
- Existing Ops module endpoints (KYC review, visit assign/review, listing
  publish — Phase 5, tested) are **not touched or retrofitted** in this
  phase. New permission enforcement applies only to the new staff-management
  endpoints this phase adds.
- Migrations are forward-only (no down migrations) — this phase adds
  `0003_rbac.sql`, doesn't edit `0001`/`0002`.

## Data model

New file `apps/api/src/db/schema/rbac.ts`, migration `0003_rbac.sql`.

```
roles
  id             uuid pk
  key            text unique      -- 'super_admin', 'platform_admin', 'ops_lead',
                                   -- 'ops_inspector', 'finance_admin',
                                   -- 'support_admin', 'auditor'
  name           text
  description    text
  is_system      boolean not null default true   -- seeded rows; blocks delete
  created_at     timestamptz

permissions
  id                uuid pk
  key               text unique   -- 'resource.action', e.g. 'kyc_documents.read'
  description       text
  requires_step_up  boolean not null default false
  created_at        timestamptz

role_permissions
  role_id        uuid fk -> roles
  permission_id  uuid fk -> permissions
  primary key (role_id, permission_id)

user_role_assignments
  id             uuid pk
  user_id        uuid fk -> users
  role_id        uuid fk -> roles
  scope_type     text not null    -- 'platform_wide' | 'catchment'
  scope_id       text             -- catchment enum value when scope_type='catchment', else null
  valid_from     timestamptz not null default now()
  valid_until    timestamptz      -- nullable, open-ended if null
  assigned_by    uuid fk -> users not null
  reason         text
  revoked_at     timestamptz
  revoked_by     uuid fk -> users
  created_at     timestamptz
  -- partial unique index (user_id, role_id, scope_type, scope_id) WHERE revoked_at IS NULL
  -- prevents duplicate active assignments of the same role+scope to the same user

approval_requests
  id             uuid pk
  request_type   text not null
  requested_by   uuid fk -> users not null
  target_type    text not null
  target_id      uuid
  payload        jsonb not null default '{}'
  status         text not null default 'pending'   -- 'pending' | 'approved' | 'rejected'
  decided_by     uuid fk -> users
  decided_at     timestamptz
  reason         text
  created_at     timestamptz
```

No `authorization_scopes` table — `scope_type`/`scope_id` inline on the
assignment covers the two scope types in play, and the existing `catchment`
enum already has an `'all'` sentinel (`MUK | MUBS | KIU | KYU | all`), which
doubles as the platform-wide value for `scope_type='catchment'` — so in
practice `scope_type` only needs to distinguish "no catchment concept
applies at all" (`platform_wide`, e.g. for an Auditor with no catchment
dimension) from "catchment-scoped, possibly `'all'`". No `access_reviews`
table — nothing in this phase produces data for a periodic access review to
consume; add it when a phase exists that does.

`approval_requests` ships as schema now (per your call), but **nothing in
this phase writes to it**. Neither Finance/refunds nor Dispute modules exist
yet, and the one separation-of-duty rule this phase does enforce
(role-elevation) turned out to need only a synchronous guard check, not an
async maker-checker record (see below). It sits correct-but-unused until a
later phase has a real two-party workflow to put in it. Flagging this
explicitly rather than silently building it inert.

## Mapping onto the existing `app.user_role` enum

| new `roles.key` | `users.role` (DB enum, unchanged) | RLS |
|---|---|---|
| `ops_inspector` | `ops_inspector` | existing policies, untouched |
| `ops_lead` | `ops_lead` | existing policies, untouched |
| `super_admin`, `platform_admin`, `finance_admin`, `support_admin`, `auditor` | `admin` | existing broad `admin` RLS policies (read-heavy); fine-grained gating is entirely `PermissionsGuard`, same precedent as `service_role` in-code party checks used elsewhere (reservations, unit availability) |

Assigning a user the `finance_admin` role means: `users.role` is set to
`'admin'` (so RLS's existing `app_is_ops()`/`admin` branches see them as
admin-tier) **and** a `user_role_assignments` row is created pointing at the
`finance_admin` role (so `PermissionsGuard` scopes them to only
`finance.*`/`payments.*`/`refunds.*` permissions). Two roles keep their own
dedicated enum values because RLS already branches on them specifically —
changing that would mean touching the locked migration, ruled out earlier.

## Enforcement

`PermissionsGuard` (new, `apps/api/src/modules/rbac/`) + `@RequirePermission('resource.action')`
decorator, registered after `AuthGuard` on routes that need it. Per request:

1. Load the caller's active assignments: `user_role_assignments` where
   `user_id = session.user.id`, `revoked_at IS NULL`, `now() BETWEEN
   valid_from AND coalesce(valid_until, 'infinity')`.
2. Union the permission keys granted by those roles (`role_permissions`
   join).
3. Check the decorator's required permission is present. 403 if not.
4. If the route carries a scoped target (e.g. a catchment id in the body/
   params), check at least one covering assignment has `scope_type='platform_wide'`
   or `scope_id IN ('all', <target catchment>)`. 403 if not.
5. If `permissions.requires_step_up` is true for this permission: check a
   `stepUpVerifiedAt` slot. **Nothing populates this slot in this phase** —
   real MFA reverification is Phase B. The guard fails closed (501 Not
   Implemented, not a silent allow) rather than pretending step-up happened.
6. On success, write to `audit_log` (existing table, unchanged schema):
   `action` = the permission key, `actor_id`/`actor_role` from session,
   `target_type`/`target_id` from the route, `payload` carries `{ reason,
   scopeChecked, stepUpUsed: false }`.

This is a per-request DB lookup, not baked into the session/JWT — chosen so
a suspended staff member or a revoked role assignment takes effect on their
*next* request, not their next login (session-baked permissions were
considered and rejected during design for this reason).

## Separation-of-duty

Enforced as plain guard checks in the staff-management service, not via
`approval_requests`:

- Assigning a role requires `assigned_by !== user_id` — an actor can never
  grant themselves a role, including re-granting one they already hold with
  a different scope.
- Only actors holding `roles.manage_super_admin` may assign the
  `super_admin` role. No one may assign it to themselves regardless (rule
  above already covers this, stated separately because it's the one the
  spec calls out explicitly).

## Permission catalog & role_permission matrix

Seeded in `0003_rbac.sql` as static rows, full catalog from the spec's §2/§3
(all `resource.action` keys and the 7-role × permission matrix), **not**
trimmed to only what this phase enforces. Rationale: it's data, not code —
zero behavior risk, and it saves Phase C from re-deriving the matrix from
prose later. What's actually *enforced* this phase is only the subset behind
the new endpoints below (`staff.*`, `roles.*`, `audit.read`); the rest sits
as correct-but-inert data, same posture as `approval_requests`.

## New API surface

All under `/api/v1/admin`, all new (`apps/api/src/modules/rbac/` or a new
`StaffModule` — implementation detail for the plan), all `@RequirePermission`-gated:

- `POST /admin/staff/invite` — `staff.invite`. Creates a `users` row
  (`role='admin'` or the mapped dedicated enum value per the table above,
  `status='pending'`) — does not send an invite email/SMS yet (Phase B); for
  this phase it's a service-path-only record creation, consistent with how
  ops/admin accounts are already seeded per CLAUDE.md.
- `GET /admin/staff` — `staff.read`. Lists users with `role` in the
  admin-tier set, joined to their active role assignments.
- `PATCH /admin/staff/:id/deactivate` — `staff.deactivate`.
- `POST /admin/staff/:id/roles` — `roles.assign`. Body: `roleKey`,
  `scopeType`, `scopeId?`, `reason`, `validUntil?`.
- `DELETE /admin/staff/:id/roles/:assignmentId` — `roles.revoke`. Sets
  `revoked_at`/`revoked_by`, doesn't hard-delete (audit trail).
- `GET /admin/audit-log` — `audit.read`. Paginated read of the existing
  `audit_log` table.

Request/response schemas go in `packages/shared` (nestjs-zod, per the
project's locked validation decision) — new file `packages/shared/src/rbac.ts`.

## Testing

New `apps/api/test/services/rbac.spec.ts` (or split by concern):
`PermissionsGuard` allow/deny for permission-present, permission-absent,
scope-covering, scope-not-covering, step-up-required-and-unverified (501),
expired assignment (`valid_until` in the past), revoked assignment. Staff
endpoint tests: self-elevation blocked, non-`manage_super_admin` actor
blocked from granting `super_admin`, successful invite+assign+revoke round
trip, audit_log row written per action. RLS suite is untouched (nothing in
`0001` changes) — no new RLS tests needed for this phase.

## Explicitly deferred (not this phase)

- Real step-up MFA reverification flow (Phase B).
- Invite delivery (email/SMS) for new staff accounts (Phase B).
- Retrofitting `@RequirePermission` onto existing Ops endpoints (later, once
  Phase C dashboard needs it).
- `access_reviews` table and any periodic-review feature.
- Any use of `approval_requests` (no consumer yet).
- university/region/assigned_case/assigned_property/finance_period scope
  types — `scope_type` is a free-form string + `scope_id`, so adding one
  later needs no schema migration, just new values and guard logic.
