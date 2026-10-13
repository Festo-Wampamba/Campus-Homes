# TODOS

Follow-up work tracker. Each item has a status, an owner and a detail section
below. Tick an item and move it to **Done** when it ships.

_Last updated: 2026-10-13._

## Status board

| # | Item | Owner | Status |
|---|---|---|---|
| 1 | [WhatsApp OTP (official Cloud API)](#1-whatsapp-otp-official-cloud-api) | Festo → Claude | ⏸ Paused at Step 0 (URSB/URA paperwork) |
| 3 | [Prod Logto: password at sign-up](#3-prod-logto-password-at-sign-up) | Festo | ☐ Open |
| 4 | [Post-deploy checks (production)](#4-post-deploy-checks-production) | Festo | ☐ Open |
| 5 | [Kiwanda: resubmit 4 pending inspections](#5-kiwanda-resubmit-4-pending-inspections) | Kiwanda / Festo | ☐ Open |
| 6 | [Retire the Vercel project](#6-retire-the-vercel-project) | Festo | ☐ Open |
| 7 | [Fix flaky `IssueStrikeForm` test](#7-fix-flaky-issuestrikeform-test) | — | ☐ Open |
| 8 | [Verify the contact phone by SMS](#8-verify-the-contact-phone-by-sms) | — | 💤 Later |

Status key: ☐ open · 🔜 queued · 🚧 in progress · ⏸ paused · 💤 later · ✅ done

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
