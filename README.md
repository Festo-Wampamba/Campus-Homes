# CampusHomes

Verified student-housing marketplace for Kampala, Uganda, starting with
Makerere University. A landlord lists a property, CampusHomes' own field
agents physically verify it against a 6-component checklist, and the listing
goes live with a **Verified** badge. Rent and leases happen off-platform —
**verification is the product**; everything else in this codebase serves it.

**Phase 1 MVP scope:** discovery, verification, landlord/property onboarding,
operations, administration, profiles, and communication. Real-money checkout
is inactive. The built reservation/payment foundation remains available for
development, but the 5,000 UGX, 72-hour paid hold launches in Phase 2 only.
These are product launch phases, not the historical frontend implementation
phase numbers recorded in `CLAUDE.md`.

**Primary domain:** [campushomes.co.ug](https://campushomes.co.ug)

**Deployment panel:** Dokploy on a hardened Contabo VPS. Staging is served from
`staging.campushomes.co.ug` and `api-staging.campushomes.co.ug` before the
primary domain is cut over.

## Contents

- [How it works](#how-it-works)
- [Stack](#stack)
- [Architecture at a glance](#architecture-at-a-glance)
- [Repo layout](#repo-layout)
- [Prerequisites](#prerequisites)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Common scripts](#common-scripts)
- [Database](#database)
- [Authorization: Row-Level Security + RBAC](#authorization-row-level-security--rbac)
- [Domain model reference](#domain-model-reference)
- [API surface](#api-surface)
- [Testing](#testing)
- [Background jobs](#background-jobs)
- [Third-party services](#third-party-services)
- [Deployment](#deployment)
- [Contributing / conventions](#contributing--conventions)
- [Troubleshooting](#troubleshooting)
- [Documentation map](#documentation-map)

## How it works

Three role-gated audiences, one shared component language, plus a public
pre-login discovery surface:

- **Students** — search verified listings on a map, save options, and message
  landlords. Phase 2 adds paid reservation holds, Flutterwave checkout,
  move-in confirmation, and reviews. Primarily mid/low-end Android phones on
  patchy mobile data — the product is designed for that pocket first, not as
  an afterthought.
- **Landlords** — onboard once with KYC (legal name + government ID
  upload), list properties and room-type inventory, respond to a
  reservation inbox and chat with prospective tenants. Three verified
  strikes (`no_show`, `price_mismatch`, `amenity_fraud`, `abusive`, `other`)
  auto-suspend a landlord and every one of their verified listings.
- **Ops field agents** (inspectors + leads) — verify properties on-site
  against the 6-component checklist (often offline in the field), publish
  listings once verification passes, run the KYC review queue, and manage
  strikes. Their app is a first-class field tool, not back-office tooling.
- **Staff / Admin** — a fine-grained RBAC layer on top of the base role
  system: 7 staff roles (`super_admin`, `platform_admin`, `ops_lead`,
  `ops_inspector`, `finance_admin`, `support_admin`, `auditor`) drive an
  admin portal covering staff management, platform-wide dashboards, user
  and property administration, exports/reporting, integrations, and an
  append-only audit log.

The Phase 1 MVP loop:

```
landlord lists  →  Ops verifies (6-component checklist)  →  listing → verified
      →  student discovers/saves listing  →  student contacts landlord
```

The Phase 2 extension:

```
student places 72h hold  →  Flutterwave payment  →  fulfilled
      →  move-in confirmed (student / landlord / ops)  →  student review
```

## Stack

| Layer | Choice |
| --- | --- |
| Language | TypeScript everywhere |
| Package manager | pnpm workspace (`pnpm@11.9.0`), **Node 24** required (`engines.node >=24`) |
| Frontend | Next.js 16.2.10 (`proxy.ts`, not middleware) + React 19.2, Tailwind v4 CSS-first + shadcn/ui primitives |
| Backend | NestJS 11 |
| Database | Drizzle ORM 0.44 + NeonDB (Postgres 17 + PostGIS) |
| Authorization | Native Postgres **Row-Level Security** (not app-layer checks) + a data-driven RBAC layer for staff |
| Validation | `nestjs-zod` against one shared Zod schema package — single source of truth for frontend and backend, `zod` catalog-pinned to `^4.1.12` |
| Auth | Better Auth 1.6 — phone OTP (students/landlords) + email/password (staff) |
| Background jobs | BullMQ 5, in-process inside the Nest app, backed by Upstash Redis (`ioredis` pinned to `5.10.1` — BullMQ requires exact match) |
| Media | Cloudinary, direct-to-cloud signed uploads |
| Payments | Flutterwave foundation is built but inactive for the Phase 1 MVP; production activation, checkout, refunds, and reconciliation are Phase 2. `StubPayments` is development-only |
| SMS / OTP | Africa's Talking |
| Realtime | Soketi (Pusher-protocol) for chat; degrades to a 4s poll when unconfigured |
| Errors | Sentry (EU data region) |
| Maps | MapLibre GL 5 + OpenStreetMap raster tiles — no Mapbox, no map billing, swappable via `NEXT_PUBLIC_TILE_URL` |
| i18n | next-intl scaffolded (English-only copy at MVP, plain English for non-native speakers) |

These are **locked architectural decisions** — see [CLAUDE.md](./CLAUDE.md)
§"three locked architectural decisions" for the reasoning and what they
override from the original design docs.

## Architecture at a glance

```
                        ┌─────────────────────┐
                        │   apps/web (Next 16) │
                        │  student / landlord /│
                        │   ops / admin portals │
                        └──────────┬───────────┘
                                   │ /api/v1/*, /api/auth (cookie-credentialed)
                        ┌──────────▼───────────┐
                        │   apps/api (Nest 11)  │
                        │  RlsDb.run(ctx, fn)   │◄── every query wrapped in a
                        │  wraps every query    │    withRlsContext transaction
                        └──┬──────┬──────┬──────┘
                           │      │      │
                 ┌─────────▼┐ ┌──▼───┐ ┌▼──────────┐
                 │ NeonDB   │ │Redis │ │ Adapters:  │
                 │ Postgres │ │(BullMQ│ │ Flutterwave│
                 │ + PostGIS│ │+ hold │ │ Africa's   │
                 │  + RLS   │ │ locks)│ │ Talking,   │
                 └──────────┘ └──────┘ │ Cloudinary,│
                                        │ Soketi     │
                                        └────────────┘
```

`packages/shared` sits underneath both apps — every Zod schema and enum is
defined once, compiled to `dist/`, and consumed at runtime by both Nest and
Next (`packages/shared/src/enums.ts` is the single source of truth; Drizzle
pgEnums and frontend form validation both derive from it).

## Repo layout

```
apps/api               NestJS 11 backend. Deploys as a Docker image through Dokploy.
  src/db/schema/        Drizzle table definitions (12 files, 43 tables)
  src/db/rls-context.ts withRlsContext() — binds app.user_id / app.user_role per request
  src/modules/           One folder per domain module (see API surface below)
  src/adapters/          Messaging, Payments, Realtime — stub/noop fallbacks outside prod
  migrations/            Forward-only SQL migrations (0000–0015)
  test/rls/              RLS proof suite — runs as the real app_user DB role
  test/services/         Service-level unit/integration tests
apps/web                Next.js 16 frontend. Deploys as a standalone Docker image through Dokploy.
  src/app/(public)/      Search, map, listing detail, sign-in — pre-login
  src/app/(student)/     Reservations, profile, chat
  src/app/(landlord)/    Onboarding, listings, reservations, chat
  src/app/(ops)/         Verification queue, KYC review, strikes
  src/app/(admin)/       Staff, audit log, dashboards, admin config
  src/lib/                session.ts (requireRole), api.ts (fetch wrapper), auth-client.ts
packages/shared          Zod schemas + enums — compiled to dist/, the single
                          source of truth consumed at runtime by both apps.
packages/config           Shared tsconfig / eslint / prettier.
```

## Prerequisites

- **Node 24** — `nvm use 24` before running any pnpm command; the system
  `node` may be older and will fail native builds.
- **pnpm 11** (`packageManager: pnpm@11.9.0` is pinned in `package.json`).
- **Docker** — for local Postgres + Redis (dev) and the disposable test
  Postgres (test suite).

## Getting started

1. Install dependencies (uses `pnpm-workspace.yaml`'s `allowBuilds` for
   `@swc/core`, `sharp`, `@parcel/watcher`, `esbuild`, `unrs-resolver`):

   ```bash
   pnpm install
   ```

2. Bring up local infrastructure — persistent Postgres+PostGIS on `54328`
   and Redis (no-eviction, AOF-persisted) on `6379`:

   ```bash
   pnpm local:up
   ```

3. Create `apps/api/.env` from `apps/api/.env.example` (see
   [Environment variables](#environment-variables) below) and
   `apps/web/.env.local` per [FRONTEND.md](./FRONTEND.md) §3. Then apply
   migrations and seed data:

   ```bash
   pnpm local:setup
   ```

4. Run both apps together, or independently:

   ```bash
   pnpm dev            # api + web together, via scripts/dev.mjs
   pnpm dev:api         # api only
   pnpm dev:web         # web only
   ```

   API serves `/api/v1/*` plus `/api/auth` (Better Auth, mounted
   express-level with Nest body-parsing disabled and re-added after it) on
   `PORT` (default `4000`). Web runs on Next's default port and calls the
   API through `apps/web/src/lib/api.ts`. `WEB_ORIGIN` on the API drives CORS
   and Better Auth `trustedOrigins` — set it to your web app's origin
   (`localhost:3000` is cross-origin from `localhost:4000` by default).

5. Tear down local infra when done:

   ```bash
   pnpm local:down
   ```

## Environment variables

`apps/api/.env` (see `apps/api/.env.example`):

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string — API must connect as a role inheriting `app_user` (never the DB owner) so RLS actually applies |
| `REDIS_URL` | Upstash Redis, used in non-local environments |
| `DEV_REDIS_URL` | Local no-eviction Redis — preferred automatically in development over `REDIS_URL` |
| `BETTER_AUTH_SECRET` | Better Auth session/token signing secret |
| `BETTER_AUTH_API_KEY` | Better Auth dashboard API key |
| `BETTER_AUTH_URL` | Base URL Better Auth issues callbacks against (`http://localhost:4000` locally) |
| `AUTH_COOKIE_DOMAIN` | Optional shared parent domain for sibling web/API hosts; set `.campushomes.co.ug` in deployed environments and omit locally |
| `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` | Bootstrap super-admin credentials for `admin:reset` |
| `PAYMENTS_ENABLED` | Phase launch gate. Only the exact value `true` enables payment initiation; missing or `false` keeps Phase 1 money-free |
| `ALLOW_STUB_INTEGRATIONS` | Explicit staging-only opt-in for missing SMS/realtime providers. Keep `false` for public production |
| `FLUTTERWAVE_SECRET_KEY` | Phase 2 payment provider secret; omit during Phase 1 |
| `FLUTTERWAVE_WEBHOOK_HASH` | Phase 2 `verif-hash` header value Flutterwave sends; omit during Phase 1 |
| `AFRICASTALKING_API_KEY` / `AFRICASTALKING_USERNAME` | SMS/OTP provider (`sandbox` username for the AT sandbox) |
| `CLOUDINARY_URL` | Image storage — powers `POST /uploads/sign` |
| `SENTRY_DSN` | Error tracking |
| `POWER_BI_PUSH_URL` / `POWER_BI_API_TOKEN` | Reporting export destination |
| `WEB_ORIGIN` | Frontend origin for CORS + Better Auth trusted origins |
| `PAYMENT_REDIRECT_URL` | Frontend reservation return URL; retained for Phase 2 even while payments are disabled |
| `SOKETI_HOST` / `SOKETI_PORT` / `SOKETI_APP_ID` / `SOKETI_KEY` / `SOKETI_SECRET` | Optional realtime provider; REST polling remains available when staging explicitly permits stubs |
| `PORT` | API listen port (default `4000`) |

`apps/web/.env.local` needs `NEXT_PUBLIC_API_BASE_URL`,
`NEXT_PUBLIC_PAYMENTS_ENABLED`, and `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`.
`NEXT_PUBLIC_TILE_URL`, `NEXT_PUBLIC_SOKETI_HOST`, and
`NEXT_PUBLIC_SOKETI_KEY` are optional. `NEXT_PUBLIC_*` values are browser
configuration, not server secrets, and are compiled into the Next.js bundle.
Full list in [FRONTEND.md](./FRONTEND.md) §3.

Never commit `.env` / `.env.local` — both are covered by a `protect-files`
guard on this repo's tooling.

## Common scripts

Run from the repo root unless noted.

| Command | Effect |
| --- | --- |
| `pnpm dev` | Run api + web together |
| `pnpm dev:api` / `pnpm dev:web` | Run one app |
| `pnpm local:up` / `pnpm local:down` | Start/stop local Postgres + Redis (docker) |
| `pnpm local:setup` | First-time local setup (env scaffolding + migrations) |
| `pnpm lint` | Lint every workspace package (`pnpm -r lint`) |
| `pnpm typecheck` | Typecheck every workspace package (`pnpm -r typecheck`) |
| `pnpm test` | Run every workspace package's test suite (`pnpm -r test`) |

`apps/api`-scoped (`pnpm --filter @campushomes/api <script>`):

| Command | Effect |
| --- | --- |
| `db:generate` | Generate a Drizzle migration from schema changes |
| `db:migrate` | Apply migrations |
| `db:studio` | Open Drizzle Studio |
| `db:check` | Verify schema and migrations are in sync (must read "Everything's fine") |
| `db:seed` | Seed local dev data (`scripts/seed-dev.cjs` — five user roles with credential accounts) |
| `admin:reset` | Reset/bootstrap the local super-admin account |
| `test:rls` | Run only the RLS proof suite |

**Nothing is considered done until `pnpm lint && pnpm typecheck && pnpm test`
are green at root.**

## Database

- **43 tables** across 12 schema files in `apps/api/src/db/schema/`
  (`identity`, `property`, `listing`, `reservation`, `comms`, `trust`,
  `rbac`, `admin`, `campus`, `saved-listing`), reproduced column-for-column
  from the design doc.
- **Migrations are forward-only** — Drizzle generates no down migrations;
  fix-forward with a new numbered migration, never edit a shipped one.
  Current history: `0000` (base DDL) → `0001` (PostGIS, CHECK constraints,
  triggers, grants, every RLS policy) → `0002` (Better Auth tables) →
  `0003`–`0009` (schema evolution) → `0011`–`0012` (RBAC tables +
  role/permission delete support) → `0013`–`0015` (admin operations, admin
  user semesters, semester archiving).
- **DB-enforced invariants** (not just application logic — Postgres itself
  guarantees these):
  - A trigger requires all 6 verification-checklist components
    (`location_gps`, `rooms_capacity`, `amenities`, `photos`,
    `landlord_identity`, `safety`) to pass, on a lead-approved visit,
    before a listing can reach `status = 'verified'`.
  - A partial unique index (`reservations_one_live_hold_per_unit`) is the
    real double-booking guarantee — the Redis `SET NX` lock is only an
    optimization to avoid unnecessary DB round-trips.
  - `payments.provider_txn_id` is `UNIQUE` — the webhook idempotency anchor.
  - Reviews require a trigger *and* an RLS policy proving a fulfilled
    reservation owned by the reviewer.
  - Three landlord strikes auto-suspend the landlord and their verified
    listings.
  - `audit_log`, `reviews`, `landlord_strikes`, `student_flags`, and
    `listing_photos` have `UPDATE` revoked at the grant level — append-only
    even for `service_role`.
  - `reputation_scores` is a materialized view with a unique index present,
    so it supports `REFRESH ... CONCURRENTLY`.

## Authorization: Row-Level Security + RBAC

Two deliberately redundant layers:

1. **Row-Level Security — the real enforcement boundary.** Every table's
   access rules live in SQL migrations, keyed on `app.user_id` /
   `app.user_role` session variables set per request inside a transaction
   via `withRlsContext()` (`apps/api/src/db/rls-context.ts`). A bug in a
   service method cannot leak rows — Postgres filters at read time
   regardless of what the application code does or forgets to do. The API
   connects as a role that inherits `app_user` (`NOLOGIN`), **never** the
   DB owner. `service_role` is reserved for server-internal paths (webhooks,
   jobs, cross-cutting reads) — never client-derived. `RlsDb.run(ctx, fn)`
   (`src/db/db.module.ts`) is the only way services query the database.

2. **Fine-grained RBAC — staff tooling on top.** A data-driven permissions
   layer on the base `app.user_role` enum: `roles` / `permissions` /
   `role_permissions` / `user_role_assignments` / `approval_requests`
   tables, seeded with 7 staff roles and a 63-permission catalog. 5 of the
   7 staff roles (`super_admin`, `platform_admin`, `finance_admin`,
   `support_admin`, `auditor`) collapse onto the DB `admin` enum value;
   `ops_lead` / `ops_inspector` keep their own dedicated enum values.
   `PermissionsGuard` / `@RequirePermission()` does a **per-request DB
   lookup**, not a session-baked check — revocation is immediate.
   Permissions flagged `requiresStepUp` fail closed (`501`) until real MFA
   reverification ships.

Frontend route guards (`requireRole()` in `apps/web/src/lib/session.ts`) are
**UX only** — they route users to the right portal. They are never the
security boundary; RLS is.

## Domain model reference

**User roles** (`USER_ROLES`, the DB enum RLS branches on): `student`,
`landlord`, `custodian`, `property_worker`, `ops_inspector`, `ops_lead`,
`admin`.

**Staff RBAC roles** (`STAFF_ROLE_KEYS`, orthogonal fine-grained layer):
`super_admin`, `platform_admin`, `ops_lead`, `ops_inspector`,
`finance_admin`, `support_admin`, `auditor`.

**Listing lifecycle** (`LISTING_STATUSES`): `draft` → `pending_verification`
→ `verified` → (`expired` | `suspended`).

**Reservation lifecycle** (`RESERVATION_STATUSES`): `held` →
`payment_pending` → (`fulfilled` | `payment_failed` | `cancelled` |
`refunded` | `expired`). Holds are 72 hours; the 5,000 UGX reservation fee
is fixed platform-wide.

**Payments**: provider `flutterwave` only; methods `mtn_momo`,
`airtel_money`, `card`, `bank_transfer`; refund reasons `cooling_off`,
`landlord_failure`, `ops_dispute`, `student_cancel`.

**Verification checklist** (`VERIFICATION_CHECKLIST_COMPONENTS`, all 6
required and DB-trigger-enforced): `location_gps`, `rooms_capacity`,
`amenities`, `photos`, `landlord_identity`, `safety`.

**Landlord strikes** (`STRIKE_REASONS`): `no_show`, `price_mismatch`,
`amenity_fraud`, `abusive`, `other` — 3 strikes auto-suspends.

## API surface

All routes are under `/api/v1` unless noted; auth runs at `/api/auth`.
Grouped by module (`apps/api/src/modules/*`):

| Module | Base path | Key routes |
| --- | --- | --- |
| Listings | `/listings` | `GET /search`, `GET /campuses`, `GET /reviews`, `GET /:id`, `POST /properties`, `GET /properties/mine`, `PATCH /properties/:id`, `GET /properties/:id/detail`, `POST /properties/:id/documents`, `POST /drafts`, `POST /units/:id/photos`, `DELETE /units/photos/:photoId` |
| Reservations | `/reservations` | `POST /holds`, `GET /mine`, `GET /landlord-inbox`, `GET /:id/payment-status`, `POST /:id/cancel`, `POST /:id/move-in` |
| Payments webhook | `/webhooks` | `POST /flutterwave`, `POST /dev-simulate` |
| Landlords | `/landlords` | `POST /apply`, `GET /me`, `POST /profile` |
| Students | `/students` | `GET /me`, `POST /profile`, `GET /saved-listings`, `POST /saved-listings`, `DELETE /saved-listings/:listingId` |
| Ops | `/ops` | `GET /queue`, `GET /inspectors`, `GET /visits/mine`, `GET /visits/:id`, `POST /visits`, `POST /visits/sync`, `POST /visits/:id/approve`, `POST /listings/publish`, `POST /campuses/:university/photo`, `POST /strikes`, `GET /landlords/kyc-queue`, `POST /landlords/:userId/kyc` |
| Chat | `/chat` | `GET /threads`, `POST /threads/:reservationId`, `GET /threads/:id/messages`, `POST /threads/:id/messages`, `POST /pusher/auth` |
| Notifications | `/notifications` | `GET /`, `POST /push-subscriptions`, `POST /:id/read` |
| Staff (RBAC) | `/admin/staff` | `POST /invite`, `GET /`, `PATCH /:id/deactivate`, `POST /:id/roles`, `DELETE /:id/roles/:assignmentId` |
| Admin dashboard | `/admin` | `GET /access/me`, `GET /overview`, `GET /users`, `GET /properties`, `GET /verifications`, `GET /reservations`, `GET /payments`, `GET /cases`, `GET /reports`, `GET /settings`, `GET /integrations`, `GET /roles`, `GET /roles/:key`, `PATCH /roles/:key/permissions`, `GET /audit` |
| Admin config | `/admin` | `PATCH /settings`, `POST /settings/semesters`, `PATCH /settings/semesters/:id`, `DELETE /settings/semesters/:id`, `POST /integrations`, `PATCH /integrations/:id`, `DELETE /integrations/:id` |
| Admin properties | `/admin/properties` | `POST /`, `GET /:id`, `PATCH /:id`, `POST /:id/units`, `POST /:id/media`, `DELETE /:id/media/:mediaId` |
| Admin users | `/admin/users` | `POST /`, `GET /:id`, `PATCH /:id`, `DELETE /:id`, `POST /:id/roles`, `DELETE /:id/roles/:assignmentId`, `POST /:id/permissions`, `DELETE /:id/permissions/:grantId` |
| Admin exports | `/admin` | `GET /reports/exports`, `POST /reports/export`, `POST /verifications/export` |
| Audit log | `/admin/audit-log` | `GET /` |
| Health | `/health` | `GET /` |

Request/response contracts are Zod schemas from `packages/shared` — every
route validates in and (where defined) parses out through the same schema
the frontend uses, so drift between client and server expectations isn't
possible by construction.

## Testing

Two suites share the disposable docker test database and run with
`jest --runInBand`:

- **`test/rls/rls.spec.ts`** — the RLS proof suite. Runs queries as the
  *real* `app_user` Postgres role (not an app-layer mock) to prove
  authorization is enforced by Postgres, not assumed from reading policy
  SQL. Currently 27+ tests.
- **`test/services/*.spec.ts`** — service-level tests (reservation flow,
  RBAC permissions/staff, chat Pusher auth, and more).

To run locally:

```bash
docker compose -f apps/api/docker-compose.test.yml up -d --wait
DATABASE_URL=postgresql://campushomes:campushomes_test@localhost:54329/campushomes_test \
  pnpm --filter @campushomes/api db:migrate
pnpm --filter @campushomes/api test
```

**Rule with no exceptions:** any new table gets new RLS policies in a new
migration, and new tests in `rls.spec.ts` covering them. A schema change
without a matching RLS test does not ship.

## Background jobs

BullMQ runs **in-process** inside the Nest app (`JobsModule`), backed by
Redis:

- `hold_expiry` — a per-hold delayed job that expires a reservation hold
  once its 72-hour window lapses.
- Maintenance queue schedulers — hourly SLA sweep, daily rollover.

`bullmq` pins `ioredis` to `5.10.1`; keep that version identical anywhere
Redis is touched or the types clash.

## Third-party services

Provisioning status, account details, and setup order for every external
service (Neon, Upstash, Cloudinary, Africa's Talking, Sentry, Flutterwave,
Soketi) live in [TECH.md](./TECH.md) — check there before adding a new
integration or debugging a missing credential. Summary:

| Service | Purpose | Status |
| --- | --- | --- |
| Neon | Postgres + PostGIS | ✅ live |
| Upstash | Redis (BullMQ, hold locks) | ✅ live; eviction disabled for queue safety |
| Cloudinary | Image storage | ✅ live |
| Sentry | Error tracking | ✅ credentials live, Nest SDK wiring pending |
| Africa's Talking | SMS/OTP | ✅ sandbox live |
| Flutterwave | Payments | ⏸️ Phase 2 — no real-money checkout in the Phase 1 MVP; `StubPayments` is development-only |
| Soketi | Realtime chat push | ❌ unprovisioned — chat persists via REST, live push activates once configured |

## Deployment

CampusHomes is self-hosted on a Contabo Cloud VPS 6 running Ubuntu 24.04 and
Dokploy. Dokploy builds two independent applications from this monorepo and
Traefik routes their domains internally; application ports are never published
directly to the internet.

### Infrastructure and security baseline

- SSH accepts the dedicated CampusHomes ED25519 key for the non-root `festo`
  account only. Root login, password login, keyboard-interactive login, empty
  passwords, and X11 forwarding are disabled.
- Contabo's edge firewall and host UFW accept only TCP `22`, `80`, and `443`;
  everything else is denied. Dokploy's former public port `3000` is removed.
- CrowdSec analyzes Linux/OpenSSH logs and its nftables firewall bouncer applies
  decisions for IPv4 and IPv6.
- Dokploy is available only through `https://deploy.campushomes.co.ug`, protected
  by HTTPS and account 2FA.
- Cloudflare terminates visitor TLS with **Full (strict)** origin validation.
- Upstash eviction is disabled so BullMQ delayed jobs and locks cannot be
  discarded under memory pressure.
- Ubuntu unattended security upgrades are enabled.

### Branch and release flow

Changes start on a short-lived branch, pass lint, type checks, tests, and image
builds, then enter `main` through a reviewed pull request. Dokploy staging
tracks `main` with automatic deployment. Production also uses `main`, but its
automatic deployment remains OFF so a tested revision is promoted manually.
The existing `development`, `preview`, `feature`, and `sam` branches are not
production deployment sources. The primary domains are attached only after
staging has passed smoke tests; production is never used as the development
environment.

### Secure GitHub connection and project creation

1. In Dokploy, open the Git/provider settings and create a **GitHub App**.
   Install it on the `Festo-Wampamba` account with access to **only** the
   `Campus-Homes` repository. Do not paste a personal access token, SSH private
   key, or GitHub password into an application environment field.
2. In **Projects**, create `Campus Homes` with two environments: `staging` and
   `production`. Create the staging applications first; production stays empty
   until staging passes.
3. For each staging application, choose the installed GitHub App, repository
   `Festo-Wampamba/Campus-Homes`, and branch `main`. Enable automatic deployment
   only for staging.
4. Use the Dockerfile paths and internal ports below. Secrets go in the API
   application's **Environment** section; only the listed `NEXT_PUBLIC_*`
   values go in the web application's **Build Time Arguments** section.
5. Leave Advanced/Published Ports empty. The domain's Container Port tells
   Traefik where to route internally and does not expose that port publicly.

### Dokploy applications

Create both applications with build type **Dockerfile**, repository context
`.` and no Advanced/Published Ports:

| Application | Dockerfile | Internal port | Staging domain | Health path |
| --- | --- | ---: | --- | --- |
| `campushomes-api-staging` | `apps/api/Dockerfile` | `4000` | `api-staging.campushomes.co.ug` | `/api/v1/health` |
| `campushomes-web-staging` | `apps/web/Dockerfile` | `3000` | `staging.campushomes.co.ug` | `/` |

Both domains use path `/`, HTTPS enabled, and a Let's Encrypt certificate.
Keep new Cloudflare records DNS-only until the origin certificate is issued;
then proxy them through Cloudflare.

API runtime environment for staging:

```dotenv
NODE_ENV=production
PORT=4000
DATABASE_URL=<NEON_STAGING_APP_CONNECTION_STRING>
REDIS_URL=<UPSTASH_READ_WRITE_TLS_CONNECTION_STRING>
BETTER_AUTH_SECRET=<GENERATED_32_PLUS_CHARACTER_SECRET>
BETTER_AUTH_URL=https://api-staging.campushomes.co.ug
AUTH_COOKIE_DOMAIN=.campushomes.co.ug
WEB_ORIGIN=https://staging.campushomes.co.ug
PAYMENTS_ENABLED=false
ALLOW_STUB_INTEGRATIONS=true
CLOUDINARY_URL=<CLOUDINARY_DEDICATED_KEY_URL>
PAYMENT_REDIRECT_URL=https://staging.campushomes.co.ug/reservations
```

`ALLOW_STUB_INTEGRATIONS=true` is acceptable only on staging while Africa's
Talking or Soketi is absent. Public production must use real integrations or
explicitly disable their user-facing features and set this value to `false`.
Flutterwave variables are deliberately absent during Phase 1.

Web Docker build arguments for staging:

```dotenv
NEXT_PUBLIC_API_BASE_URL=https://api-staging.campushomes.co.ug
NEXT_PUBLIC_PAYMENTS_ENABLED=false
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=<CLOUDINARY_CLOUD_NAME>
NEXT_PUBLIC_TILE_URL=
NEXT_PUBLIC_SOKETI_HOST=
NEXT_PUBLIC_SOKETI_KEY=
```

### Obtaining deployment values safely

- **`DATABASE_URL`** — in Neon, select the staging branch and the dedicated API
  login role that inherits `app_user`, then copy its pooled Postgres connection
  string. The runtime API must not use the database owner because owner access
  bypasses the RLS boundary. Use the owner connection only from a trusted local
  terminal to apply migrations, then unset it.
- **`REDIS_URL`** — in the Upstash `campus-homes` database, open **Details /
  Connect** and copy the read-write Redis connection string for the `default`
  user. It begins with `rediss://`; do not use the REST URL or a read-only user.
- **`BETTER_AUTH_SECRET`** — generate it locally with
  `openssl rand -base64 48`. Store the result only in Dokploy's API environment;
  never put it in Git, GitHub Actions output, screenshots, or chat.
- **`CLOUDINARY_URL`** — use the dedicated `campushomes` API key from the
  Cloudinary console. Its form is
  `cloudinary://<api_key>:<api_secret>@<cloud_name>` and it belongs only in the
  API runtime environment.
- **`NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`** — the non-secret Cloudinary cloud name
  shown on the Cloudinary dashboard. This public identifier may be supplied as
  a web build argument; never expose the API secret to Next.js.

Dokploy environment values are the source of truth for deployed containers.
Never commit `.env`, `.env.local`, provider tokens, database passwords, or
private keys.

### Database migration and cutover

Apply forward-only migrations to the Neon staging branch from a trusted local
terminal before the first API deployment. Read the owner URL without placing it
in shell history:

```bash
cd apps/api
read -rsp "Neon staging owner URL: " DATABASE_URL && echo
export DATABASE_URL
node node_modules/drizzle-kit/bin.cjs migrate
unset DATABASE_URL
```

Deploy the API first and verify `/api/v1/health`, then deploy the web app and
test authentication, search, Cloudinary uploads, chat fallback, role-gated
portals, and the absence of payment controls. Only after those checks pass
should `api.campushomes.co.ug` and `campushomes.co.ug` be attached to the
production applications.

## Contributing / conventions

- **pnpm only** — never `npm`/`yarn` — and always under **Node 24**.
- **ESLint flat config**, `typescript-eslint` recommended,
  `no-explicit-any` is an **error**, not a warning.
- **Validation lives in `packages/shared`** — never add a `class-validator`
  DTO; extend or add a Zod schema there instead, so frontend and backend
  can't drift.
- **Never write app-layer authorization checks in place of an RLS
  policy** — if a new table needs access rules, they go in a migration as
  RLS policies, proven by a test in `rls.spec.ts`, not as an `if` in a
  service method.
- **Drizzle is forward-only** — never edit a shipped migration; fix-forward
  with a new one.
- Route-group folders in `apps/web` (`(student)`, `(landlord)`, `(ops)`,
  `(admin)`) add **no path segment** — a page must nest under its real URL
  path (e.g. `landlord/onboarding/page.tsx` for `/landlord/onboarding`),
  not sit beside the route group.
- Before finishing any change: `pnpm lint && pnpm typecheck && pnpm test`
  green at root.

## Troubleshooting

- **Nothing runs without `DATABASE_URL`.** Start local Postgres first
  (`pnpm local:up`) before `pnpm dev`.
- **Reservation/RLS tests failing locally?** Confirm you're pointed at the
  *test* database (`54329`, `docker-compose.test.yml`), not the dev one
  (`54328`, `docker-compose.local.yml`) — they're separate, and test
  helpers truncate tables.
- **Redis eviction policy matters.** Local Redis runs
  `--maxmemory-policy noeviction` deliberately — BullMQ job data must never
  be evicted. If you provision a fresh Upstash instance, turn eviction OFF
  in its settings; an eviction-enabled cache can silently drop delayed
  hold-expiry jobs.
- **Port 4000 (API) or 3000 (web) already in use** — check for a stale
  `nest start --watch` or `next dev` process before assuming a code issue.
- **CORS errors between `localhost:3000` and `localhost:4000`** — set
  `WEB_ORIGIN=http://localhost:3000` in `apps/api/.env`; `localhost` across
  different ports is cross-origin, cookies won't attach without it.
- **`drizzle-kit check` not reporting "Everything's fine"** — you have an
  uncommitted schema change with no matching migration; run `db:generate`.

## Documentation map

| File | Covers |
| --- | --- |
| [CLAUDE.md](./CLAUDE.md) | Build memory: locked architectural decisions, schema/RLS invariants, module-by-module implementation notes, what's done vs. deferred, mid-build decisions and why |
| [PRODUCT.md](./PRODUCT.md) | Users, product purpose, brand personality, design principles, accessibility floor |
| [DESIGN.md](./DESIGN.md) | Visual design system — tokens, typography, color |
| [FRONTEND.md](./FRONTEND.md) | Frontend endpoint inventory and build order |
| [TECH.md](./TECH.md) | Third-party service accounts, credentials status, setup order |
| [Project_Architecture_Blueprint.md](./Project_Architecture_Blueprint.md) | Full-stack architecture blueprint |
