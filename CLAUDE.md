# CampusHomes — Build Memory

Ground truth: `OwnResourceFolder/CampusHomes_Fullstack_Build_Brief.md`. This file records
locked decisions + anything decided mid-build, so nothing gets re-derived or reverted.

## The three locked architectural decisions (brief §4)

1. **Validation = nestjs-zod against `packages/shared`.** One Zod schema package drives
   frontend form validation and backend request/response validation. No class-validator DTOs.
2. **Authorization = native Postgres RLS on NeonDB.** Policies live in SQL migrations,
   keyed on `app.user_id` / `app.user_role` session variables set per-request in a
   transaction. A service-method bug can't leak rows — Postgres filters at read time.
3. **Background jobs = BullMQ in-process** inside the NestJS app (Upstash Redis).
   Note: the schema design doc mentions pg-boss — the brief overrides it; BullMQ is final.

## Stack pins

pnpm workspace · TypeScript everywhere · Next.js 16 (`proxy.ts`, not middleware) + React 19.2 ·
Tailwind v4 + shadcn/ui · NestJS 11 · Drizzle + NeonDB (Postgres + PostGIS) · Better Auth ·
Redis/BullMQ · Cloudinary (schema doc says "R2" — brief overrides, Cloudinary is final) ·
Flutterwave · Africa's Talking · Soketi · Sentry · **Node 24** (local: `nvm use 24`;
system node is 22 — always run pnpm under Node 24).

## Phase 1 MVP scope decision (2026-07-30)

- These are **product launch phases**, separate from the historical
  "Frontend Phase 1–6" implementation headings later in this file.
- **Real-money payments are Phase 2.** Phase 1 launches verification,
  discovery, landlord/property onboarding, Ops/admin workflows, profiles, and
  communication without activating Flutterwave checkout.
- The reservation/payment schema, adapter, webhook, jobs, and UI already built
  remain in the codebase; they are dormant foundation, not Phase 1 launch scope.
- `StubPayments` remains local/test infrastructure only. Before exposing a
  Phase 1 production deployment, add a server-enforced
  `PAYMENTS_ENABLED=false` switch that hides payment entry points and rejects
  hold/payment initiation. Do not use `ALLOW_STUB_INTEGRATIONS=true` to present
  fake checkout to public users.
- Phase 2 must finish real provider transaction/amount verification, refund
  execution/reconciliation, and live-reservation occupancy guarantees before
  accepting money.

## Repo layout

- `apps/api` — NestJS 11 backend (the "backend folder"). Deploys to Render.
- `apps/web` — Next.js 16 frontend (scaffolded, Phase 1 done). Deploys to Vercel.
- `packages/shared` — Zod schemas + enums. **Compiled to `dist/`** (`pnpm build`) because
  Nest consumes it at runtime; Next will use dist too. Enum arrays here are the single
  source of truth — Drizzle pgEnums derive from them (`apps/api/src/db/schema/enums.ts`).
- `packages/config` — shared tsconfig/eslint/prettier.

## Database & RLS (done — do not weaken)

- Schema: 25 tables in `apps/api/src/db/schema/`, reproduced column-for-column from the
  design doc (`OwnResourceFolder/Database schema design/`).
- Migrations: `apps/api/migrations/`. `0000_*` = drizzle-generated DDL. `0001_rls_hardening.sql`
  = PostGIS, CHECK constraints, triggers, grants, and **every RLS policy** (brief §8 matrix).
  Drizzle is forward-only (no down migrations) — fix-forward with a new migration.
- **Runtime identity model:** API must connect as a role inheriting `app_user` (NOLOGIN,
  created in 0001), never the DB owner. `withRlsContext()` (`src/db/rls-context.ts`) binds
  `app.user_id`/`app.user_role` via `set_config(..., true)` inside a transaction.
  `service_role` = server-internal paths (webhooks, jobs) only — never client-derived.
  On Neon: create a login role `IN ROLE app_user` for the API's `DATABASE_URL`.
- DB-enforced invariants (not just app logic):
  - 6-component checklist trigger: listing → `verified` requires a passed,
    lead-approved visit with all six components passed. Keys mirror
    `VERIFICATION_CHECKLIST_COMPONENTS` in shared (update both together).
  - Partial unique index `reservations_one_live_hold_per_unit` — the real
    double-booking guarantee (Redis lock is just an optimization).
  - `payments.provider_txn_id` UNIQUE — webhook idempotency anchor.
  - Reviews: trigger + RLS both require fulfilled reservation owned by reviewer.
  - 3 landlord strikes → auto-suspend landlord + their verified listings.
  - `audit_log`, `reviews`, `landlord_strikes`, `student_flags`, `listing_photos`:
    UPDATE revoked at the grant level (append-only even for service_role).
- `reputation_scores` = materialized view (unique index present → refresh CONCURRENTLY).

## RLS tests (the "tested, not assumed" rule)

`apps/api/test/rls/rls.spec.ts` — 16 tests run as the real `app_user` role.
To run: `docker compose -f apps/api/docker-compose.test.yml up -d --wait`,
then `DATABASE_URL=postgresql://campushomes:campushomes_test@localhost:54329/campushomes_test pnpm --filter @campushomes/api db:migrate`,
then `pnpm --filter @campushomes/api test`.
Any new table ⇒ new policies in a new migration ⇒ new tests in this suite. No exceptions.

## Decisions made mid-build (flagged per autonomy ladder)

- `users` table has **no self-UPDATE policy** — a client-editable users row would expose
  `role`/`status` escalation. Profile edits go through service paths.
- Landlord self-update on `landlords` allowed only while `kyc_status = 'pending'`.
- Reservations/payments/move_ins writes are service_role-only (per §8), including
  student hold creation — the ReservationsModule state machine is the only write path.
- eslint: flat config, typescript-eslint recommended, `no-explicit-any` = error.
- Better Auth tables (`sessions`, `verification_tokens`) authored per design doc;
  AuthModule integration may add Better Auth's own required columns — do it in a NEW
  migration, don't edit 0000/0001.
