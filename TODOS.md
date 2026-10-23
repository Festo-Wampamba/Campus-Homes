# TODOS

Follow-up work tracker. Each item has a status, an owner and a detail section
below. Tick an item and move it to **Done** when it ships.

_Last updated: 2026-10-23._

**Where things stand:** production, staging and `main` run `a42b74a`
(schema 70/70). GitHub branches are only `main`, `development` and
`preview`. Flow: feature branch → PR to `development` →
release PR to `main` (deploys staging) → production by hand with
`gh workflow run CI --ref main`.

## Status board

| # | Item | Owner | Status |
|---|---|---|---|
| 1 | [WhatsApp OTP (official Cloud API)](#1-whatsapp-otp-official-cloud-api) | Festo → Claude | ⏸ Paused at Step 0 (URSB/URA paperwork); email used meanwhile |
| 5 | [Kiwanda: resubmit 4 pending inspections](#5-kiwanda-resubmit-4-pending-inspections) | Kiwanda / Festo | ☐ Open |
| 7 | [Fix flaky `IssueStrikeForm` test](#7-fix-flaky-issuestrikeform-test) | — | 👀 Couldn't reproduce (0/51); watching |
| 8 | [Verify the contact phone by SMS](#8-verify-the-contact-phone-by-sms) | — | 💤 Later |
| 13 | [Production data fixes](#13-phase-5-data-quality-guards--production-data-fixes) | Festo → Claude | ☐ Open (needs correct price, furnishing, title) |
| 17 | [Deferred backlog items](#17-deferred-backlog-items) | — | 💤 Later |
| 24 | [Staging tests: chat + booking tracker](#24-staging-tests-chat--booking-tracker) | Festo | ☐ Open (item 20 fixed; room-change part passed) |
| 25 | [Code backlog](#25-code-backlog) | Claude | 💤 Later |
| 26 | [Production checks for the 2026-10-18 release](#26-production-checks-for-the-2026-10-18-release) | Festo | ☐ Open (server-side checks passed) |
| 27 | [Off-site SEO](#27-off-site-seo) | Festo | ☐ Open (sitemaps already submitted) |
| 28 | [Decide: unique room codes per property?](#28-decide-unique-room-codes-per-property) | Festo | ☐ Open |
| 29 | [Google Routes: billing + API key](#29-google-routes-billing--api-key) | Festo → Claude | ⏸ Paused (card rejected by Google) |
| 30 | [Old database dumps on the VPS](#30-old-database-dumps-on-the-vps) | Festo → Claude | ☐ Open (env copy shredded; dumps left) |
| 31 | [Safe Docker cleanup to replace Dokploy's](#31-safe-docker-cleanup-to-replace-dokploys) | Claude | ☐ Open (needs OK) |

Status key: ☐ open · 🔜 queued · 🚧 in progress · 👀 watching · ⏸ paused · 💤 later · ✅ done

---

## 1. WhatsApp OTP (official Cloud API)

- **What:** Send sign-in, sign-up and forgot-password codes over WhatsApp,
  plus the walk-in student invite ("your landlord booked you a room").
- **Why it matters now (2026-10-23):** SMS through Africa's Talking doesn't
  deliver on staging (sandbox), so the walk-in SMS invite never arrived.
  Until WhatsApp is live, use **email**: the walk-in form takes an optional
  email (sign-in + receipts go there), and Logto's sign-in experience should
  offer email codes and "Forgot password" on staging and production (Logto
  console → Sign-in experience; Festo).
- **Guide:** [`docs/runbooks/whatsapp-otp-setup.md`](docs/runbooks/whatsapp-otp-setup.md).
  It has its own step checklist (Steps 0–7).
- **Where we stopped:** Step 0, getting the URSB and URA documents ready.
- **Resume:** finish the paperwork, then share the guide with Claude and say
  "resume WhatsApp setup".
- **Code:** already built (`apps/api/src/modules/auth/otp-delivery.ts`).
  Only Meta setup and server configuration remain.
- **Decided:** official Meta Cloud API only, never Evolution API or Baileys
  (2026-10-12). They break Meta's terms and risk a number ban that would
  block every phone sign-in.

## 5. Kiwanda: resubmit 4 pending inspections

- **What:** on production, reopen Kikoni Rise, Naguru, Kagugube Commons and
  Mulago View (assigned 2026-10-12), enter the coordinates, press
  "Retry sync now".
- **Since 2026-10-17:** each visit needs at least one photo before it can
  sync. If a retry shows "Add at least one photo", add a photo in the form
  and retry.
- **Why:** they were captured before the coordinates fix; nothing reached
  the server. Kasubi Horizon did sync.
- **If it still fails:** the reason now shows under the Retry button.
  Screenshot it for Claude.

## 7. Fix flaky `IssueStrikeForm` test

- **What:** `IssueStrikeForm › links to a fresh staff sign-in when the API
  demands one` (`apps/web/src/app/(ops)/ops/strikes/`) failed once in about
  four runs on 2026-10-12, then passed on rerun.
- **Rule:** fix it or delete it; never retry until it passes.
- **2026-10-13 investigation:** 0 failures in 51 runs (30 runs of the file
  alone, 6 full web suites of 267 tests, 15 runs of the original
  `src/lib/ops` + `(ops)` combination). The component and test have no race:
  the rejected `api()` promise settles in the same `act()` every time. The
  2026-10-12 failure was printed through a `grep` filter, so its error
  message was lost. Best guess: the 5s Jest timeout while the machine was
  busy, but that's unconfirmed. Kept the test; it covers the fresh-sign-in
  link for step-up.
- **If it fails again:** save the full Jest output (no `grep`) and the
  machine load, then fix the cause or delete the test.

## 8. Verify the contact phone by SMS

- **What:** Optional "Verify this number" step (6-digit SMS code) for `users.contact_phone`.
- **Why:** Onboarding stores the number unverified, so a student can enter a wrong number and
  landlords or Ops can't reach them.
- **Pros:** Proven numbers. A verified `contact_phone` could later be promoted to the sign-in phone.
- **Cons:** SMS cost per verification; depends on Africa's Talking being live and funded on prod.
  Could instead reuse WhatsApp (item 1) once that is live.
- **Context:** `contact_phone` (plan `docs/superpowers/plans/2026-10-11-sign-in-staff-phone-hold.md`,
  T2) is deliberately not unique and not used for identity matching: `users.phone` is, so an
  unverified number there would let one user lock another out. Copy the email-change flow in
  `apps/api/src/modules/profile/me.controller.ts` (`POST /me/email/code` then `PATCH /me/email`).
- **Depends on:** contact phone shipped (done); Africa's Talking production account live.

## 13. Phase 5: data-quality guards + production data fixes

- **Shipped (code):** PR #174, on staging since 2026-10-15 (`1fcc572`). The
  production data fixes below are still open.
- **Price floor UGX 50,000** (decided 2026-10-14) in the shared Ops-publish,
  room-management and admin price schemas.
  - *Why:* Kasubi Horizon's 6 single rooms are live at **UGX 2** per semester
    (with a UGX 1,000,000 deposit); validation only checked `> 0`.
- **Furnishing:** Fully furnished / Partly furnished / Unfurnished become
  one-choice. Kasubi Horizon currently shows both "Unfurnished" and
  "Fully furnished".
- **Production data (Festo approves, done through Ops/admin):**
  - Kasubi Horizon single-room price (**Festo: correct price needed**)
  - its furnishing amenities
  - the listing titled "Makerere Hill, Kampala" (an address, not a name)

## 17. Deferred backlog items

- **R05, payment options:** real-money payments are product Phase 2 (decided
  2026-07-30). Payment is offline with the landlord until then.
- **R08, hostel location:** "NOT NOW" per Festo's notes.
- **R19, floating chatbot / help button:** Phase 6 is on staging, so this
  is unblocked. Decide scripted widget vs AI first.
- **Visiting-hours field (R11 follow-up):** needs a migration plus admin and
  landlord forms.

## 24. Staging tests: chat + booking tracker

Two browsers on staging: normal window = landlord, Incognito = student.

- [ ] **Chat:**
  - [ ] ticks go clock → 1 grey → 2 grey → blue
  - [ ] Online / typing… / "last seen today at …"
  - [ ] Offline (DevTools Network → Offline) shows Not sent → Retry
- [ ] **Booking tracker:**
  - [ ] Reserved → Request booking → landlord Book → Confirm move-in, each
        step dated
  - [ ] My bookings on the dashboard shows the right status
  - [ ] a cancelled reservation ends in a red step
- [ ] Older staging checks still open: iPhone Reserve popup; other students'
  holds hidden on room rows.

## 25. Code backlog

- **Chat Phase 2:** Soketi (instant delivery), typing over client events.
  Later: privacy toggles, SMS/email nudge for unread messages.
- **AI support:** send only the relevant manual sections. Each question uses
  ~2,200 tokens; Groq free tier allows ~8,000/min.
- **Lint noise:** 1,125 warnings from the gitignored `public/maplibre/*.mjs`.
  Adding them to the ESLint ignores needs Festo's OK (config-protection hook).
- **Local `drizzle-kit check`** fails with `EISDIR` on this machine. CI doesn't
  run it; find the cause before trusting it again.
- **Full per-property page with tabs** (Overview, Rooms, Reservations,
  Bookings): deferred 2026-10-18. Manage Rooms stays one page with a
  property picker plus per-property links.

## 26. Production checks for the 2026-10-18 release

Claude checked on 2026-10-18: `/health` 200, commit `a42b74a`, schema 70/70
on production and staging; 15 chat threads for 15 student–landlord pairs;
no API errors in the last 2 hours. These need real accounts:

- [ ] Calendar: create an event ~20 minutes ahead with "Email me reminders"
      on; the reminder email and the bell notification arrive. (Production
      has no calendar events yet, so the job hasn't sent anything.)
- [ ] Messages shows each person only once.
- [ ] Landlord: Confirm booking on a booking request; the student is notified.
- [ ] Excel upload on a real property (template download → fill → upload).
- [ ] Phone/iPhone: calendar (dots, day agenda) and the Manage Rooms dialogs
      scroll; property form and invite-staff dialogs on iOS.

## 27. Off-site SEO

Sitemaps are already submitted to Google and Bing (2026-10-17). Left:

- [ ] Google Search Console: request indexing of the homepage.
- [ ] Create a Google Business Profile.
- [ ] Social profiles; send Claude the links for JSON-LD `sameAs`.
- [ ] Backlinks from Makerere student pages and Ugandan directories.

## 28. Decide: unique room codes per property?

- **Now:** a room code must be unique **per building** only, checked in app
  code (`room-management.service.ts`, "already exists in this building");
  there is no DB constraint. Staging shows "Double 1" and "Quad 1" more
  than once in one property, across room types/buildings.
- **Decide:** keep per-building, or require per-property. Per-property
  means a migration (unique index) after cleaning up existing duplicates,
  plus the same check in the spreadsheet import.

## 29. Google Routes: billing + API key

- **What:** turn on road distances (hostel → campus). The code is live on
  staging (#249), and the daily cap and owner alert are in #253. Without a key,
  hostels show no distance (never a guess).
- **Blocked on:** Google Cloud billing. The prepaid card was rejected at the
  free-trial sign-up (2026-10-23). Try another card (Visa/Mastercard debit or
  credit that allows international online payments).
- **Steps once billing works:**
  1. Project `CampusHomes` → enable **Routes API**.
  2. Routes API → Quotas → set the **per day** request quota to **300**
     (≤ the free monthly allowance even if hit every day). If only
     per-minute quotas exist, tell Claude: add an in-app daily cap instead.
  3. Billing → Budgets & alerts → $1 budget with email alerts.
  4. Credentials → API key, restricted to IP `169.58.85.25` and the Routes
     API only.
  5. Dokploy → staging API → **Environment** → `GOOGLE_ROUTES_API_KEY` →
     Save → Deploy. Tell Claude "key added". Claude checks Samuel Courts
     shows about 10 km.
- **Fallback if no card works:** OpenRouteService (free key, no card),
  which needs a small adapter change.

## 30. Old database dumps on the VPS

- The plaintext env copies (`campushomes-*-env-source.txt`, 2026-09-01) were
  shredded on 2026-10-19.
- **Left:** `pre-wipe-backup-20260908140656.dump` and
  `prod-backup-20260921-193634.dump` in `/home/festo/` are full database
  copies, readable by other users on the box (modes 644/664). Decide: move
  them to the private backup bucket, or delete them. At minimum `chmod 600`.

## 31. Safe Docker cleanup to replace Dokploy's

- Dokploy's "Daily Docker Cleanup" is **off** since 2026-10-19 (see
  CLAUDE.md, 2026-10-19). Disk use will grow from old images and build cache.
- **Plan:** host cron that never removes tags: `docker image prune --force`
  (untagged only), `docker container prune --force`,
  `docker builder prune --force --filter until=72h`.
- Optional: a per-environment build `ARG`/`LABEL` in `apps/api/Dockerfile`
  so production and staging can never share an image ID.

---

## Done

| Date | Item | PRs | Live on |
|---|---|---|---|
| 2026-10-19 | Secret rotation (was item 19; Festo confirmed no other keys were pasted in 2026-08): Redis staging + production and staging Postgres `campushomes`/`campushomes_app`, live and in Dokploy's stored config (via Dokploy API, read-back verified). Dokploy Daily Docker Cleanup turned off and Dokploy restarted. Production API outage 04:30–04:50 UTC (image tag missing after the nightly prune); recovered by retagging the same-commit staging image | — | Staging + production |
| 2026-10-19 | Vercel project `campus-homes-web` deleted by Festo (Vercel API confirms no project linked to the repo). Web hosting is Dokploy only; the GitHub "Preview" environment was Vercel's and is now unused. Optional: remove the Vercel GitHub app's repo access (GitHub → Settings → Applications) and the stale "Preview" environment (was item 6) | — | — |
| 2026-10-18 | iOS dialog sizing: property form and invite-staff dialogs use `min-h-0 flex-auto` like the room dialogs; no `flex-1` dialog forms remain. Security review of `a5394fd` (missed by a 429): no issue | this PR | `development` |
| 2026-10-18 | Calendar: colours per type, edit dialog, Today, "Starts in …", phone agenda, local date keys (was a day late). Email + in-app reminders at 1d/10h/5h/30/15/5/1 min (BullMQ `calendar_reminders`, migration 0070). Scrollable Manage Rooms dialogs; am/pm chat times | [#229](https://github.com/Festo-Wampamba/Campus-Homes/pull/229), [#230](https://github.com/Festo-Wampamba/Campus-Homes/pull/230) | Staging + production (`a42b74a`, schema 70) |
| 2026-10-18 | Rooms from Excel/CSV (template, `exceljs` parse, ≤500 rows, no tenant data) + Manage rooms links on every property | [#227](https://github.com/Festo-Wampamba/Campus-Homes/pull/227), [#228](https://github.com/Festo-Wampamba/Campus-Homes/pull/228) | Staging + production |
| 2026-10-18 | Booking requests on landlord Reservations + Confirm booking; one chat per student–landlord pair (migration 0069, prod 15/15); reserve error popup | [#225](https://github.com/Festo-Wampamba/Campus-Homes/pull/225), [#226](https://github.com/Festo-Wampamba/Campus-Homes/pull/226) | Staging + production |
| 2026-10-18 | Super Admin delete needs typed email; Super Admin never invitable; user delete removes the Logto identity; username synced to Logto; staff 2-step = authenticator or passkey (`apply-staff-mfa.cjs` run on staging + production); signed-out favourites prompt; `Hostel` JSON-LD + misspelled names | [#224](https://github.com/Festo-Wampamba/Campus-Homes/pull/224), [#226](https://github.com/Festo-Wampamba/Campus-Homes/pull/226) | Staging + production |
| 2026-10-18 | Production deploy → `a42b74a`, schema 70/70 (pre-release `pg_dump`, 823 objects, verified). 59 merged remote branches deleted | — | Production |
| 2026-10-17 | Feedback slices A–G: plain verification code + full invitation email; staff MFA mandatory via Logto organization (students never prompted); Bedsitter retired; page open clears its badge; stat cards filter rooms; separate Reservations and Bookings; Manage Rooms auto-refresh while under review | [#215](https://github.com/Festo-Wampamba/Campus-Homes/pull/215)–[#221](https://github.com/Festo-Wampamba/Campus-Homes/pull/221), [#222](https://github.com/Festo-Wampamba/Campus-Homes/pull/222), [#223](https://github.com/Festo-Wampamba/Campus-Homes/pull/223) | Staging + production |
| 2026-10-17 | User details synced to Logto (contact phone in `customData`, never `primaryPhone`) + backfill script; gender required at registration for students and landlords | [#213](https://github.com/Festo-Wampamba/Campus-Homes/pull/213), [#214](https://github.com/Festo-Wampamba/Campus-Homes/pull/214) | Staging + production |
| 2026-10-17 | Inspection submit requires at least one photo: `syncVisitSchema` rejects 0 photos (API 400) and the form keeps Submit disabled with "Add at least one photo before submitting."; queued offline photos count. Codex follow-up: resending a failed draft uses a new idempotency key so an added photo isn't dropped by a replay. Festo confirmed on staging (was item 23) | [#209](https://github.com/Festo-Wampamba/Campus-Homes/pull/209), [#211](https://github.com/Festo-Wampamba/Campus-Homes/pull/211), [#210](https://github.com/Festo-Wampamba/Campus-Homes/pull/210) | Staging + production (`dea4275`) |
| 2026-10-17 | Student registration link (`/agreement/<propertyId>`) in the landlord property dialog is a link that opens in a new tab; Copy link and Open unchanged. Festo confirmed on staging (was item 22) | [#207](https://github.com/Festo-Wampamba/Campus-Homes/pull/207), [#208](https://github.com/Festo-Wampamba/Campus-Homes/pull/208) | Staging + production (`6141b47`) |
| 2026-10-17 | Ugandan phone numbers must be exactly 10 digits (9 after `+256`) in the shared `africanPhone` schema; other African countries keep the loose rule. Onboarding shows the message in red under the phone field. Festo confirmed on staging (was item 21) | [#205](https://github.com/Festo-Wampamba/Campus-Homes/pull/205), [#206](https://github.com/Festo-Wampamba/Campus-Homes/pull/206) | Staging + production (`0b3e604`) |
| 2026-10-17 | Room-change approve 500 (`permission denied for table units`): migration 0068 grants `units` label/capacity/room_category/building_name/floor_label to `app_user`, plus a `units_guard_room_details` trigger so only `operational_status` can change outside the approve path (also closes landlord/ops writes to `room_type_id`/`archived_at`). 4 RLS tests; Festo confirmed approve on staging (was item 20) | [#202](https://github.com/Festo-Wampamba/Campus-Homes/pull/202), [#203](https://github.com/Festo-Wampamba/Campus-Homes/pull/203) | Staging + production (`c46f9df`, schema 68) |
| 2026-10-17 | Admin → Settings save creates missing rows and shows the real API error; migration 0067 restores `support_contact` (WhatsApp +256768561023) on production, where the row was missing | [#199](https://github.com/Festo-Wampamba/Campus-Homes/pull/199), [#200](https://github.com/Festo-Wampamba/Campus-Homes/pull/200) | Staging + production (`93941a1`, schema 67) |
| 2026-10-17 | Production deploy `3847c51` → `93941a1`, schema 66 → 67 | workflow run `38968508854` | Production |
| 2026-10-17 | Festo, dashboards: old Zoho DKIM record deleted (Zoho verified); Cloudflare Email Address Obfuscation off + cache purged (was item 15); sitemap submitted to Google (Success, 17 pages) and Bing (Success, 17 URLs); Logto MFA prompt set to one-time skippable on staging + production; production sign-up "Create your password" on (was item 3) | — | Production |
| 2026-10-16 | Chat: WhatsApp-style ticks, online / last seen, typing (migration 0066) | [#197](https://github.com/Festo-Wampamba/Campus-Homes/pull/197), [#198](https://github.com/Festo-Wampamba/Campus-Homes/pull/198) | Staging + production |
| 2026-10-16 | Booking tracker on My reservations + My bookings on the dashboard | [#195](https://github.com/Festo-Wampamba/Campus-Homes/pull/195), [#196](https://github.com/Festo-Wampamba/Campus-Homes/pull/196) | Staging + production |
| 2026-10-16 | Verification-code email, Student/Landlord sign in, two-button bathroom filter, sitemap fix, JSON-LD, `/llms.txt` | [#193](https://github.com/Festo-Wampamba/Campus-Homes/pull/193), [#194](https://github.com/Festo-Wampamba/Campus-Homes/pull/194) | Staging + production |
| 2026-10-15 | Support page (AI / Contact / User manual), Groq `openai/gpt-oss-20b`, plain-text replies (migration 0065) | #189–#192 | Staging + production |
| 2026-10-15 | Map worker 404, listing loading skeleton, compact cookie notice (was item 16); free-room counts + reserving-vs-booking FAQ | #185–#188 | Staging + production |
| 2026-10-15 | Phases 1–6 of the student-journey fixes + staging feedback fixes (were items 9–12, 14, 18); production post-deploy (was item 4) superseded by later deploys | #162–#183 | Staging + production |
| 2026-10-13 | Fixed 10 failing API tests (`property-kyc-gate`, `ops-republish`). Cause: `loadEnv()` (via `assertOwnedStorageKeys`) needs `DATABASE_URL`, which a bare local run doesn't set; specs now fall back to the test DB URL. kyc-gate's `OpsService` now gets a real `NotificationsService`, ending the `notify is not a function` log. API suite 835/835 | [#157](https://github.com/Festo-Wampamba/Campus-Homes/pull/157), [#158](https://github.com/Festo-Wampamba/Campus-Homes/pull/158) | `main` (`2c86a7c`); tests only, no production deploy needed |
| 2026-10-12 | Staff sign-in moved to `/staff`; public `/sign-in` has "Create an account" | [#152](https://github.com/Festo-Wampamba/Campus-Homes/pull/152), [#153](https://github.com/Festo-Wampamba/Campus-Homes/pull/153) | Staging + production (`90303ac`) |
| 2026-10-12 | Required contact phone at onboarding (`users.contact_phone`, migration 0062) | #152, #153 | Staging + production |
| 2026-10-12 | Phone box saves while typing (Enter no longer submits an empty number); onboarding hints | #152, #153 | Staging + production |
| 2026-10-12 | Reservation hold 72h → 24h (migration 0061) | #152, #153 | Staging + production |
| 2026-10-12 | `/staff` reachable while signed in as a landlord/student (Codex review) | #152 | Staging + production |
| 2026-10-12 | Ops inspection: coordinates box accepts DMS + decimals, shows accepted formats, blocks invalid text; real sync error on screen; no stale "still waiting" | [#154](https://github.com/Festo-Wampamba/Campus-Homes/pull/154), [#155](https://github.com/Festo-Wampamba/Campus-Homes/pull/155) | Staging + production (`90303ac`) |
| 2026-10-12 | WhatsApp OTP setup guide written (`docs/runbooks/whatsapp-otp-setup.md`) | #152 | — |
| 2026-10-12 | Production deploy: `cb14783` → `90303ac`, schema 59 → 62 | workflow run `38304260663` | Production |
