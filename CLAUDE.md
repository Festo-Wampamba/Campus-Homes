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

## Resolved (was brief §20 open item)

**MapLibre GL + OSM raster tiles — decided by Festo 2026-07-08.** No Mapbox, no map
billing. Tile URL overridable via `NEXT_PUBLIC_TILE_URL` (defaults to
tile.openstreetmap.org; OSM attribution required and rendered in the map component).
Swap to a paid/self-hosted tile server later = env change only.

## Verification loop

Nothing is "done" until `pnpm lint && pnpm typecheck && pnpm test` are green at root.