- **AuthModule (done, migration 0002):** Better Auth 1.6 mapped onto design-doc tables
  (`users`/`sessions` gained name/image/email_verified/phone_verified + sessions.token/
  updated_at) plus Better Auth's own `accounts` (password hashes) and `verifications`
  (OTP values) tables — both service-role-only under RLS. Design-doc `verification_tokens`
  is NOT used by Better Auth (incompatible shape); kept as-is. `generateId = randomUUID`
  so uuid columns work. `role`/`status` are additionalFields with `input:false` — client
  can never set them; defaults student/pending. Email/password sign-up disabled
  (`disableSignUp`) — ops/admin seeded via service paths only. Better Auth runs on a
  **dedicated pool** with startup GUC `-c app.user_role=service_role` (its queries are
  pre-auth identity bootstrapping; pool never exported from AuthModule). 0002 grants
  app_user DELETE on sessions/verifications (sign-out, OTP consumption) — DELETE stays
  ungranted everywhere else. Handler mounted express-level at `/api/auth` with Nest
  bodyParser disabled, json() re-added after it (raw-body ordering). `loadEnv()` treats
  empty-string env values as unset (blank `.env` placeholders were failing min-length).
  RLS suite now 22 tests (6 new for auth infra).
- **Backend MVP modules (done):** Listings, Ops, Reservations, Notifications, Chat,
  Jobs, Uploads — 27 routes under `/api/v1` + auth. Key patterns, don't regress:
  - `RlsDb.run(ctx, fn)` (src/db/db.module.ts) is the ONLY way services query —
    wraps every query in a withRlsContext transaction. Public reads use nil-uuid
    student ctx; unit availability + thread provisioning + reservation writes use
    service_role ctx with in-code party checks (RLS can't scope service writes).
  - Reservation hold: Redis SET NX lock (optimization) → insert; 23505 from the
    partial unique index = real double-booking guard. Drizzle wraps pg errors:
    check `err.cause.code`, not `err.code`.
  - Flutterwave webhook: `verif-hash` header equality (not HMAC-of-body), idempotent
    on provider_txn_id; expired-hold payments auto-refund (reason cooling_off).
  - Ops visit sync idempotent on client_idempotency_key (unique index); replay
    returns the stored row untouched.
  - Adapters (src/adapters/): Messaging (AT), Payments (Flutterwave|Stub),
    Realtime (Soketi|Noop) — stub/noop fallbacks only outside production; every
    module factory throws in production if its secret is missing.
  - BullMQ (in-process, JobsModule): hold_expiry per-hold delayed job +
    maintenance queue schedulers (SLA hourly, rollover daily). bullmq pins
    ioredis 5.10.1 — keep ours identical or types clash.
  - Units are ops-created at publish time (RLS: landlords can't insert units).
  - Tests: apps/api/test/services/reservations-flow.spec.ts (12) + RLS suite (22);
    jest --runInBand (two suites share the docker DB). `pnpm drizzle-kit check` +
    `db:generate` must stay at "no schema changes".
  - Frontend guide: FRONTEND.md at repo root (endpoint inventory + build order).

- **Frontend Phase 1 (done):** `apps/web` scaffolded (Next 16.2.10, React 19.2.4,
  Tailwind v4 CSS-first, no tailwind.config). Design context: `PRODUCT.md` + `DESIGN.md`
  at repo root — brand teal/coral from `CampusHomes_Website_Design_Scheme.docx`, OKLCH
  tokens in `src/app/globals.css` @theme, Poppins/Open Sans via next/font. Key patterns:
  `src/lib/session.ts` `requireRole()` guards each route-group layout (UX-only; RLS is
  real enforcement); `src/lib/auth-client.ts` Better Auth client (phone OTP + staff
  email, wired + working); `src/lib/api.ts` thin `/api/v1` fetch wrapper; shadcn-style
  primitives hand-rolled in `src/components/ui/`. VerifiedBadge = only element allowed
  solid teal fill. Landlord kyc-gate deferred to Phase 3 (kyc_status not in session).
  next-intl scaffolded, single `en.json`. `.env.local` needs creating from FRONTEND.md §3
  (protect-files hook blocks agents writing `.env*`). Landing/search/sign-in static;
  portal shells dynamic. pnpm-workspace `allowBuilds`: @swc/core, sharp, @parcel/watcher
  now true.

- **Frontend Phase 2 (done):** public search + map + listing detail, QA'd in browser
  against the live API (Test Hostel row on the Neon dev DB). Key facts:
  - **Search RLS gap fixed in listings.service.ts:** `properties` has no public
    SELECT policy (owner+ops only, 0001), so the public search join returned
    nothing. Search now runs under `SERVICE_CTX` (service_role) with the SQL
    itself constraining `status='verified'` + explicit column list — same
    precedent as the unit-availability check. Detail response gained a
    `property` object (name/street_address/gps, snake_case raw row) fetched the
    same way. Alternative (a 0003 migration adding a public-read policy on
    properties-with-verified-listing) is open if we'd rather have RLS carry it.
  - **CORS + trustedOrigins:** new `WEB_ORIGIN` env (default http://localhost:3000)
    drives `app.enableCors({origin, credentials:true})` in main.ts and Better Auth
    `trustedOrigins`. localhost:3000→4000 is cross-origin; FRONTEND.md §4's
    "localhost works without it" was wrong. Set WEB_ORIGIN to the Vercel URL in prod.
  - Response contracts now in shared (§14): `listingSearchResultSchema` (raw
    snake_case SQL row, zod-coerced numerics) + `listingDetailResponseSchema`;
    web runtime-parses responses with them.
  - Map: `src/components/map/listings-map.tsx`, maplibre-gl 5 + OSM raster style,
    always-visible AttributionControl (OSM policy), price pins = teal-900
    (solid teal-600 stays reserved for VerifiedBadge), moveend→debounced
    bounds→React Query. Search client parses+renders; detail is a server
    component (`cache: 'no-store'`).
  - Cloudinary photo URLs need `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`; placeholder
    renders until set. next.config allows res.cloudinary.com images.

- **Frontend Phase 3 (done):** Landlord KYC onboarding — backend `LandlordsModule`
  (`GET/POST /landlords/me`, `/landlords/profile`), 3-step wizard, dashboard gate. Key facts:
  - `landlords` table already had `legalName`/`kycStatus`/`idDocStorageKey` + RLS
    (`landlords_self_insert`, `landlords_self_update` pending-only, 0001) — no new
    migration needed for this phase.
  - shared: renamed the unused `createLandlordProfileSchema` → `upsertLandlordProfileSchema`
    and added `idDocStorageKey`; added `DocType`/`PropertyType`/`PropertyStatus` type
    exports to enums.ts (existed as const arrays only, no inferred type).
  - Wizard steps: legal name → ID doc upload → property + one supporting document,
    reusing `POST /uploads/sign` + a new `uploadToCloudinary()` helper (`lib/cloudinary.ts`)
    for the direct-to-Cloudinary upload. Route is `(landlord)/landlord/onboarding/page.tsx`
    — route groups add no path segment, so it must nest under `landlord/`, not sit beside
    it (first version 404'd at `/onboarding` instead of `/landlord/onboarding`).
  - Gate is page-level, not layout-level: `onboarding/page.tsx` redirects to `/landlord`
    once any property exists (onboarding is one-time, not re-run once verified);
    `landlord/page.tsx` redirects back to onboarding until one does. `layout.tsx` still
    only guards role — kyc_status needs an API read, not the session.
  - **Auth gap found, not fixed (pre-existing, blocks real landlord signup):** phone-OTP
    signup always defaults `role: 'student'` (`input: false` in auth.config.ts) — there's
    no self-serve path to become a landlord yet, and no ops-side endpoint to flip
    `landlords.kyc_status` to verified either (KYC review has no UI/route anywhere).
    QA'd this phase by promoting a test user's role and kyc_status directly in the local
    docker DB; both need a real fix before landlords can onboard in production.
  - Local dev note: the docker test DB (`docker-compose.test.yml`, port 54329) had
    exited and `apps/api/.env` `DATABASE_URL` points at it directly — start it
    (`docker compose -f apps/api/docker-compose.test.yml up -d --wait`) before
    `pnpm dev`, not just for the RLS suite.

- **Frontend Phase 4 (done):** Student reservation flow (§9 flow 4) — reserve →
  checkout redirect → payment webhook → move-in confirm, all against the live
  ReservationsModule (no mocks). Key facts:
  - **Real blocker found and fixed:** `reservations.student_id` FKs to
    `students.user_id`, but no frontend ever created that row (only the raw
    `POST /students/profile` endpoint existed, no GET, no UI) — every student
    hit a raw 500 (FK violation) trying to reserve. Added `GET /students/me`,
    a minimal one-field (university, optional year) profile page at
    `(student)/profile`, and a gate on the listing detail page: student without
    a profile sees "Complete your profile to reserve" instead of Reserve
    buttons. Also hardened `reservations.service.ts createHold` to check for
    the `students` row itself and throw a clean 403 instead of leaking the raw
    DB constraint error — defense in depth for anyone hitting the API directly.
  - `lib/server-api.ts` — extracted the cookie-forwarding `apiServer()` helper
    (previously duplicated inline in `lib/landlord.ts`) since `lib/student.ts`
    and `lib/reservations.ts` needed the same thing.
  - `components/reserve-button.tsx` — generates `crypto.randomUUID()`
    client-side, POSTs `/reservations/holds`, hard-redirects
    (`window.location.href`) to the returned `checkoutUrl`.
  - `(student)/reservations/reservations-list.tsx` — `/reservations/mine`
    only returns the bare reservation row (no listing/property join), so the
    list is intentionally minimal: status, fee, hold countdown, cancel,
    confirm-move-in. A held reservation polls `/reservations/:id/payment-status`
    every 4s (the one place that needs the per-id endpoint) and
    `router.refresh()`s once payment resolves, rather than trying to reflect
    payment state from the list endpoint.
  - `/profile?next=<path>` sanitizes `next` server-side (must start with a
    single `/`) before ever calling `redirect()` — an unsanitized query param
    redirect would otherwise be an open-redirect vector.
  - QA'd live end-to-end against the local docker test DB: profile gate →
    reserve → stub checkout redirect (real, since `FLUTTERWAVE_SECRET_KEY` is
    unset) → simulated the Flutterwave webhook manually (temporary
    `FLUTTERWAVE_WEBHOOK_HASH` shell override, not written to `.env`) →
    confirmed `fulfilled` + move-in confirm + cancel-hold, all verified
    against real DB rows, not assumed.
  - Caught and fixed one stale-UI bug during QA: the "Confirming payment…"
    chip kept showing after a cancel because it was gated on local
    `paymentStatus` state alone; now also gated on `reservation.status === 'held'`.

- **Frontend Phase 6 (done): Chat** — per-reservation student↔landlord
  messaging, REST history + Soketi live updates degrading to a 4s poll.
  Key facts:
  - **Gap found and closed: Pusher private channels need a server-side auth
    endpoint.** `private-thread-{threadId}` is a *private* channel —
    `pusher-js` refuses to subscribe without a signed handshake, and nothing
    in `apps/api` did this before. Added `POST /chat/pusher/auth`
    (`ChatController`/`ChatService.authorizeChannel`): regex-validates the
    channel name *before* any DB call, then does an RLS-scoped
    `chat_threads` lookup (same policy `messages()` already relies on) to
    confirm the caller is a participant, then delegates to
    `RealtimeAdapter.authorizeChannel()` (new interface method — local HMAC
    signing via the `pusher` package, no network call; `NoopRealtime`
    returns `null` → 503 when Soketi isn't configured). Covered by
    `apps/api/test/services/chat-pusher-auth.spec.ts` (participant/
    non-participant/malformed-channel/Soketi-unconfigured, 4 tests) — the
    one place a bug could leak another thread's live messages.
  - **Gap found and closed: no landlord-side reservations view existed.**
    `GET /reservations/landlord-inbox` was already live on the backend but
    unused by the frontend. Added `(landlord)/landlord/reservations/`
    (mirrors the student reservations-list minimalism — bare status rows,
    no listing join) as the landlord's chat entry point.
  - Chat UI: `MessageButton` (both portals) calls
    `POST /chat/threads/:reservationId` (idempotent — unique index on
    `reservation_id`) then routes to `?thread=<id>`; `ChatInbox`
    (thread list + message pane + composer) is one shared component mounted
    at `/messages` (student, bare route) and `/landlord/messages` (landlord,
    nested under `landlord/` — route groups add no path segment, the exact
    mistake that 404'd once already in Phase 3 onboarding).
  - `useThreadMessages` hook: always fetches history first: if
    `NEXT_PUBLIC_SOKETI_HOST`/`_KEY` are both set, subscribes via
    `pusher-js` with a `channelAuthorization.customHandler` posting JSON to
    `/chat/pusher/auth` (not the default form-encoded `authEndpoint` —
    needed cookie-credentialed `api()`, matching Better Auth's session
    model); otherwise polls every 4s. Both env vars are unset locally
    (Soketi still unprovisioned, per FRONTEND.md §10) — poll path is what
    actually runs today.
  - QA'd live end-to-end: real phone-OTP signup for a landlord and a
    student (OTP read from the `verifications` table — Africa's Talking
    sandbox doesn't deliver to fake numbers), landlord promoted to
    `role='landlord'`/`kyc_status='verified'` directly in the docker DB
    (same precedent as Phase 3 — no self-serve landlord signup exists yet,
    see below), a listing published through the real `OpsService.publishListing()`
    path, then a real reserve → message → reply → poll-delivery round trip
    confirmed in the browser (message sent from one tab appeared in the
    other, already-open and idle, without a reload — the specific poll
    behavior a fresh-navigation check can't distinguish from initial fetch).
  - One real bug caught only by the full `pnpm lint` gate (not by
    typecheck, which the task-level review had run): `react-hooks/set-state-in-effect`
    on a synchronous `setMessages([])` in the hook's `!threadId` branch.
    Fixed by deriving the empty case in the return statement
    (`messages: threadId ? messages : []`) instead of resetting state
    inside the effect.

- **RBAC Foundation (Phase A) (done):** data-driven fine-grained authorization
  layer on top of the existing 5-value `app.user_role` enum — plan:
  `docs/superpowers/plans/2026-07-19-rbac-foundation.md`, spec:
  `docs/superpowers/specs/2026-07-19-rbac-foundation-design.md`. Migration
  `0003_rbac.sql` adds `roles`/`permissions`/`role_permissions`/
  `user_role_assignments`/`approval_requests` — all `svc_all` RLS (service_role
  only, same posture as `accounts`/`verifications`), seeded with 7 staff roles
  and a 63-permission catalog. RLS suite now 27 tests (was 22).
  - 7 staff roles map onto the existing `app.user_role` enum via
    `ROLE_TO_DB_ROLE` in `staff.service.ts`: `ops_lead`/`ops_inspector` keep
    their own dedicated enum values, the other 5 (`super_admin`,
    `platform_admin`, `finance_admin`, `support_admin`, `auditor`) collapse
    to `admin`. Fine-grained gating is `PermissionsGuard`
    (`src/modules/auth/permissions.ts`), not the enum.
  - `PermissionsGuard`/`@RequirePermission()` does a **per-request DB
    lookup** (`loadPermissions`), not session-baked — revocation is
    immediate. Step-up-gated permissions (`requiresStepUp` on the
    permission row) fail closed (`501 NotImplementedException`) until a
    later phase wires real MFA reverification.
  - `StaffModule` (`src/modules/staff/`) exposes `/api/v1/admin/staff/*`
    (invite/list/deactivate/assign-role/revoke-role) and
    `/api/v1/admin/audit-log` — first real consumer of the RBAC layer.
    `approval_requests` table exists with no consumer yet (deferred).
  - **Security gap found and closed mid-build, deviating from the plan
    text:** the plan's own Step 3 code for `deactivate`/`revokeRole` had no
    actor-scope check (unlike `grantRole`, which correctly calls
    `hasCoveringScope`) and no self-deactivation guard — a
    `platform_admin` holding `staff.deactivate` could deactivate *any*
    staff account platform-wide, including a `super_admin`. Flagged by an
    automated security review, confirmed against the plan text, escalated
    to the user (per subagent-driven-development's "plan-mandated finding
    = human decides" rule) — approved to fix now. Two rounds: Fix 1 added
    `hasCoveringScope` checks + self-block, but a `platform_wide` actor
    assignment covers everything unconditionally in `hasCoveringScope`, so
    a `platform_admin` without `roles.manage_super_admin` could still
    reach a `super_admin` target — task reviewer caught this as a Critical
    finding. Fix 2 added a role-tier gate mirroring `grantRole`'s existing
    `roles.manage_super_admin` check, independent of scope, on both
    `deactivate` and `revokeRole`. Both now: block self-target, fail
    closed if the target has zero active role assignments, require
    covering scope, and require `roles.manage_super_admin` whenever the
    target holds `super_admin` — regardless of the actor's own scope.
  - Executed via superpowers:subagent-driven-development in
    `.worktrees/rbac-foundation-phase-a` (branch `rbac-foundation-phase-a`);
    ledger at `.superpowers/sdd/progress.md` in that worktree.
  - **Known Phase A→B gap, accepted deliberately (final whole-branch review,
    confirmed by Festo 2026-07-19):** `staff.deactivate`, `roles.assign`,
    `roles.revoke` are seeded `requires_step_up = true`, so
    `PermissionsGuard` 501s all three unconditionally — nobody, not even
    `super_admin`, can call them until Phase B ships real MFA
    reverification. Meanwhile `POST /admin/staff/invite` (`staff.invite`,
    not step-up-gated) internally calls the same `grantRole` logic, making
    invite the only *live* way to grant any role — including
    `super_admin` — with no step-up barrier today. This is accepted as-is:
    invite still enforces scope + the `roles.manage_super_admin` tier
    gate, and no real MFA exists this phase regardless, so no path has a
    working step-up barrier yet. Revisit when Phase B lands MFA — either
    gate invite the same way, or accept invite as the intentionally
    softer onboarding path.
  - **Thin admin portal (Phase C-lite, done 2026-07-19):** first `apps/web`
    consumer of the StaffModule API. `(admin)/admin/` route group — layout
    `requireRole(["admin"])` + SidebarShell "Admin"; `/admin` staff table +
    invite dialog (all 7 RBAC roles, platform_wide/catchment scope,
    `POST /admin/staff/invite`); `/admin/audit-log` (latest 100). Sign-in
    redirect for role=admin changed `/ops` → `/admin`; ops portal still
    admits admin (sidebar links back to it). Deliberately NO assign/revoke/
    deactivate UI — those endpoints 501 until Phase B MFA; one static note
    instead of dead buttons. Known gap recorded, not fixed: invite creates
    the users row + role assignment but NO credential account — invited
    staff can't sign in until a password is seeded (email/password sign-up
    is disabled). Full Phase C (resource controls) still unstarted.
  - Local dev admin login (docker test DB only, seeded via one-off scratch
    script, not committed): `festo@campushomes.ug` / `admin1` — role=admin,
    super_admin RBAC assignment platform_wide.
  - RLS suite: 27 tests. Service suites: `rbac-permissions.spec.ts` (6),
    `rbac-staff.spec.ts` (15). `apps/api` total: 70 tests, all green.
    `pnpm drizzle-kit check` stays at "Everything's fine".

- **Pan-African phone, form-required markers, profile editability, personal
  calendar (2026-07-24):**
  - `packages/shared/src/phone.ts`: `AFRICAN_COUNTRIES` (54 AU/UN dial codes)
    plus an `africanPhone` schema (any listed dial code, 6-10 national digits
    — deliberately not locked to one country's exact format) replaces
    Uganda-only `ugPhone` on the admin user/staff-invite `phone` fields.
    `ugPhone`/`normalizeUgPhone` still exist and still gate the phone-OTP
    sign-in/signup flow (`auth.ts` schemas) — **deliberately left
    Uganda-only**, since OTP delivery runs on an Africa's Talking sandbox
    scoped to UG; widening that is an SMS-infra/cost decision, not a
    validation tweak. `PhoneField` (`components/phone-field.tsx`) is the
    country-select + number widget wired into the admin user editor, staff
    invite, and both self-service "my profile" particulars forms.
  - Root cause of the confusing "phone: Enter a Ugandan mobile number…"
    error (admin Edit User modal): not a messaging bug — the schema was
    validating every country's number against Uganda's regex alone.
    Country-aware validation replaces the single fixed message.
  - `AdminField`/`Label` both grew a `required` prop (red asterisk) —
    applied wherever the paired input already carries a native `required`
    attribute, across the admin console, sign-in, ops visit/strike forms,
    and landlord onboarding/property forms.
  - Admin "Add property" semester bug: catchment defaulted to a hardcoded
    `"MUK"` regardless of the selected landlord, so a landlord with no MUK
    semester saw a dead "No applicable semesters" field on open.
    `properties-manager.tsx` now derives the default catchment from that
    landlord's own existing properties, falling back to whichever catchment
    actually has a semester configured — never a blind MUK default.
  - Self-service particulars: `users` still has no self-UPDATE RLS policy
    (role/status escalation risk), so `PATCH /students/particulars` and
    `PATCH /landlords/particulars` (`modules/profile/particulars.ts`, shared
    by both controllers so the field allowlist can't drift) run as
    service_role, hand-picking only name/DOB/gender/nationality/address/
    emergency-contact — never role, status, email, or phone. Student
    `/profile` no longer redirects away once a profile exists (the original
    bug — "not editable"); it now shows a full edit form gated only on an
    explicit `next` param from the reserve-flow redirect. Landlord profile
    gained the same particulars section below the existing KYC-gated
    legal-name/ID-doc block.
  - New `calendar_events` table (migration `0016_calendar_events.sql`,
    hand-written — see gotcha below) + RLS (`calendar_events_self`:
    `user_id = app_user_id()`, `svc_all` bypass). Personal task/reminder
    calendar, **not** wired to the `calendar.manage_owned`/
    `manage_assigned`/`read_own` permission keys already seeded in 0013
    (those anticipate a shared per-property crew calendar — bigger scope,
    deferred). Any authenticated role gets their own calendar: `CalendarModule`
    (`/api/v1/calendar`, list/create/patch/delete, no `@Roles()` — RLS alone
    scopes it), month-grid + upcoming-list UI (`components/calendar/
    calendar-view.tsx`) mounted at `/calendar` (student) and
    `/landlord/calendar`. RLS suite: 7 new tests (34 total).
  - **Gotcha for the next migration:** `drizzle-kit generate` is currently
    unsafe to run — the snapshot chain has a gap (`migrations/meta/` has no
    `0012`–`0015_snapshot.json`, only `0011_snapshot.json` then a stale
    `0016`), so `generate` diffs against the 0011 schema state and tries to
    recreate every table/column added since (property_media, semesters
    columns, users particulars columns, etc.) as if new. 0013-0016 were all
    hand-written directly against Postgres + the journal for this reason;
    `drizzle-kit check` still reports "Everything's fine" (it only checks
    journal consistency, not a live diff), so that invariant holds, but
    trusting `generate`'s output without diffing it first will corrupt a
    future migration.
  - Verified: shared package builds, `apps/api` typecheck/lint/test all
    green (102/102, up from 70), `apps/web` typecheck/lint green. One
    pre-existing unrelated failure not touched: `src/modules/ai/*` has 8
    lint errors and one typecheck error (untracked WIP predating this
    session).

- **Admin activities board (2026-07-24):** shared staff calendar the admin
  sidebar was missing — create/assign/track platform activities across the
  whole ops/admin team, distinct from the personal `calendar_events`
  (student/landlord, ownership-scoped) shipped earlier the same day.
  - Migration `0017_activities.sql`: two new permission keys,
    `activities.manage` and `activities.read` — deliberately **not** the
    `calendar.manage_owned`/`manage_assigned`/`read_own` catalog seeded in
    0013 (those are property-ownership scoped for landlord/custodian/
    property_worker and don't fit "assign to any staff member"). Granted
    `activities.manage` to super_admin/platform_admin/ops_lead,
    `activities.read` to all 7 staff roles. New `activities` table
    (title/description/type/status/starts_at/ends_at/all_day/assigned_to/
    created_by) is **svc_all-only RLS** — same posture as `roles`/
    `staff`-adjacent tables, not owner-scoped like `calendar_events`;
    `PermissionsGuard` is the real gate, service_role does the write after
    it passes. RLS suite: +4 tests (106 total, was 102).
  - Backend: `AdminActivitiesController`/`AdminActivitiesService`
    (`apps/api/src/modules/staff/`, registered in the existing
    `StaffModule` alongside the other `admin-*` controllers) —
    `/api/v1/admin/activities` CRUD plus `/admin/activities/assignees`,
    which reuses `StaffService.list()` rather than duplicating the staff
    roster query.
  - Frontend: `(admin)/admin/activities/` — new sidebar nav item (gated on
    `activities.manage`/`activities.read`, same `any`-permission pattern as
    every other admin nav item), month-grid calendar UI
    (`activities-manager.tsx`, styled to match the admin console rather
    than reusing the portal `CalendarView`'s dark-card look) with
    create/edit/assign/status and a read-only mode for `activities.read`
    -only roles (auditor, finance_admin, support_admin, ops_inspector).
  - Verified: shared/api/web typecheck all green, `apps/api` test 106/106,
    `apps/web` test 13/13, `drizzle-kit check` still "Everything's fine".
    Lint clean on every touched file; the only lint failures are the
    pre-existing untouched `src/modules/ai/*` errors noted above.

- **RBAC scope-check gap in the live admin console, closed (2026-08-02):**
  verifying the already-built RBAC system (11 roles, 142-permission catalog,
  `roles-manager.tsx` + `users-manager.tsx`) surfaced that `AdminUsersService`
  (`src/modules/staff/admin-users.service.ts`, backing `/admin/users/*` — the
  endpoint the live Users console actually calls) never got the
  `hasCoveringScope` fix that `StaffService` (`/admin/staff/*`) already has
  from the original RBAC Foundation incident. `assignRole`/`revokeRole`/
  `grantPermissions` had no scope check at all, and `revokePermission` didn't
  even receive the actor's permissions/assignments — so anyone holding
  `roles.assign`/`roles.revoke`/`users.permissions_manage` could grant or
  revoke any role/permission at any scope for any user, regardless of their
  own assignment's scope (short of the already-separately-gated `super_admin`
  role and `roles.manage_super_admin` permission). Fixed by porting the same
  `hasCoveringScope` check into all four methods, threading `req.assignments`
  through `AdminUsersController`, and adding a self-target guard to
  `assignRole`/`grantPermissions` (`StaffService.grantRole` already had this;
  `AdminUsersService` didn't). New `test/services/admin-users-rbac.spec.ts`
  (13 tests) covers scope enforcement and grant/revoke round trips via
  `loadPermissions`, mirroring `rbac-staff.spec.ts`. Also found: the docker
  test DB persists across sessions and can drift behind new migrations
  silently (missing `users.deleted_at` caused early failures) — run
  `db:migrate` against it if service-layer tests throw unexpected "column
  does not exist" errors. Also found: `better-auth/crypto` is ESM-only and
  Jest has no transform pattern for it — nothing had imported it in a test
  before, `jest.mock('better-auth/crypto', ...)` in the spec file sidesteps
  it without touching the shared jest config. RLS/service suites: 134/134
  passing (was 106 last recorded).

- **Verification flow dead-end — approved property could never publish, fixed
  (2026-08-12):** an inspected+approved property was stuck: gone from the lead
  queue (approved) but with no way to publish → never verified → never on the
  landlord dashboard. Two causes: (1) staging ran pre-`cee6cb3` code where
  `OpsService.queue()` only surfaced `result='pending'`, so a passed-but-
  unapproved visit vanished from the lead queue — main has carried the
  `(result='passed' AND approved_at IS NULL)` clause since Aug 2, so **staging
  just needed a redeploy**; (2) the real code gap — **no listing is ever
  created in the onboarding→verify path.** `ListingsService.submitProperty()`
  creates only the property row; `POST /listings/drafts` exists but no UI calls
  it; only the admin properties-manager makes a listing (when units+semester
  given). Publish flips an existing listing to verified, so with zero listings
  the lead's approve→publish path dead-ends. Fix (chosen: ops creates the
  listing at final verification): new `GET /ops/properties/:id/publishable-
  semesters` (applicable-to-catchment semesters without a listing yet, read
  under ops ctx) + `POST /ops/listings/draft` (`OpsService.createDraftListing`,
  **service_role write** — ops can't INSERT listings under RLS; idempotent on
  the `listings_property_semester_uk` unique index, refuses if already verified
  for that semester). Visit-detail page: when `approvedAt && result='passed' &&
  no listing`, renders `CreateListingToPublish` (semester picker → creates
  draft → routes to the existing `/ops/publish/:listingId` form). No migration
  (uses existing tables/RLS). Tests: `ops-directory.spec.ts` +5 (11 total).
  Confirmed unrelated pre-existing breakage: `finance-reports.spec.ts` fails
  4/4 on clean HEAD (ledger_accounts test-data pollution + a `rows[0].id`
  TypeError) — not touched here.

## Resolved (was brief §20 open item)

**MapLibre GL + OSM raster tiles — decided by Festo 2026-07-08.** No Mapbox, no map
billing. Tile URL overridable via `NEXT_PUBLIC_TILE_URL` (defaults to
tile.openstreetmap.org; OSM attribution required and rendered in the map component).
Swap to a paid/self-hosted tile server later = env change only.

## Verification loop

Nothing is "done" until `pnpm lint && pnpm typecheck && pnpm test` are green at root.

- **Student support desk — inquiries form → ops/admin consoles + email (2026-08-23):**
  students submit categorized inquiries from `/support`; rows persist, staff see them in
  `/admin/inquiries` and `/ops/inquiries`, and each submission fires a best-effort email.
  Key facts:
  - Migration `0028_student_inquiries.sql` (hand-written like all post-0011): `inquiries`
    table + new permission keys `inquiries.resolve`/`inquiries.read`. Grants: resolve →
    super_admin/platform_admin/ops_lead/support_admin; read → those four + ops_inspector/
    finance_admin/auditor.
  - **RLS shape matters:** `withRlsContext` never `SET ROLE`s to a separate service role —
    even SERVICE_CTX runs as `app_user` with the `app.user_role` GUC flipped. So the staff
    resolve path needs UPDATE granted to `app_user`, and the ONLY thing keeping a student
    from resolving their own inquiry is the absence of a self-UPDATE policy. Policies are
    therefore split: `svc_all` FOR ALL, `inquiries_self_select`, `inquiries_self_insert`
    (no self-UPDATE). Grant is `SELECT, INSERT, UPDATE TO app_user`; a student UPDATE
    matches zero rows (calendar_events-style silent deny), covered by an RLS test.
  - **Nested-transaction bug found and fixed (also latent in activities):** calling a
    helper that does its own `rlsDb.run()` INSIDE an open run() grabs a second pooled
    connection whose transaction cannot see the uncommitted INSERT/UPDATE. Inquiries
    `create`/`resolve` read back via a same-handle `selectById(db, …)`; the identical
    pre-existing bug in `AdminActivitiesService.create` (always threw NotFound on the
    success path) and `.update` (returned the stale pre-update row) was fixed the same
    way with inline same-tx selects. Never nest rlsDb.run for read-backs of writes made
    in the outer transaction.
  - Email leg: plain-fetch Resend (same pattern as `auth.email.ts`) gated on
    `SUPPORT_NOTIFY_EMAILS` (comma-separated) + `RESEND_API_KEY`; unset inbox = stored-
    only with a log line. Fire-and-forget with .catch — mailer failure must never fail
    the student's POST.
  - Web: public `(public)/support/page.tsx` branches on session — students get the
    `SupportDesk` component (form + their threads + responses); everyone keeps the
    contact card. Staff view is one shared `InquiriesManager` component mounted at BOTH
    `(admin)/admin/inquiries` and `(ops)/ops/inquiries` (ops_lead can't reach /admin —
    requireRole(["admin"]) is enum-only). API path is `/admin/inquiries` from both
    portals; PermissionsGuard decides, not the portal. Admin nav item gated on the new
    permission keys via the standard `any: string[]` pattern.
  - Pre-existing breakage fixed en route: `reservations-flow.spec.ts` failed standalone
    ("Invalid environment configuration: DATABASE_URL") because ReservationsService calls
    loadEnv() at construction and bare `pnpm test` exports nothing — added the same
    one-line bootstrap it already had for PAYMENTS_ENABLED. Verified-by-stash unrelated
    failure NOT touched: `apps/web/src/app/dev/checkout/[txRef]/page.test.tsx` fails on
    clean HEAD too.
  - Verified: shared builds; api typecheck/lint/test green — 231/231 across 22 suites
    (RLS suite includes 6 new inquiries tests; service spec `inquiries.spec.ts` 7);
    web typecheck/lint green, web tests 30/31 (the 1 failure pre-existing above);
    `drizzle-kit check` still "Everything's fine".

- **MVP checklist audit + readiness fixes (2026-08-23):** walked the full
  MVP build/test-readiness checklist against the code (verdict table in the
  session report; accounts/comms posture captured in new root `TESTING.md`).
  Fixes landed from it:
  - Search gained a `roomCategory` filter (shared schema + raw-SQL EXISTS
    clause — note the enum cast `$n::room_category`, NOT `::text`; pgEnum
    columns reject text comparison) and /search grew a room-type select.
    Availability is inherently filtered already (`unit_count > 0` +
    live-reservation/operational_status exclusions), so no separate toggle.
  - Listing detail now discloses `booking_fee_percent` /
    `advance_rent_required` ("Other charges" block in MoneyCard — data was
    captured at submission but never surfaced), shows an "Inspected <date>"
    stamp next to VerifiedBadge (listing.verifiedAt added to the detail
    response schema — zod strips undeclared keys, so adding display fields
    REQUIRES extending listingDetailResponseSchema), and a 3-step
    "Before you move in" explainer.
  - Inquiry resolve now writes `inquiry.resolve` to audit_log (AuditService
    injected into InquiriesService via OpsModule import; record() runs AFTER
    the tx closes — never nest it inside rlsDb.run).
  - Dev-DB test data: backfilled units.deposit_ugx (~25% of term rent, all
    344 units were NULL) so deposit disclosure is actually visible.
  - Deliberately NOT built (flagged as product decisions): viewing-request
    scheduling, compare tooling (favourites = shortlist reading), landlord-
    routed student enquiries (inquiries are staff-inbox by design; landlord
    comms = reservation chat threads), self-serve landlord signup.

- **Staging infra rescue + CI/CD from zero (2026-08-27 → 2026-08-31):**
  Neon → self-hosted Postgres migration surfaced two live outages
  mid-flight; became a full staging hardening pass plus CI/CD built from
  scratch. **Staging only — production untouched by any of this.**
  - Postgres: self-hosted `postgis/postgis:18-3.6-alpine` on the VPS
    (Dokploy Raw Compose). App was connecting as `campushomes`, the
    cluster **superuser** — superusers bypass RLS unconditionally.
    Created `campushomes_app` (LOGIN INHERIT IN ROLE `app_user`, not
    superuser) and repointed the app; `campushomes` is migrations-only
    now. **FORCE ROW LEVEL SECURITY** applied — was `false` on all 54
    RLS tables, meaning a table owner could bypass every policy with no
    error (`0030_force_rls.sql`, driven off `pg_class` so new RLS tables
    can't silently miss it). Daily backups to Backblaze B2, restore-verified.
  - Redis: self-hosted `redis:7-alpine` replacing Upstash after its free
    tier hit its request cap and crash-looped the API (mandatory startup
    check in `redis.module.ts`). `--appendonly yes`, `--requirepass` set.
    Gotcha: Compose `${VAR}` reads the host shell/`.env`, not the
    service's own `environment:` block — must use literal values in
    `command:`, and as YAML list form (a plain string mangles the
    password token via shell splitting).
  - PG17 → PG18 pins across `ci.yml`/`docker-compose.test.yml`/
    `docker-compose.local.yml` (digest-pinned). **PG18 changed its
    data-directory convention** — volumes must mount the parent
    `/var/lib/postgresql`, not `.../data`, or the container crash-loops
    on restart.
  - CI/CD built from zero (`.github/workflows/ci.yml`, repo had none
    before): `ci` job (lint/typecheck/migrate/test/both container builds
    against digest-pinned PG18) → `deploy-staging` job (`needs: ci`, main
    only) calls **Dokploy's REST API** (`POST /api/application.deploy`),
    not its deploy webhook — the webhook is a git-push-event *receiver*
    that 400s while Dokploy's own auto-deploy toggle is off, and auto-deploy
    off is exactly what a CI gate requires. Health-gate step polls
    `/api/v1/health` and fails the build if staging doesn't come back;
    `/health` now returns a `commit` field (SHA baked into the image at
    build time via `apps/api/Dockerfile` + `health.controller.ts`) so the
    gate asserts the *new* build specifically, not just "something healthy".
  - CI caught two real bugs invisible locally: specs read
    `TEST_DATABASE_URL`, not `DATABASE_URL` (workflow only exported the
    latter at first — falls back to `localhost:54329` locally, which
    resolves to a real DB there, masking the mismatch); and a semantic
    merge conflict where `main` and this branch each added a different
    `StaffService` constructor arity, merging cleanly but not compiling.
  - **Dokploy UI env edits do not reach the live Swarm service** —
    editing Environment in the dashboard updates Dokploy's stored copy
    only; the running service is unchanged until a deploy, and a deploy
    then overwrites the live service *from* that stored copy. A stale
    stored env silently reverts working credentials on the next deploy —
    this caused a multi-hour outage. Ground truth is always
    `docker service inspect <service> --format '...Env...'` on the VPS;
    force a live change with `docker service update --env-add
    KEY=value --update-monitor 60s --update-failure-action continue` (the
    monitor window matters — Swarm's default is shorter than the
    container's healthcheck start-period and will roll back a healthy
    deploy).
  - Verified end to end: `ci ✓ → deploy-staging ✓` in 2m5s; staging held
    45/45 HTTP 200 samples over 15 minutes spanning a real deploy;
    container creation timestamp on the VPS confirmed the new image
    actually took over (not just the health gate's word for it).
  - **Decided, not yet done (queued for the next work on this):**
    production has received **none** of this (self-hosted DB/Redis, role
    fix, FORCE RLS, backups, credential rotation, deploy gating stays
    manual by decision) — full hardening pass required before real users;
    Vercel retirement for `apps/web` (Dokploy wins — see below); rotate
    the staging passwords pasted in chat before any prod data; retire
    Neon (kept as cold fallback since 2026-08-27).

- **Post-handoff decisions locked (2026-08-31):**
  - **Web hosting: Dokploy, not Vercel.** Both were building
    `apps/web` on every push (Vercel's own trigger + Dokploy's
    `campus-homes-campushomeswebstaging`) — one is dead weight. Dokploy
    wins: one platform, one CI-gated deploy pipeline, one place to check
    health/logs, consistent with the API. Retire the Vercel project once
    Dokploy's web service is confirmed current at the real domain.
  - **Auth: full migration to Logto, dropping Better Auth entirely** —
    not a side-by-side or JIT scrypt-compat migration. All existing
    `users`/`accounts`/`sessions`/`verifications` rows get reset; every
    user (student, landlord, staff) re-authenticates fresh through Logto.
    Rationale (Festo): wants auth rebuilt properly this time — strong,
    secure, reliable — rather than carrying forward Better Auth's
    known gaps (no self-serve landlord signup, invited-staff-no-password
    bug fixed ad hoc in PR #41, disabled email/password signup as a
    workaround rather than a design). This supersedes the scrypt-spike
    plan floated at handoff — the spike is now moot, since nothing is
    being migrated, only reset.
  - **Phone-OTP stays on Africa's Talking** — Logto integrates it as a
    custom connector rather than switching to Logto's own SMS connector.
    Already working and tuned for UG delivery; no reason to introduce a
    second untested SMS deliverability/cost profile.
  - RLS/RBAC still key on `app.user_id`/`app.user_role` session GUCs
    (`withRlsContext()`) — the Logto migration must keep producing those
    same two values per request; nothing about the RLS design itself
    changes, only what issues the session.
