# TODOS

Follow-up work tracker. Each item has a status, an owner and a detail section
below. Tick an item and move it to **Done** when it ships.

_Last updated: 2026-10-15._

## Status board

| # | Item | Owner | Status |
|---|---|---|---|
| 1 | [WhatsApp OTP (official Cloud API)](#1-whatsapp-otp-official-cloud-api) | Festo → Claude | ⏸ Paused at Step 0 (URSB/URA paperwork) |
| 3 | [Prod Logto: password at sign-up](#3-prod-logto-password-at-sign-up) | Festo | ☐ Open |
| 4 | [Post-deploy checks (production)](#4-post-deploy-checks-production) | Festo | ☐ Open |
| 5 | [Kiwanda: resubmit 4 pending inspections](#5-kiwanda-resubmit-4-pending-inspections) | Kiwanda / Festo | ☐ Open |
| 6 | [Retire the Vercel project](#6-retire-the-vercel-project) | Festo | ☐ Open |
| 7 | [Fix flaky `IssueStrikeForm` test](#7-fix-flaky-issuestrikeform-test) | — | 👀 Couldn't reproduce (0/51); watching |
| 8 | [Verify the contact phone by SMS](#8-verify-the-contact-phone-by-sms) | — | 💤 Later |
| 9 | [Phase 1: mobile menu + search layout](#9-phase-1-mobile-menu--search-layout) | Claude | 👀 On staging (#162), production pending |
| 10 | [Phase 2: search correctness](#10-phase-2-search-correctness) | Claude | 👀 On staging (#164), production pending |
| 11 | [Phase 3: reservation journey](#11-phase-3-reservation-journey) | Claude | 👀 On staging (#166), production pending; R03b needs a staging check (Festo) |
| 12 | [Phase 4: information before reserving](#12-phase-4-information-before-reserving) | Claude | 👀 On staging (#170), production pending |
| 13 | [Phase 5: data-quality guards + production data fixes](#13-phase-5-data-quality-guards--production-data-fixes) | Claude / Festo | 👀 Code on staging (#174); data fixes wait on Festo |
| 14 | [Phase 6: help and support](#14-phase-6-help-and-support) | Claude | 🚧 In progress |
| 15 | [Cloudflare: turn off Email Address Obfuscation](#15-cloudflare-turn-off-email-address-obfuscation) | Festo | ☐ Open |
| 16 | [Small UI polish from the 2026-10-14 inspection](#16-small-ui-polish-from-the-2026-10-14-inspection) | — | 💤 Later |
| 17 | [Deferred backlog items](#17-deferred-backlog-items) | — | 💤 Later |

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

## 3. Prod Logto: password at sign-up

- **What:** Production Logto → Sign-in experience → sign-up → turn on
  "Create your password". Staging already has it on.
- **Why:** sign-up on production is code-only today, so new users have no
  password.

## 4. Post-deploy checks (production)

Production runs `90303ac` (deployed 2026-10-12, schema 62/62), which
includes PRs #152 and #154. Check on production:

- [ ] An account without a contact phone is sent to onboarding once, then
      lands on the page it was heading to. **All 16 current production
      accounts have no phone on record, so everyone, staff included, will
      see this once.**
- [ ] A new reservation shows a ~24h countdown; Admin → Settings shows 24
      (production has no saved setting, so the built-in 24h default applies)
- [ ] Staff sign-in from `/staff` works, with two-step verification
- [ ] Signed in as a landlord, opening `/staff` still shows the staff buttons
- [ ] Ops inspection: pasting `0°19′45″N 32°33′12″E` shows
      "Using 0.329167, 32.553333"; typing `near the market` shows the
      "isn't a supported coordinates format" message with samples and
      disables Submit

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

## 9. Phase 1: mobile menu + search layout

Phases 9–14 come from the 2026-10-14 live inspection of campushomes.co.ug, a
second inspection report and Festo's handwritten backlog (R01–R19). Full plan:
[`docs/superpowers/plans/2026-10-14-student-journey-fixes.md`](docs/superpowers/plans/2026-10-14-student-journey-fixes.md). One PR to `development` per phase.

- **Shipped:** PR #162, on staging since 2026-10-14 (`37bbde2`).

- **Ships with:** PR #160, the peach orange accent (`#fcb177`) and a single
  search icon in the hero search.
- **R03a, phone layout:** on phones the header hides Find a room, How it works,
  Support and For landlords with no menu. Add a hamburger menu
  (`components/shell/site-header.tsx`).
  - *Pass:* at 375px the menu opens, lists all 4 links, closes on Escape, on
    tapping outside and after choosing a link.
- **Search filters:** the hostel-name search gets its own row; price and the
  three selects sit in a grid (`app/(public)/search/search-client.tsx`).
  - *Pass:* the placeholder isn't cut off and no select sits alone on a row.
- **Card names:** hostel names wrap to 2 lines instead of being cut
  ("Kasubi Horizon Stud…").

## 10. Phase 2: search correctness

- **Shipped:** PR #164, on staging since 2026-10-14 (`37bbde2`).
- **R01, search reliability:** a failed request shows the error state with
  Retry, never a false "0 found".
- **R15, Clear filters:** a button inside the filter area that resets every
  filter (search text stays).
  - *Pass:* set several filters, clear them, and filters, count and results
    all reset together.
- **Filtered empty state:** zero results caused by filters says "No hostels
  match your filters" and offers Clear filters, not "No verified places in this
  area yet".
- **Room vs bed count:** cards say "108 rooms" for Kasubi Horizon, which has 38
  rooms and 108 free beds (the API counts beds as `unit_count`). Show
  "38 rooms · 108 beds free".
- **R14, bathroom filter wording:** "Self-contained" / "Not self-contained",
  same data (`units.self_contained`).
- **Addresses:** trim trailing commas such as "Makerere Hill," in one display
  helper.

## 11. Phase 3: reservation journey

- **Shipped:** PR #166, on staging since 2026-10-14 (`37bbde2`). Still open:
  R03b below.
- **R02, repeated sign-ins:** "Sign in to reserve" and "Sign in to ask a
  question" link to plain `/sign-in`, so after signing in the student lands on
  the homepage instead of the room. Add `next=/listings/<id>`. Sessions already
  last 7 days.
  - *Pass:* signed out, open a listing, Sign in to reserve, sign in, and you're
    back on that listing.
- **R17 + Festo's request, confirmation popup:** after reserving, show a dialog:
  "Room reserved for you", hostel, room type, bed, and "held for 24 hours, until
  <time>", taken from the API's `reservedExpiresAt`. Then a "View my
  reservations" button opens the list with that reservation highlighted.
- **R04 / R10, My reservations:**
  - active reservations come first
  - live countdown
  - reference and reserved date
  - "Just reserved" highlight
  - Cancel asks for confirmation and shows errors
- **R13, reservation limit:** 3 active per student is already enforced by the
  API. Say so near the Reserve buttons.
  - *Pass:* the 4th attempt shows the explanation.
- **R03b, phone-number box:** reproduce onboarding and profile phone saving on
  staging. Fix only if it still fails (#152 may have fixed it).
- **Follow-up, PR #173 (on staging since 2026-10-15, `1fcc572`):** an overdue
  hold is now expired by a per-minute sweep (`reservation_expiry_sweep`) and
  again before every new reserve, so a lost BullMQ job can no longer keep a
  bed blocked. Rooms show "N reserved · 24h hold".

## 12. Phase 4: information before reserving

- **Shipped:** PR #170, on staging since 2026-10-15 (`1fcc572`).
- **R12, house rules:** `properties.house_rules` exists (admin-edited) but is
  never shown publicly. Show it on the listing page.
- **R06 / R09, amenities and gender policy at the reserve step:** summary next
  to Reserve. Unknown values read "Not provided".
- **R11, viewings:** give the existing "Request a viewing" option its own
  button. A structured visiting-hours field needs a migration; see item 17.

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

## 14. Phase 6: help and support

- **R07, chat box:** the student–landlord chat composer grows with the text
  (`components/chat/chat-inbox.tsx`).
- **R16, FAQ:** add answers on the 24h hold and expiry, the 3-room limit,
  payments (offline, agreed with the landlord), viewings, cancellations and
  support.
- **R18, support form:** the student support desk can attach one of the
  student's own reservations to an inquiry.

## 15. Cloudflare: turn off Email Address Obfuscation

- **What:** Cloudflare dashboard → Security → Settings → turn off
  **Email Address Obfuscation** for `campushomes.co.ug`.
- **Why:** it rewrites the footer email in the HTML, so React hits hydration
  error #418 and re-renders every page on every visit (slower). Cloudflare's
  decode script is also blocked by our CSP. No code change needed.
- *Pass:* no `__cf_email__` in the page source and no #418 in the console.

## 16. Small UI polish from the 2026-10-14 inspection

- **Map worker:** MapLibre's worker URL 404s, so it falls back. The map works
  but loads slowly and logs console errors (`components/map/listings-map.tsx`).
- **Listing navigation:** clicking a listing card shows the old page for about
  3s with no loading indicator.
- **Cookie notice:** on phones it covers about a quarter of the screen.

## 17. Deferred backlog items

- **R05, payment options:** real-money payments are product Phase 2 (decided
  2026-07-30). Payment is offline with the landlord until then.
- **R08, hostel location:** "NOT NOW" per Festo's notes.
- **R19, floating chatbot / help button:** after Phase 6 (FAQ + support).
  Decide scripted widget vs AI first.
- **Visiting-hours field (R11 follow-up):** needs a migration plus admin and
  landlord forms.

---

## Done

| Date | Item | PRs | Live on |
|---|---|---|---|
| 2026-10-13 | Fixed 10 failing API tests (`property-kyc-gate`, `ops-republish`). Cause: `loadEnv()` (via `assertOwnedStorageKeys`) needs `DATABASE_URL`, which a bare local run doesn't set; specs now fall back to the test DB URL. kyc-gate's `OpsService` now gets a real `NotificationsService`, ending the `notify is not a function` log. API suite 835/835 | [#157](https://github.com/Festo-Wampamba/Campus-Homes/pull/157), [#158](https://github.com/Festo-Wampamba/Campus-Homes/pull/158) | `main` (`2c86a7c`); tests only, no production deploy needed |
| 2026-10-12 | Staff sign-in moved to `/staff`; public `/sign-in` has "Create an account" | [#152](https://github.com/Festo-Wampamba/Campus-Homes/pull/152), [#153](https://github.com/Festo-Wampamba/Campus-Homes/pull/153) | Staging + production (`90303ac`) |
| 2026-10-12 | Required contact phone at onboarding (`users.contact_phone`, migration 0062) | #152, #153 | Staging + production |
| 2026-10-12 | Phone box saves while typing (Enter no longer submits an empty number); onboarding hints | #152, #153 | Staging + production |
| 2026-10-12 | Reservation hold 72h → 24h (migration 0061) | #152, #153 | Staging + production |
| 2026-10-12 | `/staff` reachable while signed in as a landlord/student (Codex review) | #152 | Staging + production |
| 2026-10-12 | Ops inspection: coordinates box accepts DMS + decimals, shows accepted formats, blocks invalid text; real sync error on screen; no stale "still waiting" | [#154](https://github.com/Festo-Wampamba/Campus-Homes/pull/154), [#155](https://github.com/Festo-Wampamba/Campus-Homes/pull/155) | Staging + production (`90303ac`) |
| 2026-10-12 | WhatsApp OTP setup guide written (`docs/runbooks/whatsapp-otp-setup.md`) | #152 | — |
| 2026-10-12 | Production deploy: `cb14783` → `90303ac`, schema 59 → 62 | workflow run `38304260663` | Production |
