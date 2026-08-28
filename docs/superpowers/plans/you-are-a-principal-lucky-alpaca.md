# CampusHomes: Neon → Self-Hosted Supabase + Logto Migration

## Context

CampusHomes currently runs its app containers (API, web) on a self-hosted Contabo VPS via Dokploy — this is already live, not proposed (commit `59571f2`, confirmed in README/TECH.md; CLAUDE.md's "deploys to Render/Vercel" note is stale). The database (Neon Postgres+PostGIS) and auth (Better Auth) remain managed/embedded cloud dependencies. The user wants to extend self-hosting to the database (via self-hosted Supabase) and replace Better Auth with Logto OSS as the identity platform, while keeping Redis on Upstash (managed) and keeping the review scoped to sections 1-9 + essential security/backup (11-12) at full depth, with deployment topology, observability, full test-plan enumeration, and the 8 operational runbooks (10, 13-19) condensed to a first pass.

This document is the output of a 13-issue interactive architecture review — 10 issues in the main review pass plus 3 raised by an independent outside-voice (Codex) second opinion — (see `## GSTACK REVIEW REPORT` at the end for review metadata). Every major call below was presented with tradeoffs and explicitly chosen by the user — this is not a unilateral recommendation. Notably, the outside voice's critique of Issue 1 (full Supabase self-host) was independently correct — the user reversed that call after hearing the fuller reasoning (see Issue 1-REVISED).

**Outcome:** a locked target architecture, a phased two-axis migration plan (DB first, then auth), and the prerequisite work (CI/CD, Drizzle snapshot repair) identified as blocking the migration's own validation story.

---

## 1. Executive Summary

**Target architecture:** Self-hosted plain Postgres + PostGIS (single container, e.g. `postgres:16-postgis` or equivalent — **not** the Supabase stack; see Issue 1-REVISED) + Logto OSS for identity, deployed via Dokploy alongside the existing API/web containers on Contabo. Redis stays on Upstash. Tenancy authorization stays 100% app-owned (existing RBAC/RLS layer) — Logto is identity-only. DB browsing uses the already-present `drizzle-kit studio`, not Supabase Studio.

**Migration sequence:** (1) fix two independent landmines first — no CI/CD pipeline, and a Drizzle migration-snapshot gap (0012-0021 unsnapshotted) — because the migration's own validation story depends on both. (2) Migrate the database from Neon to self-hosted Postgres via `pg_dump`/`pg_restore` during a scheduled maintenance window. (3) Only after the DB is stable on the new host, begin a phased Better Auth → Logto cutover: Logto handles new signups/Google OAuth/staff invites first (this is literally the work already in progress, uncommitted, on the current branch); existing sessions keep working on Better Auth until a scheduled bulk-migration window.

**Biggest real risk found, and reversed after outside-voice review:** the user's initial framing (full self-hosted Supabase stack on the current 12GB VPS) didn't fit on RAM (official Supabase minimums 4GB + recommended 8GB+, plus Logto's own recommended 8GB, exceed 12GB before app containers or build spikes). The user initially chose to fix this by stripping unused Supabase services rather than upgrading the VPS. After an independent Codex review reached the same underlying conclusion as this review's original recommendation — that Supabase's non-Postgres pieces (GoTrue, PostgREST, Realtime, Storage, Studio, Kong, postgres-meta) all duplicate capabilities CampusHomes already owns (Logto, its own NestJS API, Soketi, Cloudinary, `drizzle-kit studio`) — the user asked for the full reasoning and reversed the decision: **plain Postgres+PostGIS, no Supabase at all** (Issue 1-REVISED).

**Confidence note:** every architectural claim below is tagged [DOCUMENTED] (verified against current official docs/repo code, with citation) or [INFERENCE] (my synthesis, flagged with confidence and what would falsify it).

---

## 2. What the Repository Actually Does Today

**[DOCUMENTED, confidence 9/10 — verified via repo Explore agents, see full findings in conversation]**

- **Hosting**: Dokploy on a hardened Contabo VPS 6 (Ubuntu 24.04, Cloudflare Full(strict) TLS, CrowdSec, UFW allowing only 22/80/443, panel behind 2FA at a dedicated domain) is **already live** — `README.md:460-476`, `TECH.md:36`. CLAUDE.md's Render/Vercel note is stale documentation, not current fact.
- **DB/Redis**: still managed cloud (Neon, Upstash) even in the current Dokploy setup — only the two app containers moved to Contabo so far.
- **No CI/CD exists**: zero `.github/workflows/*`, no `render.yaml`/`vercel.json`. Dokploy's GitHub App is the only build trigger. Pre-merge discipline is the only current quality gate.
- **Monorepo**: pnpm workspace, Node ≥24 pinned, `apps/api` (NestJS 11), `apps/web` (Next.js 16), `packages/shared` (Zod schemas, must be pre-built to `dist/` before api/web can consume it — both Dockerfiles do this).
- **23 controllers** under `/api/v1/*`; Better Auth mounted separately at `/api/auth/{*any}` (Express-level, bodyParser disabled + re-added after, order-dependent).
- **Tests**: ~117 API tests + ~16 web tests (per `TECH.md:37`), including 68 dedicated RLS tests (`apps/api/test/rls/rls.spec.ts` — this is the authoritative current count; CLAUDE.md's larger historical numbers (102/106/134) conflate RLS tests with unrelated service-layer RBAC suites).

---

## 3. Current Authentication and Authorization Architecture

**[DOCUMENTED, confidence 9/10]**

- **Better Auth** (`apps/api/src/modules/auth/auth.config.ts`, read live including uncommitted changes): phone OTP (Africa's Talking), email/password (`disableSignUp: false` — self-serve sign-up is **live**, contradicting CLAUDE.md's stale claim it's disabled), Google OAuth (conditional on client id/secret, `accountLinking` trusted). Runs on a **dedicated Postgres pool** with a startup GUC (`-c app.user_role=service_role`) against a **non-pooled** Neon connection — PgBouncer rejects Better Auth's startup-option RLS trick, which is why `AUTH_DATABASE_URL` must be direct.
- **Sessions**: stored in Postgres via `drizzleAdapter`. Cross-subdomain cookies only in prod (`AUTH_COOKIE_DOMAIN` gated). `trustedOrigins` is Better Auth's CSRF boundary — no separate CSRF middleware.
- **RBAC layer** (independent of the DB's 7-value `app.user_role` enum): `roles`/`permissions`/`role_permissions`/`user_role_assignments`/`user_permission_grants` tables (migration `0011_rbac.sql`), 7 seeded roles, `PermissionsGuard` does a **per-request DB lookup** (not session-baked, for immediate revocation), scope model (`platform_wide`/`catchment`) checked server-side via `hasCoveringScope` — **never trusts a client-supplied claim**.
- **In-flight uncommitted work** (current branch `feat/real-auth-google-invites`): fixes the previously-documented gap where staff invites created a `users` row with no credential path. Now reuses Better Auth's `requestPasswordReset` API as a credential-bootstrap mechanism for invited staff. This is exactly the flow that should land on Better Auth now and migrate to Logto's equivalent later (see Issue 4).

---

## 4. Current Database and RLS Architecture

**[DOCUMENTED, confidence 9/10]**

- **~48 tables** across 16 schema files. Single Postgres extension used: **PostGIS** (one geometry column: `properties.gps_point`). No `pgcrypto`/`uuid-ossp` needed (`gen_random_uuid()` is Postgres ≥13 built-in).
- **RLS mechanics** (`apps/api/src/db/rls-context.ts`): every query runs inside `BEGIN; SET LOCAL ROLE app_user; SELECT set_config('app.user_id', $1, true), set_config('app.user_role', $2, true); ... COMMIT`. Parameterized, transaction-scoped (`SET LOCAL` semantics — required for pooled-connection safety). `SET LOCAL ROLE app_user` is defense-in-depth against an owner-role misconfiguration.
- **`service_role` is a GUC value, not a Postgres role** — `app_is_service()` checks `current_setting('app.user_role')`. Only one real Postgres role exists: `app_user NOLOGIN`.
- **27+ tables have RLS enabled**; 5 tables (`audit_log`, `reviews`, `landlord_strikes`, `student_flags`, `listing_photos`) have `UPDATE` revoked from `app_user` at the grant level — append-only even for the app role.
- **Known landmine, confirmed worse than documented**: Drizzle's `migrations/meta/` snapshot chain has no snapshot files after `0011_snapshot.json`, but `_journal.json` lists migrations through `0021`. CLAUDE.md claimed a 4-migration gap (0012-0015); the actual gap is **10 migrations (0012-0021)**. `drizzle-kit generate`/`check` is unsafe to trust for schema diffing until this is fixed — **blocking for this migration's schema-equivalence validation** (Issue 9, resolved: fix now).

---

## 5. Current Deployment and Infrastructure Risks

**[DOCUMENTED, confidence 8/10]**

- No CI/CD — quality gates depend entirely on developer discipline before Dokploy builds an image (Issue 8, resolved: build minimal CI now).
- `NEXT_PUBLIC_*` values are Docker build ARGs, not runtime env — any environment-specific value requires an image rebuild, not a container restart.
- Single VPS is a single point of failure for Dokploy, the app, and (after this migration) the database and Logto. **[INFERENCE, confidence 9/10]** No HA topology was requested or is in scope for a small team on one Contabo box — this is accepted residual risk, not an oversight. What mitigates it is backup/restore discipline (see §12), not redundancy.
- Realtime (Soketi) remains unprovisioned in every environment (`NoopRealtime` fallback) — unrelated to this migration, noted for completeness.

---

## 6. Comparison of Viable Target Architectures

| Option | Security | Ops complexity | RAM (12GB VPS fit) | RLS/auth compat with existing code | Migration risk | Verdict |
|---|---|---|---|---|---|---|
| A. Keep Neon, change plan | High (Neon's managed hardening) | Low | N/A — no new services | Perfect (zero change) | None | Safe fallback, but doesn't achieve the user's stated goal of self-hosting |
| B. Managed Supabase | High | Low | N/A (not self-hosted) | GoTrue's `auth.users`/`auth.uid()` model conflicts with existing `app.user_id` RLS design | Rewrite RLS or run two auth conventions | Doesn't fit "self-host" goal or the existing RLS design |
| **C. Plain Postgres+PostGIS + Logto separate — CHOSEN (final, after Issue 1-REVISED)** | High (smallest attack surface, no PostgREST/postgres-meta admin-SQL-over-HTTP exposure, no Studio auth-bypass CVE history) | Lowest | Comfortable, large margin — single container, ~0.3-0.5GB | Zero RLS rewrite | Lowest — no upstream-Supabase compatibility matrix to track | **Selected (final)** |
| D. Full self-hosted Supabase (stripped) + Logto | Medium-high (more services = more surface even stripped) | Medium (non-standard compose diverges from upstream Supabase, breaking Postgres 15→17 upgrade path applies) | Fits only after stripping Realtime/Storage/imgproxy/Edge Runtime/Logflare/Vector | Zero RLS rewrite (GoTrue unused) | Medium — stripped compose needs re-validation on every Supabase image update | Initially chosen at Issue 1, then reversed at Issue 1-REVISED after independent (Codex) review confirmed the same conclusion: every non-Postgres Supabase service duplicates a capability CampusHomes already has (Logto=auth, NestJS=API, Soketi=realtime, Cloudinary=storage, `drizzle-kit studio`=DB browser) |
| E. Self-host Postgres + Logto, keep Better Auth temporarily | High | Low-medium | Comfortable | Zero RLS rewrite | Low | Subsumed — this IS the auth-migration phasing decided in Issue 4, layered onto option C's DB choice |
| F. Supabase Auth instead of Logto | Medium | Low (one less product to run) | N/A | GoTrue `auth.users` model conflict (same as B) | High — would require restructuring the RBAC layer around Supabase's auth conventions | Rejected — user has a firm preference for Logto and the GoTrue conflict is real |
| G. Zitadel/Keycloak/Authentik instead of Logto | Zitadel: high but AGPL-3.0 (2025 relicense); Keycloak: high but heavy; Authentik: high, light | Zitadel/Authentik: low; Keycloak: high | All plausible at self-hosted scale | All compatible (same JWT-to-`app.user_id` bridge pattern) | Medium-high — redoes IAM integration work already scoped for Logto | Considered at Issue 3 (Logto's single-admin-console gap), user chose to keep Logto with a break-glass workaround rather than switch |

**Final recommendation: Option C**, locked at Issue 1-REVISED after the fuller reasoning (below) was walked through with the user. Issue 1's original choice of Option D (with Issue 2's RAM-fit stripping) is preserved in this table as a record of the path taken, not as the active decision.

**Why Option C, in full (the reasoning that changed the decision):**
- Every Supabase service beyond Postgres duplicates something CampusHomes already built: PostgREST duplicates the NestJS API (and would bypass its RBAC guards/audit logging if ever used — a second, uncontrolled access path onto the DB); GoTrue duplicates Logto; Realtime duplicates the (dormant) Soketi adapter; Storage duplicates Cloudinary (and lacks Cloudinary's image-transform/CDN features); Studio duplicates the already-scripted `drizzle-kit studio`; postgres-meta has no standalone value without Studio.
- Growth: Supabase's extra services don't make Postgres itself scale — read replicas, connection limits, partitioning, cache tuning are identical either way. Unused containers only consume RAM that could go to Postgres's own buffer cache.
- Security: Supabase's security value is realized only if GoTrue+RLS+PostgREST is the actual access pattern (JWT-scoped gateway enforcement). CampusHomes uses Logto+NestJS instead, so what's left of the Supabase stack is pure attack-surface cost — postgres-meta specifically is an HTTP-exposed admin-SQL-adjacent API with no counterpart in Option C, and Studio has a real history of self-hosted auth-bypass CVEs.
- Management: a wash-to-negative for D — Studio's convenience is already free via `drizzle-kit studio`; D adds more images to patch and keep mutually compatible, plus Codex's valid point that a hand-stripped compose file drifts from Supabase's own tested full-stack configuration over time (confirmed: Supabase is mid-migration from Postgres 15→17 with a documented breaking upgrade path).

**[EUREKA note, confidence 8/10]**: the reason Option C keeps "zero RLS rewrite" is that GoTrue is never in the picture — Logto (not Supabase Auth) issues the identity token. If a future decision ever swaps Logto for Supabase Auth (Option F), the RLS-compatibility picture changes completely and this conclusion would need to be re-derived.

---

## 7. Recommended Target Architecture (as decided)

```
                         ┌─────────────────────────────────────────┐
                         │         Contabo VPS 6 (Dokploy)          │
                         │                                           │
  Browser ──HTTPS──▶ Cloudflare ──▶ Traefik (Dokploy) ──┬──▶ campushomes-web (Next.js)
                         │                                │
                         │                                └──▶ campushomes-api (NestJS)
                         │                                        │        │
                         │                                        │        └──▶ Better Auth
                         │                                        │             (phased down,
                         │                                        │              Issue 4)
                         │                                        │        │
                         │                                        │        └──▶ Logto client
                         │                                        │             (JWT verify,
                         │                                        │              new flows first)
                         │                                        ▼
                         │                          ┌──────────────────────────┐
                         │                          │ Self-hosted Postgres      │
                         │                          │ (plain postgres:16-postgis│
                         │                          │  or equiv. — PostGIS ext, │
                         │                          │  no Supabase; DB browsing │
                         │                          │  via drizzle-kit studio)  │
                         │                          │  — direct connections,    │
                         │                          │    no pooler (Issue 10)   │
                         │                          └──────────────────────────┘
                         │                                        ▲
                         │                          ┌─────────────┴────────────┐
                         │                          │  Logto OSS + its own      │
                         │                          │  Postgres DB (separate    │
                         │                          │  logical DB, same host)   │
                         │                          └──────────────────────────┘
                         │                                                       │
                         └───────────────────────────────────────────────────────┘
                                          │
                                          ▼
                              Redis (Upstash, managed — unchanged)
```

**Internal-only, never publicly exposed**: Postgres, Logto's admin console (behind the break-glass credential + VPN/IP-allowlist). Public: web, API, Logto's end-user auth endpoints (sign-in/callback), Dokploy panel (behind 2FA + dedicated domain, already the case today).

---

## 8. Enterprise Multi-Tenant IAM Design

**Locked at Issue 5: tenancy stays 100% app-owned; Logto is identity-only.**

### Domain hierarchy (derived from the actual schema, not assumed)

```
Platform (CampusHomes)
 └── Catchment (university/geographic scope — semesters table is catchment-scoped)
      ├── Landlord (individual profile, NOT an "organization" in the current schema —
      │    landlords.kyc_status gates self-update; no landlord-company concept exists today)
      │    └── Property → Unit → Listing
      │         └── Reservation ↔ Student
      └── Ops/Staff (role_assignments scoped platform_wide OR to a specific catchment)
```

There is no "landlord organization" or "university tenant" entity in the current data model — `properties.gps_point` and `semesters` are catchment-scoped, but landlords are individuals. **This is why Issue 5's answer (no Logto Organizations) is correct**: there's no clean domain concept to map onto Logto's Organization primitive without inventing one that doesn't exist yet.

### What Logto owns vs. what the app owns

| Concern | Owner | Why |
|---|---|---|
| "Is this really alice@x.com, verified how (password/OTP/Google)?" | Logto | Identity verification is Logto's job |
| Session/token issuance, refresh rotation, MFA, passkeys | Logto | Core IdP function |
| "What role does this user have, what can they do?" | App (existing RBAC tables) | Already works, already revocation-safe (per-request DB lookup), zero reason to duplicate |
| "What catchment/scope is this user's role active in?" | App (`user_role_assignments.scope`) | Same reasoning |
| Row-level data access | Postgres RLS (`app.user_id`/`app.user_role` GUCs) | Unchanged — the API sets these from its OWN verified DB lookup, using the user_id Logto's JWT identified, never trusting a role claim from the token itself |

### Session architecture: Backend-for-Frontend (locked at Issue 11)

NestJS mints its OWN session cookie after verifying Logto — Logto's access/refresh tokens **never reach the browser**. This was a genuine fork Codex correctly flagged as unaddressed: the alternative (browser holds Logto's tokens directly, SPA pattern) would require rewriting every server component/API route in `apps/web` that currently reads a Better-Auth-style cookie (`session.ts`, `requireRole()`, the `apiServer()` cookie-forwarding helper) to instead manage OIDC token refresh client-side — a much larger blast radius for a traditional server-rendered Next.js app, plus XSS exposure for tokens that a server-only httpOnly cookie avoids.

### Token flow (NestJS side)

```
1. Browser → NestJS → Logto: OIDC Authorization Code + PKCE (NestJS drives the flow,
   not the browser directly — browser only ever talks to NestJS)
2. Logto → NestJS callback: authorization code
3. NestJS → Logto: exchange code for tokens (server-side, PKCE verifier) — Logto's
   access/refresh tokens are held server-side only, never sent to the browser
4. NestJS verifies: issuer, audience, signature (JWKS, cached + rotated per Logto's kid),
   expiry, clock skew tolerance (~60s)
5. NestJS extracts `sub` (Logto user id) → looks up local `users` row by a stored
   Logto-subject mapping. If no local user exists yet (first-ever Logto sign-in),
   run idempotent JIT provisioning NOW, synchronously, before minting a session —
   create the `users` row (status: pending or active per existing invite-flow rules),
   inside a transaction, with a unique constraint on the Logto-subject-mapping column
   so a race (double-click, two tabs) can't create duplicate users. Do NOT authorize
   the request until provisioning has committed. (Codex-flagged gap: Logto webhooks
   are asynchronous and cannot gate the current sign-in's authorization decision —
   provisioning must happen inline in the callback handler, not via webhook.)
6. NestJS mints its OWN session (same table/cookie mechanism Better Auth uses today —
   httpOnly, secure, cross-subdomain config unchanged) — this is what the browser
   actually receives
7. NestJS's existing PermissionsGuard runs exactly as today: per-request DB lookup
   against user_role_assignments, scope check, step-up freshness check
8. withRlsContext() sets app.user_id/app.user_role from the DB-verified values,
   never from the token directly
```

This preserves every invariant already documented in CLAUDE.md (no client-controlled role/status, immediate revocation via per-request lookup, RLS as the real enforcement boundary) — Logto is a drop-in replacement for "how do we know who this is," not a replacement for "what can they do," and `apps/web`'s existing session-reading code needs zero changes.

### Google identity linking — verified subject ID, not email matching (Codex-flagged security gap)

When a Logto-authenticated Google identity needs to link to an existing app user, match on Google's verified `sub` (subject identifier) recorded at first link, never on email address alone. Email-based auto-linking is a known account-takeover pattern: if a user's old email becomes available to a third party (expired domain, reused free-email address), blind email matching would hand that party the linked account. First-time linking still starts from an email/phone match (there's no other way to find the candidate account), but the actual trust decision — "this Logto identity IS this app user" — must persist and re-check the Google subject ID on every subsequent login, not re-derive it from email each time.

### Better Auth → Logto identity migration (phased, per Issue 4)

| Existing data | Migration approach |
|---|---|
| Existing user IDs | Kept as the app's own primary key; add a `logto_subject_id` mapping column, populated as each user first authenticates via Logto |
| Existing emails/phones | Passed to Logto as the identifier at first Logto sign-in; Logto's own verification flow re-verifies (do not carry over a "verified" flag as trusted — cheap and closes a spoofing window) |
| **Existing password hashes** | **Just-in-time (JIT) migration (locked at Issue 12), not a forced reset — this corrects a self-contradiction Codex caught in an earlier draft of this table.** Logto supports a JIT pattern: on login, Logto calls back to a still-running legacy verifier (Better Auth, reachable throughout the phased period per Issue 4) with the submitted password; on success, Logto silently creates its own credential and the user never notices a migration happened. **Prerequisite, not yet verified**: Better Auth's documented default hash algorithm is **scrypt** — confirm this is compatible with Logto's JIT verifier-callback pattern before committing to this path (it doesn't require the hash format itself to be portable, only that a verifier endpoint can check a plaintext-submitted password against it, which scrypt supports in principle — but this needs a concrete spike, not an assumption). **Fallback if incompatible**: forced-reset flow via a "claim your account" email — but only using a mechanism that survives Better Auth's eventual retirement (i.e., built as a Logto-native flow at the point where JIT is being used, not a re-use of Better Auth's own `requestPasswordReset` API past the point Better Auth is decommissioned — the earlier draft's suggestion of reusing that API "after Better Auth is retired" was internally contradictory, since the API wouldn't exist to call at that point). The `requestPasswordReset`-as-bootstrap pattern already built for staff invites (current uncommitted diff) remains valid ONLY during the phased period while Better Auth is still live. |
| Existing Google-linked accounts | Re-link via Logto's own Google connector at next sign-in — no credential to carry over, this is a re-consent, not a migration |
| Existing roles/permissems | **Untouched** — lives entirely in app tables, has nothing to do with the auth provider |
| Existing audit references | Untouched — audit_log references app user_id, not any auth-provider id |
| Existing Better Auth sessions | Expire naturally (7-day `expiresIn` already configured) or force-expired at the scheduled bulk-migration cutover |
| Suspended/deleted users | Do not migrate to Logto at all — suspension/deletion stays enforced at the app layer (`AuthGuard` already rejects non-`active` status) regardless of which IdP issued the token |

No plaintext passwords, no weakened policy, no silent fallback accounts — the forced-reset/claim flow is the only path for users whose hash can't move.

---

## 9. Neon-to-Target Migration Plan

**Locked: DB first (Issue 6), pg_dump/pg_restore with a maintenance window (Issue 7), after fixing CI/CD (Issue 8) and the Drizzle snapshot gap (Issue 9).**

### Phase 0 — Prerequisites (block the migration, not part of it)
1. Regenerate Drizzle snapshots for 0012-0021 (this reconstructs a current-state baseline, it does not recover lost historical detail — Codex correctly flagged that regenerating from live schema alone can't distinguish "no drift happened" from "drift happened and got baked into the new snapshot as if it were always correct." The actual drift-detection step is #4 below: applying all 21 migrations from empty and diffing the result against production's live schema. If that diff is clean, there was no undetected drift and the regenerated snapshot is trustworthy; if it's not clean, stop and investigate before touching the snapshot at all).
2. **Pin exact versions before provisioning anything**: the specific Postgres major version (match Neon's current version, not an arbitrary "latest"), the exact PostGIS version, and record the target image digest (not just a floating tag like `:16`) so the migration is reproducible and re-auditable later.
3. Stand up minimal GitHub Actions CI: lint + typecheck + test (existing 117+16 tests, run against a Postgres+PostGIS service container pinned to the same version chosen in step 2, not a bare Postgres) + container build. Build the deployable image ONCE in CI and promote that same artifact through staging/production rather than letting Dokploy rebuild independently from source — otherwise "tested in CI" and "running in production" aren't provably the same bits (Codex-flagged gap).

### Phase 1 — Target environment setup
4. Provision plain Postgres+PostGIS (pinned version/digest from step 2) on the Contabo VPS via Dokploy, on an internal-only Docker network. Confirm the migration-runner role (a separate least-privilege role from `app_user`, per §11) — not `app_user` — owns the created tables, and that RLS-enabled tables have `FORCE ROW LEVEL SECURITY` set so table ownership can never silently bypass RLS (Codex-flagged verification step: Postgres table owners bypass RLS by default unless forced; confirm this explicitly rather than assuming today's Neon setup already got it right).
5. Run all 21 migrations against the fresh target DB from empty — this is both the schema-equivalence proof for Phase 0 step 1 AND validates the migration files work end-to-end on a clean target, independent of any data copy. Diff the resulting schema against a `pg_dump --schema-only` of the current live Neon schema — this diff must be clean before proceeding.
6. Run the full test suite (117 API tests including the 68 RLS tests) against the freshly-migrated empty target DB with a seeded dataset — confirms RLS policies, triggers, and the verification-checklist trigger behave identically on the new Postgres version/build.

### Phase 2 — Rehearsal (non-production, full dry run)
7. `pg_dump -Fc` from Neon using an **unpooled** connection string (Neon's own documented requirement) against a snapshot/branch of production data.
8. `pg_restore` into a scratch copy of the target Postgres.
9. Validation queries: row counts per table (source vs. target), checksums on a sample of large tables, spot-check `reputation_scores` materialized view content, confirm PostGIS `gps_point` geometries survive with identical coordinates.
10. Run the RLS suite and RBAC service suites against the restored scratch copy.
11. Time the full dump+restore+validate cycle — this becomes the maintenance-window estimate.

### Phase 3 — Production cutover
12. Announce and schedule a maintenance window sized from Phase 2's timing, during low-traffic hours (justified by Phase 1 status: pre-real-money per CLAUDE.md's own Phase 1/2 split).
13. **Freeze every writer, not just the API** (Codex-flagged gap — "maintenance mode" on the API alone doesn't stop everything that writes): stop the BullMQ job runner (hold-expiry and maintenance-queue schedulers), pause/drain any webhook receivers (Flutterwave, Africa's Talking delivery callbacks even if payments are Phase-1-disabled), and confirm no admin script or scheduled task can write during the window. The existing read-only Neon connection stays live only for the dump itself.
14. Final `pg_dump` from Neon (unpooled connection).
15. `pg_restore` into the real target Postgres.
16. Re-run the row-count/checksum/RLS validation from Phase 2 against the real target.
17. Point `DATABASE_URL` at the new Postgres (both the main API pool and, if Better Auth hasn't migrated yet, `AUTH_DATABASE_URL` too — Better Auth's non-pooled-connection requirement is now trivially satisfied since there's no pooler in front of self-hosted Postgres at all, per Issue 10).
18. Smoke-test the live app against the new DB (auth sign-in, a search query, a reservation-flow dry run) — this requires basic monitoring (even just `docker stats` + Postgres connection/latency queries watched manually) to exist BEFORE this step, not deferred to the "full observability" follow-up pass. Minimal ≠ absent: you need to be able to see a problem the moment it happens during this exact window.
19. Resume the frozen writers from step 13 in reverse order, verify no queued job or webhook was silently dropped rather than delayed.
20. Lift maintenance mode.

### Rollback strategy — honest version (Codex correctly rejected the original draft's rollback claim)
- **Point of no return is step 17, not "after some grace period"**: the instant production writes land on the new Postgres, reverting `DATABASE_URL` back to Neon does **not** restore a consistent state — it silently discards every write that happened on the new DB (new reservations, sessions, audit entries, sequence advances), which is data loss dressed up as a rollback. This plan does not pretend otherwise.
- **Real rollback options, choose explicitly before the maintenance window, not during an incident**:
  1. **Accept a defined data-loss window**: if something breaks post-cutover, accept that any writes since step 17 are lost, revert to Neon, and treat the affected records as needing manual reconciliation (or acceptable loss, given Phase 1's pre-real-money status makes this genuinely lower-stakes than it would be post-Phase-2).
  2. **Forward-fix instead of rollback**: given option 1's cost, the default posture is "fix forward on the new Postgres" (roll back a bad migration, not the whole cutover) rather than reverting the connection string at all — reserve full reversion for a catastrophic, unfixable failure.
- Keep Neon read-only and un-deleted for a minimum retention window (recommend 14 days) specifically so option 1 has a known-good source to reconcile against if it's ever invoked — this is a forensic/reconciliation aid, not a live rollback target.

### Post-cutover monitoring
- Watch Postgres connection count, query latency percentiles, and disk usage for the first 48 hours at minimum — this is the bare-minimum, must-exist-by-cutover monitoring referenced in step 18, distinct from the full observability stack deferred in §13-19.
- Diff `drizzle-kit check` output against the now-current (regenerated, Phase 0) snapshots to confirm no unexpected schema drift was introduced by the restore process itself.

---

## 10-19. Condensed (per agreed scope — full depth deferred to a follow-up pass if wanted)

**10. Dokploy topology**: One Docker network per environment (staging/production, already separated today). New services (self-hosted Postgres, Logto + its Postgres) join the production network as internal-only (no published ports — Traefik/Dokploy routes what needs external access, same pattern as the existing API/web services per `README.md:510-580`). Logto's public sign-in/callback endpoints get a subdomain; its admin console does not get a public route — VPN or IP-allowlist only.

**11. Security checklist (essentials)**:
- Postgres: keep the single `app_user NOLOGIN` role pattern; add a **separate migration-only role** (currently migrations run as whatever `DATABASE_URL` connects as — this is a real gap worth closing, least-privilege for schema changes vs. runtime app queries) and a **separate Logto database role**, both least-privilege.
- Host: confirm SSH key-only, root login disabled, UFW matches the documented 22/80/443-only policy (already true per README).
- New service secrets (Logto's own signing keys, its DB credentials) go through Dokploy's secret injection, never committed, never logged.
- Logto admin console: break-glass credential (Issue 3) stored in a vault, rotated on a defined schedule, access logged.

**12. Backup and DR (essentials)**:
- Logical backups (`pg_dump`) on a schedule, stored off-VPS (not just a Contabo snapshot — snapshots are not a backup strategy on their own). **Scope: both databases** — the CampusHomes app DB and Logto's own DB (Codex-flagged gap — an earlier draft only specified "the DB," singular, but Logto's database is just as much a single point of failure as the app's). Also back up Logto's connector/configuration files (`docs.logto.io` deployment docs note these are file-based, not just DB-stored) — losing them means reconfiguring every social connector and sign-in experience setting from scratch.
- WAL archiving for point-in-time recovery once the DB is self-hosted (Neon provided this managed; self-hosting means the app now owns it) — applies to the app DB; Logto's DB can reasonably use logical-backup-only given its smaller, less write-heavy footprint.
- A monthly restore-drill is the only way to know backups actually work — schedule it, don't assume it.
- **Explicitly not defined in this pass** (Codex-flagged, deferred deliberately not silently): RPO/RTO numbers, a named disk-failure scenario walkthrough, and an admin-access recovery procedure if the Logto break-glass credential (Issue 3) itself is lost or compromised — all real gaps, all appropriate follow-up-pass content given a single-VPS small-team deployment has no HA story to fall back on regardless (§5's accepted residual risk).

**13-19 (Observability, Testing enumeration, Dokploy full runbooks, Phased roadmap detail, Rollback detail beyond §9, Cost estimate, full Open Risks list)**: deferred to a follow-up `/plan-eng-review` pass once Phase 0-3 above are underway — these are downstream operational detail that depend on the architecture locked in this document, not inputs to it. **Also explicitly deferred and named here rather than silently thin** (Codex-flagged): the detailed Phase 4 auth-migration implementation sequence — dual-guard code structure, feature-flag cohort rollout, session/token invalidation at the final cutover, support-fallback procedure for users who can't complete JIT migration, and the final Better Auth shutdown checklist. §8 of this document locks the *design* (BFF sessions, JIT password migration, verified-subject-ID linking, inline JIT provisioning) — the *implementation sequencing* of rolling that out is real work for the follow-up pass, not a rounding error.

---

## What Already Exists (reused, not rebuilt)

- RBAC/permission layer (7 roles, ~59 permissions, scope model, step-up gating) — fully reused, zero changes needed for the IAM migration.
- RLS policy set (27+ tables, 68 tests) — fully reused, validated as part of the migration (Phase 1 step 5) rather than rewritten.
- Existing `withRlsContext()`/`RlsDb.run()` pattern — the JWT-to-`app.user_id` bridge in §8 plugs into this unchanged.
- Existing invite-credential-bootstrap pattern (uncommitted, current branch) — reused as the template for the forced-reset/claim flow in the Better Auth → Logto identity migration.
- Existing Dokploy staging/production separation and secret injection — reused for the new services, not reinvented.

## NOT in Scope (this pass)

- Self-hosting Redis — explicitly kept on Upstash (pre-Issue-1 scope decision).
- Full observability stack, complete 8-runbook set, full test-plan enumeration, detailed cost estimate — condensed per agreed depth (§10-19 above); real work, deferred not dropped.
- Multi-VPS high availability — not requested, and out of proportion for a small team on one Contabo box; accepted residual risk (§5).
- Landlord-organization or university-tenant data model — doesn't exist today; inventing it wasn't asked for and Issue 5 concluded there's no clean mapping to force onto Logto Organizations without it.

## CEO Review Addendum (SELECTIVE EXPANSION mode — full record in `~/.gstack/projects/Festo-Wampamba-Campus-Homes/ceo-plans/2026-08-26-neon-supabase-logto-migration.md`)

**Premise challenge, resolved:** Better Auth already ships `twoFactor`/`passkey`/`admin`/`organization` plugins natively — the original brief's motivation for switching to Logto (MFA, passkeys, multi-admin) was technically achievable without a provider swap at all. The user's explicit call to proceed with the full Logto migration anyway stands, for their own stated reason (current implementation "wasn't built fully and strong"). Recorded, not re-litigated — Approach A (full Logto migration, as designed in §1-12 above) is confirmed.

**Accepted scope expansions (added to §8's IAM design):**
1. **Step-up MFA reverification** — wires Logto's TOTP/backup-code verification into `PermissionsGuard`'s existing `requiresStepUp` freshness-window check (`permissions.ts`), finally unblocking `staff.deactivate`/`roles.assign`/`roles.revoke`, which have been hard-`501`'d for everyone (including `super_admin`) since the original RBAC Foundation work per CLAUDE.md.
   - **Failure posture (locked)**: if Logto's MFA verification is unreachable when a step-up-gated action is attempted, **fail closed** — block the action, show "step-up verification unavailable, try again shortly." This matches the existing 501 posture (fails closed today for a different reason) and is the only posture consistent with why step-up MFA exists — failing open would turn an MFA-service outage into exactly the privilege-escalation window step-up is meant to prevent.
2. **Passkeys (WebAuthn)** for all users (student/landlord/ops), not just staff — a deliberate product-value expansion (not required by item 1's infrastructure-unblocking goal), justified because the marginal cost is low while Logto integration is already underway.
   - **Fallback requirement (locked, no real alternative to debate)**: passkeys are strictly additive. Password/OTP/Google sign-in remain always-available options — never passkey-only enforcement, and no user should be able to reach a state where they have zero working sign-in method. This directly closes the WebAuthn device-compatibility gap flagged in the CEO plan (students/landlords skew toward lower-end Android hardware that may lack secure authenticator support).

**New error/rescue entries** (extends §Failure Modes above):

| Codepath | What can go wrong | Rescued? | Rescue action | User sees |
|---|---|---|---|---|
| Step-up MFA check during a gated staff action | Logto MFA service unreachable/timeout | Y (locked above) | Block the action, do not proceed | "Step-up verification unavailable, try again shortly" |
| Step-up MFA check | User fails TOTP/backup code | Y | Deny the action, allow retry | "Verification failed" + retry |
| Passkey registration | Browser/device doesn't support WebAuthn | Y | Hide passkey option, no dead-end | Password/OTP/Google remain visible and functional |
| Passkey sign-in | User's only passkey device is lost/unavailable | Y (by the fallback requirement above) | Fall back to password/OTP/Google | Normal sign-in options still work — never locked out |

**Observability note (feeds the already-deferred §13-19 follow-up pass, not a new decision):** when that pass happens, it must include step-up-MFA failure rate, repeated-step-up-failure alerting (a spike can indicate an account-takeover attempt against a staff account), and passkey registration success/failure rate — these two new codepaths need day-one visibility, not bolted on later.

**Design & UX**: this expansion has real UI scope (passkey registration/sign-in across three portals, an MFA setup flow) that hasn't been designed yet — recommend running `/plan-design-review` before implementation once the UI is sketched, per the standard chaining from this review.

**Dream state delta**: without this addendum, the migration would have shipped as a pure backend swap — same capabilities, different vendor. With it, the migration also closes a real, previously-blocked capability gap (step-up MFA) and adds a concretely better sign-in experience (passkeys) — moving further toward the 12-month ideal than the base migration alone would have.

## Design Review Addendum (text-based — gstack designer mockup generation was unavailable, no OpenAI API key configured; ratings and specs below are calibrated against DESIGN.md's OKLCH tokens/typography/component rules directly)

**Initial rating: 2/10 → 8/10 after this addendum.** Remaining gap to 10/10: no visual mockup exists to validate the spec against (deferred — see Unresolved Decisions).

### Pass 1 — Information Architecture (3/10 → 8/10)

```
Student profile page (existing)
 └── Particulars section (existing: name, DOB, contact, emergency contact)
 └── Security section (NEW — same page, new section, no new nav item)
      ├── Passkeys card
      │    ├── [zero registered] → empty state (teaches: icon + "A passkey lets
      │    │    you sign in with your fingerprint/face instead of a password" +
      │    │    "Add a passkey" primary button + small print: "Password and
      │    │    phone sign-in always stay available")
      │    └── [1+ registered] → list (device name + last-used date) +
      │         "Add another passkey" secondary button + same fallback small print
      └── Two-factor authentication card
           ├── [disabled] → toggle off, "Add an extra layer of security" description
           ├── [enabled] → toggle on, "Backup codes: N remaining", "View backup
           │    codes" link, "Disable" button (→ re-verification per locked decision)
           └── [enabling, mid-setup] → TOTP QR + manual key + 6-digit confirm input
Landlord/Ops portals: identical structure, mounted in their own particulars page
 (same components per DESIGN.md's shared shadcn/ui vocabulary — not rebuilt per portal)
```

Constraint worship applied: only 2 cards on this section (Passkeys, 2FA) — not a
sprawling "Security dashboard." Matches DESIGN.md's "dense but readable, minimal
chrome" App UI rule.

### Pass 2 — Interaction State Coverage (3/10 → 9/10)

```
FEATURE                  | LOADING              | EMPTY                        | ERROR                          | SUCCESS                        | PARTIAL
--------------------------|----------------------|------------------------------|---------------------------------|---------------------------------|------------------
Passkey list              | 2-row skeleton       | Teaching empty state (above) | "Couldn't load passkeys, retry" | List renders                    | N/A
Add passkey                | Button → spinner    | N/A                          | "Registration failed — try again, or use a different device" | Toast "Passkey added" + list refreshes | Browser cancels the WebAuthn prompt → silently return to prior state, no error toast (user-initiated cancel, not a failure)
2FA enable (QR step)       | QR generating skeleton | N/A                       | "Couldn't generate setup code, retry" | Moves to confirm-code step      | N/A
2FA confirm code           | Button → spinner    | N/A                          | "Incorrect code" inline under input, code field clears, refocus | Enabled state + backup codes shown once | N/A
2FA disable (re-verify)    | Button → spinner    | N/A                          | "Incorrect password/code" inline, stays open | Toggles off, toast "Two-factor disabled" | N/A
Backup codes view          | Skeleton             | N/A (always exactly 10 generated) | "Couldn't load codes, retry"   | Codes shown + "Copy all"/"Download" | N/A
```

Empty state (passkey list, zero registered) is a designed feature per Design
Principle 1, not "No items found." — teaches what a passkey is, gives the one
action that matters, and visibly states the fallback guarantee.

### Pass 3 — User Journey & Emotional Arc (4/10 → 8/10)

```
STEP                          | USER FEELS                        | PLAN SPECIFIES?
-------------------------------|------------------------------------|------------------
Opens Security section first time | Slightly apprehensive ("is this required?") | Yes — empty state explicitly reassures via fallback small print, not required
Registers a passkey            | Relief ("that was fast")           | Yes — WebAuthn's native OS prompt handles the ceremony, our UI just triggers it + confirms success via toast
Sets up 2FA, sees backup codes | Mild anxiety ("what if I lose these?") | Yes — "Download" action + persistent "View backup codes" link so it's not a one-time-only view
Tries to disable 2FA           | Deliberate, slight friction expected | Yes — re-verification step (locked decision) signals "this matters," not a dead-end error
Loses passkey device, signs in elsewhere | Worry about lockout       | Yes — password/OTP fallback always visible on sign-in screen, not hidden behind a "more options" toggle
```

5-second visceral: the fallback small print on the empty state is the single most
important visceral signal — it answers "will I get locked out?" before the user
even asks it.

### Pass 4 — AI Slop Risk: 0/10 findings (classified App UI, not marketing)

Checked against the blacklist: no 3-column feature grid, no colored-circle icons
as decoration, no centered-everything, no decorative blobs, no emoji. Two cards
(Passkeys, 2FA) each earn their existence as real interactive surfaces, not
decoration — passes "cards only when card IS the interaction." Copy specified
above is utility language (status + action), not brand/mood language, matching
the App UI rule. **No issues, moving on.**

### Pass 5 — Design System Alignment (5/10 → 9/10)

- `StatusChip` pattern → passkey "last used" / 2FA "enabled" indicators (tinted
  bg + solid ink + icon, never color-only, per DESIGN.md's status vocabulary).
- Buttons: primary teal solid ("Add a passkey", "Enable"), secondary white+border
  ("Add another passkey"), destructive red solid ("Disable" — matches DESIGN.md's
  destructive = solid red rule since disabling 2FA is a security-reducing action).
- Radius/shadow: cards `rounded-lg` + `shadow-xs` resting, inputs/buttons `rounded-md`.
- Typography: Poppins 600 for "Security" section heading, Open Sans for body/labels,
  tabular-nums for the backup-codes-remaining count (DESIGN.md's numeric rule).
- Focus: 2px teal ring on the TOTP code input and all buttons, per DESIGN.md's
  "focus = 2px teal ring, always visible" — non-negotiable for a security flow
  that will be used with a physical authenticator app open on a second device.

### Pass 6 — Responsive & Accessibility (2/10 → 8/10)

- Mobile (< 640px): single column, cards stack full-width, "Add a passkey" and
  "Enable 2FA" CTAs are full-width buttons (44px min touch height, already a
  DESIGN.md rule) — not the desktop's inline button-in-card-header pattern.
- TOTP QR code: on narrow viewports, QR renders at a fixed minimum scannable size
  (not scaled down to fit) with a "Can't scan? Enter code manually" text link below
  it revealing the manual key — never QR-only, since some authenticator apps or
  screen-reader users can't use a camera-scan flow at all.
- Keyboard nav: 2FA confirm-code input auto-advances focus per digit is explicitly
  NOT used (a known accessibility anti-pattern that breaks screen readers and
  password managers) — one standard 6-digit text input instead.
- Screen readers: passkey registration triggers the browser's native WebAuthn UI,
  which handles its own accessibility; our page must announce success/failure via
  an `aria-live` region (toast alone is not sufficient for screen-reader users).
- Color contrast: all copy above uses `--ink`/`--muted-ink` on `--bg`/`--surface`,
  already verified 4.5:1+ per DESIGN.md — no new contrast risk introduced.

### Pass 7 — Unresolved Design Decisions

```
DECISION NEEDED                              | IF DEFERRED, WHAT HAPPENS
-----------------------------------------------|---------------------------
Exact copy for the passkey empty-state teaching sentence | Engineer writes ad-hoc copy that may not match DESIGN.md's "utility language" rule
Whether backup codes are shown once (typical security pattern) or persistently re-viewable | Spec above chose persistently re-viewable via "View backup codes" link — flagging since typical security UX shows them once-only at generation and never again; re-viewable is more forgiving for a student/landlord audience but slightly weaker if a device is later compromised
No visual mockup exists — all of the above is a text/token spec, not a rendered image | First implementation PR effectively becomes the first visual review; recommend a quick /design-review pass on the live page once built, before wider rollout
```

The backup-codes-persistence choice is a real, live decision — recorded above with
its tradeoff rather than silently assumed. Given CampusHomes's non-enterprise
audience and the explicit goal (avoid lockouts), persistently re-viewable is the
recommended default, but this is flagged, not force-closed.

## TODOs Identified (to add to TODOS.md at implementation start — no TODOS.md exists in the repo yet, and plan mode can't create it)

- **What**: Spike whether Better Auth's scrypt password hashing is compatible with Logto's JIT-migration verifier-callback pattern.
- **Why**: Issue 12 locked JIT migration (transparent password migration on next login) as the plan. It has one unverified prerequisite — if scrypt turns out incompatible with Logto's verifier callback, Phase 4 needs the forced-reset fallback instead, a materially different UX and support-load commitment.
- **Pros**: Cheap to verify (a few hours), resolves the single open unknown blocking a confident Phase 4 password-migration commitment.
- **Cons**: None significant — this is due diligence, not new scope.
- **Context**: Better Auth's docs list scrypt as its default hash algorithm (`apps/api/src/modules/auth/auth.config.ts`). Logto's JIT-migration docs describe a generic verifier-callback pattern but don't list scrypt by name among confirmed-compatible formats.
- **Depends on**: nothing — can be spiked independently, before any other Phase 4 work.

## Failure Modes (for the decisions locked in this pass)

| Failure scenario | Covered by a test? | Error handling exists? | Silent or visible? |
|---|---|---|---|
| Neon dump taken over a pooled connection (rejected/corrupted) | Phase 2 rehearsal catches this before production | Yes — Neon's own connection-string validation | Visible (dump fails loudly) |
| Migration-runner role accidentally owns RLS-enabled tables, `FORCE ROW LEVEL SECURITY` not set | Phase 1 step 4 makes this an explicit verification step | Yes, if step 4 is followed | Would otherwise be **silent** — a table owner bypasses RLS by default with no error, just quietly-wrong query results (Codex-flagged, now covered) |
| Google-identity auto-link by email alone lets a stale/reused email hijack an account | No test yet — this is new logic per §8's verified-subject-ID design | Design now specifies verified-`sub`-only linking; needs a test once built | Would be **silent** if implemented wrong (looks like a normal successful login) — flag as a required test when Phase 4 auth-migration code is written |
| Dual auth-path (Better Auth + Logto) guard bug lets a revoked Logto user keep a valid Better Auth session or vice versa | Needs a new test once phased rollout begins — not yet written | Partially — `AuthGuard` already checks `status !== 'active'` regardless of token source | Should be visible (401) if built correctly; **critical gap until that guard-unification test exists** |
| Drizzle snapshot regeneration (Issue 9) surfaces real undocumented drift, not just a tooling gap | The diff-and-verify step itself is the test | N/A | Visible by design — this is the point of doing it before the migration |

The dual auth-path guard gap is the one **critical gap** from this pass: no test exists yet because the phased rollout code doesn't exist yet. This should be the first test written when Phase 4 (auth migration) implementation begins.

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | issues_open | Premise challenge surfaced Better Auth already covers most of the original MFA/passkey motivation (user chose to proceed with Logto anyway, for stated reasons); 2 of 5 scanned expansions accepted (step-up MFA, passkeys), 2 deferred, 1 new security-posture decision (fail-closed on MFA outage) |
| Codex Review | `/codex review` (outside voice, via `/plan-eng-review`) | Independent 2nd opinion | 1 | issues_found | 18 findings — 1 caused a reversed decision, 2 became new locked decisions, 1 was a caught logic bug (fixed directly), 14 became direct plan refinements |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | issues_open | 13 issues total (10 main pass + 3 outside-voice-driven), all resolved via explicit user decision; 2 critical gaps remain (below) |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | issues_open | Score 2/10 → 8/10 across 7 passes; 2 nav/security decisions locked, 1 decision (backup-code persistence) flagged not force-closed; no visual mockup (OpenAI API key unavailable) |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | not run |

**CODEX:** Independent review correctly caught: (1) the full-Supabase decision was strategically unnecessary — user reversed it (Issue 1-REVISED → Option C); (2) a real internal contradiction in the password-migration table (fixed directly, no vote needed — it was a bug, not a choice); (3) a materially better password-migration mechanism existed (Logto JIT migration) that the original draft hadn't considered — became Issue 12; (4) an unspecified session/cookie architecture fork — became Issue 11 (BFF, locked); plus 14 concrete refinements (version pinning, freeze-all-writers at cutover, RLS table-ownership/FORCE-ROW-LEVEL-SECURITY verification, backup scope covering both DBs + Logto config, minimum pre-cutover observability distinct from the deferred full stack, CI testing against a version-matched Postgres+PostGIS service + build-once-promote, inline JIT user-provisioning idempotency, verified-subject-ID Google identity linking) — all incorporated directly into §7-12 as refinements consistent with already-locked direction, not forks requiring a vote.

**CROSS-MODEL TENSION (resolved):** Review's original recommendation (Option C) vs. user's initial Issue-1 choice (Option D) vs. Codex's independent Option-C conclusion — presented to the user with full reasoning (growth/security/management angles specific to CampusHomes, not just the RAM math already given). User reversed to Option C. Separately, the CEO review's own premise challenge (Better Auth already has native MFA/passkey/admin plugins) was presented and the user chose to proceed with the Logto migration anyway — recorded, not overridden, per user sovereignty.

**VERDICT:** ENG + CEO + Design review complete, including outside-voice pass. All 13 eng-review issues, all CEO-review decisions, and all design-review decisions (nav placement, MFA-disable re-verification, plus 5 passes of state/journey/system/responsive specification) resolved via explicit user decision. Design score improved 2/10 → 8/10 — the remaining 2 points require an actual rendered mockup, which wasn't possible this pass (no OpenAI API key configured for the gstack designer). Four critical/open gaps remain, all correctly scoped as implementation-time work: (1) dual auth-path guard test, (2) verified-subject-ID Google-linking test, (3) step-up-MFA-outage fail-closed test, (4) no visual mockup exists yet for the security UI — recommend a `/design-review` pass on the live page once built, before wider rollout. Sections 10, 13-19 remain condensed per the user's own agreed scope. Re-run `/plan-eng-review` on the condensed-sections follow-up pass before treating this as fully shipped.

**UNRESOLVED DECISIONS:**
- Sections 13-19 (observability platform, full test-plan enumeration, all 8 runbooks, cost estimate, complete risk register) and the detailed Phase 4 auth-migration implementation sequence (dual-guard code structure, cohort rollout, final Better Auth shutdown checklist) were explicitly deferred per the user's agreed scope choice — treat as open until a follow-up pass covers them.
- The scrypt/Logto-JIT compatibility spike (TODOs Identified section above) is unverified — Issue 12's JIT-migration design is contingent on this checking out.
- Backup RPO/RTO numbers, a named disk-failure walkthrough, and a recovery procedure for a lost/compromised Logto break-glass credential are named but not specified (§12) — real gaps, appropriately sized as follow-up-pass content given the single-VPS scope.
- Backup-codes persistence (shown once vs. persistently re-viewable) was flagged with a recommendation, not force-closed — confirm before implementation.
- No rendered visual mockup exists for the Security section (gstack designer unavailable — no OpenAI API key) — the design spec is text/token-level only; recommend a live `/design-review` pass once built.
- Two lower-priority expansion candidates (self-service session/device management page, Logto admin-action audit trail) were scanned and explicitly deferred, available on request per the CEO plan doc.
