# Sign-in cleanup, required contact phone, 24h hold

Date: 2026-10-11 · Reviewed with /plan-eng-review · Branch: off `origin/development`
(local `development` is stale at migration 0055; branch from the remote).

## Goal

1. Public `/sign-in` shows only **Find student housing**, **Manage my properties**
   and **Create an account**. Staff sign-in moves to `/staff`.
2. Sign-up asks for a password (prod Logto setting, no code).
3. After sign-up every account must give **full name, username and phone**,
   with clear example hints.
4. Reservation hold is **24 hours**, not 72.

## Decisions (locked in review)

| # | Decision | Why |
|---|---|---|
| D2 | `/staff` page; `/sign-in?next=/admin…|/ops…` redirects there (query kept). `/staff` in robots `Disallow` + covered by the proxy's `X-Robots-Tag`. | Hides staff from the public page without stranding staff bookmarks. A hidden URL is hygiene, not security: invite-only accounts + enforced MFA stay the real control. |
| D3 | Phone goes in a **new `users.contact_phone`** (nullable, not unique, never used for identity matching). | `users.phone` is a sign-in identity: UNIQUE (`identity.ts:7`) and matched in `provisioning.service.ts:146-147` / `:183-191`. An unverified number there lets one user lock another out. |
| D4 | Gate applies to **every account**; existing accounts without a contact phone see `/onboarding` once. | One rule, no role branching. |
| D5 | Migration sets `reservation_hold_hours` 72→24 only if still the untouched seed; one shared default constant; number-free copy. | Every environment on deploy; admin overrides kept; copy can't go stale. |
| D6 | Faint `e.g.` placeholders + one helper line per field, matching styles, required markers. | "Jane Doe" currently renders darker than "janedoe" and looks pre-filled. |
| D7 | SMS verification of `contact_phone` → `TODOS.md`. | Not needed to launch; avoids making sign-up depend on SMS. |
| D8 | API callback `fail()` is **portal-aware** once the transaction is read: staff → `/staff?error=…`, consumer → `/sign-in?error=…`. | Error-code guessing missed 4 staff errors and misrouted deleted students (`not_invited` isn't staff-only, `provisioning.service.ts:71`). |
| D9 | Migration **backfills** `contact_phone = phone` (verified numbers only live there); provisioning `createUser` sets both for new phone sign-ups. No read-time fallback. | One source of truth; phone sign-ups are never re-asked. |
| D10 | Fix **`PhoneField` once**: value updates on every keystroke (not only `onBlur`, `phone-field.tsx:82`), shared `Input` styling, optional `placeholder`/`hint` props with today's defaults. | Enter-to-submit currently sends an empty phone in every form using it. |
| D11 | Plus: null-only gate check (deploy-order loop guard) and `next` carried through onboarding; staff-facing views show `contact_phone`; unchanged username accepted; 72→24 guarded by `updated_by IS NULL`. | Outside-voice gaps, accepted. |

**SMS stays on the verified sign-in phone.** `notifications.service.ts:40` keeps reading
`users.phone`: texting an unverified `contact_phone` could send a stranger reservation details.

## Flows

```
Public                                       Staff (/staff, robots Disallow)
/sign-in                                      ├─ Administration ─► Logto staff ─► MFA ─► /admin
 ├─ Find student housing ─► Logto consumer    └─ Operations ─────► Logto staff ─► MFA ─► /ops
 ├─ Manage my properties ─► Logto consumer (landlord intent)
 └─ Create an account ────► Logto consumer, register screen

/sign-in?next=/admin|/ops… ──redirect──► /staff?next=…

API callback failure (after transaction read):
   transaction.portal == staff ? /staff?error=X : /sign-in?error=X
   (bad/missing state, before the transaction is known → /sign-in, unchanged)

After any sign-in:
 session.user.contactPhone
   ├─ undefined (older API still live) ─► treat as present (no loop)
   ├─ null ─► /onboarding?next=<dest>  (name/username/phone pre-filled where known)
   │            └─ submit ─► authorizedNext(next) or /choose-workspace
   └─ set  ─► destination
```

## Tasks

- [ ] **T1 (P1, human ~3h / CC ~20min) — web+api — staff sign-in at `/staff`**
  - `apps/web/src/app/(auth)/sign-in/sign-in-form.tsx`: remove the staff block; add
    "New here? Create an account" → `signInUrl("consumer", next, "student", "register")`.
  - New `apps/web/src/app/(auth)/staff/page.tsx` + `staff-sign-in.tsx` (staff block moved
    as-is, keeps the safe `staffNext` handling and the staff error messages).
  - `sign-in/page.tsx`: redirect to `/staff` (preserving raw `searchParams`) when `next` is
    an `/admin…`/`/ops…` path.
  - `auth.controller.ts:114`: after `transactions.consume`, failures use
    `transaction.portal === 'staff' ? '/staff' : '/sign-in'`.
  - `apps/web/src/app/robots.ts`: add `/staff` to `disallow`.
  - Tests: move `sign-in-form.test.tsx:60,:69` to a staff test (regression); `/sign-in` has
    no staff buttons; student register link; `next=/admin` redirect; callback spec: staff
    failure → `/staff`, consumer failure → `/sign-in`.
- [ ] **T2 (P1, human ~5h / CC ~35min) — api+shared+web — required contact phone**
  - Migration `0062_users_contact_phone.sql` (hand-written + journal entry; do NOT run
    `drizzle-kit generate`, snapshot chain is broken after 0011):
    `ALTER TABLE users ADD COLUMN contact_phone text;`
    `UPDATE users SET contact_phone = phone WHERE phone IS NOT NULL;` + drizzle field.
  - `provisioning.service.ts createUser`: set `contact_phone` = verified phone on insert.
  - Shared: `profileOnboardingSchema` + `updateSelfParticularsSchema` gain
    `contactPhone: africanPhone`.
  - `me.controller.ts completeOnboarding`: set `contactPhone`, never `phone`; accept an
    unchanged username even if it predates today's rules.
  - Session: `SessionData` (`session.store.ts:27-37`) + `SessionStore.find` select +
    web `SessionUser`/`RawSessionResponse` (`session.ts:16-40`) carry `contactPhone`.
    `needsProfileSetup`: missing only when `contactPhone === null`.
  - `requireSession`/`requireWorkspace` (`session.ts:88,99`) redirect to
    `/onboarding?next=…`; onboarding page/form honour it via `authorizedNext`.
  - Particulars (`modules/profile/particulars.ts`, `GET /me/particulars`
    `me.controller.ts:74-87`, student/landlord profile GETs) read/write `contact_phone`;
    staff profile (`(ops)/ops/profile`) can edit it.
  - Staff-facing readers show `contact_phone`: `admin-users.service.ts:200`,
    `admin-dashboard.service.ts:225,299`, `staff.service.ts:46`, `ops.service.ts:1231`,
    `landlords.service.ts:65,83`, `room-management.service.ts:906`. NOT
    `notifications.service.ts:40` (SMS stays on verified phone).
  - Tests: onboarding stores `contact_phone`, leaves `phone` NULL; rejects a bad phone;
    unchanged legacy username accepted; `needsProfileSetup` null/undefined/set; migration
    backfill; `next` preserved through onboarding.
- [ ] **T3 (P2, human ~3h / CC ~20min) — web — PhoneField + onboarding hints**
  - `components/phone-field.tsx`: update parent value on change (not only blur), shared
    `Input` styling, optional `placeholder` + `hint` props (defaults = current behaviour),
    input carries `required` when the prop is set.
  - `onboarding-form.tsx`: shared `Input` for name/username, `PhoneField` for phone;
    placeholders `e.g. Sarah Nakato` / `e.g. sarah_n` / `e.g. 772 123 456`; helper lines
    "As it appears on your student ID" / "3–20 letters, numbers or underscores" /
    "So landlords and our team can reach you"; required markers.
  - Tests: PhoneField commits on typing and Enter submits the typed number; admin forms
    unchanged with default props.
- [ ] **T4 (P2, human ~1h / CC ~10min) — api+web — 24h hold**
  - Migration `0061_reservation_hold_24h.sql`: `UPDATE platform_settings SET value='24'::jsonb
    WHERE key='reservation_hold_hours' AND value='72'::jsonb AND updated_by IS NULL;`
  - Export one default (24) and use it in `reservations.service.ts:26` and
    `admin-dashboard.service.ts:455` (replacing `?? 72`).
  - `(student)/reservations/page.tsx:22` copy → "When you reserve a room, it appears here
    with its countdown and status."
  - Tests: migration keeps an admin-set value; seeded DB hold expires at now+24h.
- [ ] **T5 (ops, Festo) — prod Logto → Sign-in experience → sign-up → "Create your password" ON.**
  Existing password-less users can add one via Profile (`PATCH /me/password`).

## Test coverage

```
CODE PATHS                                          USER FLOWS
[+] sign-in-form.tsx                                [+] Student creates account
  ├─[★★ ] signInMode (tested :5)                      ├─[T1] Create account → Logto register
  ├─[T1 ] no staff buttons (REGRESSION)               └─[manual staging] password asked (T5)
  └─[T1 ] student register link                     [+] Staff
[+] sign-in/page.tsx: next=/admin → /staff [T1]       ├─[T1] /admin bookmark → /sign-in → /staff
[+] staff/page.tsx: buttons + safe next [T1, REGR]    └─[T1] staff callback error shown on /staff
[+] auth.controller fail(): portal-aware [T1]       [+] Onboarding
[+] session needsProfileSetup null/undef/set [T2]     ├─[T2] existing user w/o phone → once, then back to next
[+] me onboarding: contact_phone not phone [T2]       ├─[T2] phone sign-up → backfilled, not re-asked
[+] me onboarding: bad phone, legacy username [T2]    └─[T3] Enter in phone field submits typed number
[+] PhoneField live value + defaults [T3]           [+] Reserve
[+] migrations 0062 backfill, 0061 guard [T2,T4]      └─[T4] new hold shows ~24h countdown
```

## Failure modes

| Path | Realistic failure | Test | Handled | User sees |
|---|---|---|---|---|
| web deployed before API | session lacks `contactPhone` | yes (T2) | `undefined` ≠ missing | nothing |
| staff callback error | lands on consumer page | yes (T1) | portal-aware `fail()` | message on `/staff` |
| onboarding phone | number is someone's sign-in phone | yes (T2) | separate column | nothing breaks |
| onboarding submit | API 500 | existing | `apiErrorMessage` | "Couldn't save your profile" |
| re-gated user | deep link lost | yes (T2) | `next` carried | lands where they meant |
| hold migration | admin had saved 72 or 48 | yes (T4) | `updated_by IS NULL` | their value kept |
| password toggle | not flipped on prod | manual QA | n/a | sign-up still code-only |

No critical gaps (every path has a test or handling and a visible outcome).

## NOT in scope

- SMS verification of the contact phone (`TODOS.md`).
- Reconciling landlords' WhatsApp / per-property contact numbers with `contact_phone`.
- Staff on a separate subdomain or IP allow-list (MFA + invite-only already cover it).
- Logto hosted-page branding.
- Existing holds keep their original expiry; only new holds get 24h.

## What already exists (reused)

- Logto register screen (`screen=register`, consumer only).
- `PhoneField` + `africanPhone` (fixed, not duplicated).
- `needsProfileSetup` + `/onboarding` + `POST /me/onboarding` (extended).
- `authorizedNext` (`lib/auth-routing.ts`) for the `next` hand-off.
- `platform_settings.reservation_hold_hours` + Admin → Settings stay the runtime source.
- `PATCH /me/password` for current password-less users.

## Parallelization

| Step | Modules | Depends on |
|---|---|---|
| T1 | web `(auth)/`, api `auth/` | — |
| T2 | shared, api `profile/` `auth/` `staff/` `ops/` `landlords/` + migrations, web `lib/` `onboarding/` | — |
| T3 | web `components/`, `onboarding/` | T2 (onboarding schema) |
| T4 | api `reservations/` `staff/` + migrations, web `(student)/` | — |

Lane A: T1 · Lane B: T2 → T3 · Lane C: T4. Conflict flags: T1 and T2 both touch api `auth/`;
T2 and T4 both touch api `staff/` and the migration journal. Numbers follow build order: 0061 (T4) then 0062
(T2); drizzle skips a migration older than the last applied one. Simplest: one branch, sequential T4 → T1 → T2 → T3 (about 1.5h with CC).

## Implementation Tasks

- [ ] **T1 (P1, human ~3h / CC ~20min)** — auth — staff sign-in at `/staff`, portal-aware callback errors
  - Surfaced by: Architecture D2, outside voice D8
  - Verify: `pnpm --filter @campushomes/web test sign-in`, api `auth.controller` spec
- [ ] **T2 (P1, human ~5h / CC ~35min)** — profile — required `contact_phone` with backfill, loop guard, `next`
  - Surfaced by: Architecture D3/D4, outside voice D9/D11
  - Verify: `me-onboarding.spec.ts`, session tests, migrate on docker test DB
- [ ] **T3 (P2, human ~3h / CC ~20min)** — web — PhoneField fix + onboarding hints
  - Surfaced by: Code quality D6, outside voice D10
  - Verify: `phone-field.test.tsx`, `onboarding-form.test.tsx`
- [ ] **T4 (P2, human ~1h / CC ~10min)** — reservations — 24h hold single source
  - Surfaced by: Code quality D5, outside voice D11
  - Verify: reservations-flow spec, migration on docker test DB
- [ ] **T5 (P1, Festo)** — prod Logto password at sign-up
  - Verify: create a test account on prod, password prompt shown

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 16 issues, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **CROSS-MODEL:** Codex unavailable (model not supported on ChatGPT account); Claude subagent outside voice ran. 3 tensions (D8, D9, D10) all resolved in favour of the outside voice; 3 gap fixes accepted (D11).
- **VERDICT:** ENG CLEARED — ready to implement.

NO UNRESOLVED DECISIONS
