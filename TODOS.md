# TODOS

Follow-up work tracker. Each item has a status, an owner and a detail section
below. Tick an item and move it to **Done** when it ships.

_Last updated: 2026-10-17._

**Where things stand:** production, staging and `main` run `6141b47`
(schema 68/68). Flow: feature branch → PR to `development` →
release PR to `main` (deploys staging) → production by hand with
`gh workflow run CI --ref main`.

## Status board

| # | Item | Owner | Status |
|---|---|---|---|
| 1 | [WhatsApp OTP (official Cloud API)](#1-whatsapp-otp-official-cloud-api) | Festo → Claude | ⏸ Paused at Step 0 (URSB/URA paperwork) |
| 5 | [Kiwanda: resubmit 4 pending inspections](#5-kiwanda-resubmit-4-pending-inspections) | Kiwanda / Festo | ☐ Open |
| 6 | [Retire the Vercel project](#6-retire-the-vercel-project) | Festo | ☐ Open |
| 7 | [Fix flaky `IssueStrikeForm` test](#7-fix-flaky-issuestrikeform-test) | — | 👀 Couldn't reproduce (0/51); watching |
| 8 | [Verify the contact phone by SMS](#8-verify-the-contact-phone-by-sms) | — | 💤 Later |
| 13 | [Production data fixes](#13-phase-5-data-quality-guards--production-data-fixes) | Festo → Claude | ☐ Open (needs correct price, furnishing, title) |
| 17 | [Deferred backlog items](#17-deferred-backlog-items) | — | 💤 Later |
| 19 | [Rotate exposed staging secrets](#19-rotate-exposed-staging-secrets) | Festo + Claude | ☐ Open |
| 23 | [Inspection submit requires at least one photo](#23-inspection-submit-requires-at-least-one-photo) | Claude | 🔜 Queued |
| 24 | [Staging tests: chat + booking tracker](#24-staging-tests-chat--booking-tracker) | Festo | ☐ Open (item 20 fixed; room-change part passed) |
| 25 | [Code backlog](#25-code-backlog) | Claude | 💤 Later |

Status key: ☐ open · 🔜 queued · 🚧 in progress · 👀 watching · ⏸ paused · 💤 later · ✅ done

---

## 1. WhatsApp OTP (official Cloud API)

- **What:** Send sign-in, sign-up and forgot-password codes over WhatsApp.
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
- **Why:** they were captured before the coordinates fix; nothing reached
  the server. Kasubi Horizon did sync.
- **If it still fails:** the reason now shows under the Retry button.
  Screenshot it for Claude.

## 6. Retire the Vercel project

- **What:** delete or disconnect the `campus-homes-web` Vercel project.
- **Why:** you chose Dokploy for web hosting (2026-08-31), but Vercel still
  builds a preview on every PR (seen on PRs #152–#155).
- **Before:** confirm Dokploy's web service is current at the real domain.

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

## 19. Rotate exposed staging secrets

- **What:** rotate the staging passwords/keys that were pasted in chat
  during the 2026-08 infra rescue.
- **When:** before any real data goes on the shared staging/production
  Postgres, Redis or Logto.

## 23. Inspection submit requires at least one photo

- **What:** the Ops visit inspection can be submitted without photos, so
  inspectors forget them. Block Submit until at least one photo is attached.
  Show the reason next to the button, and enforce it in the API's visit sync
  too, not only in the form.
- **Mind:** the offline sync path. A visit captured offline must keep its
  photos queued and still pass the check when it syncs.
- *Pass:* Submit is disabled with "Add at least one photo" until a photo is
  added; an API call without photos is rejected with a 400.

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

---

## Done

| Date | Item | PRs | Live on |
|---|---|---|---|
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
