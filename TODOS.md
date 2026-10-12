# TODOS

Follow-up work tracker. Each item has a status, an owner and a detail section
below. Tick an item and move it to **Done** when it ships.

## Status board

| # | Item | Owner | Status |
|---|---|---|---|
| 1 | [WhatsApp OTP (official Cloud API)](#1-whatsapp-otp-official-cloud-api) | Festo → Claude | ⏸ Paused at Step 0 (URSB/URA paperwork) |
| 2 | [Fix 10 failing API tests](#2-fix-10-failing-api-tests) | Claude (spawned task) | 🔜 Queued |
| 3 | [Prod Logto: password at sign-up](#3-prod-logto-password-at-sign-up) | Festo | ☐ Open |
| 4 | [Staging checks for PR #152](#4-staging-checks-for-pr-152) | Festo | ☐ Open, after merge |
| 5 | [Retire the Vercel project](#5-retire-the-vercel-project) | Festo | ☐ Open |
| 6 | [Verify the contact phone by SMS](#6-verify-the-contact-phone-by-sms) | — | 💤 Later |

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

## 2. Fix 10 failing API tests

- **What:** `test/services/property-kyc-gate.spec.ts` (7 tests) and
  `test/services/ops-republish.spec.ts` (3 tests) fail.
- **Known:** they fail the same way on `origin/development` without PR #152.
  One visible cause is `this.notifications.notify is not a function`, a test
  setup out of step with the services.
- **Tracking:** spawned as a separate session ("Fix 10 failing API tests").

## 3. Prod Logto: password at sign-up

- **What:** Production Logto → Sign-in experience → sign-up → turn on
  "Create your password". Staging already has it on.
- **Why:** sign-up on production is code-only today, so new users have no
  password.

## 4. Staging checks for PR #152

After PR #152 is merged and deployed to staging:

- [ ] An account without a contact phone is sent to onboarding once, then
      lands on the page it was heading to
- [ ] A new reservation shows a ~24h countdown; Admin → Settings shows 24
- [ ] Staff sign-in from `/staff` works, with two-step verification
- [ ] Signed in as a landlord, opening `/staff` still shows the staff buttons

## 5. Retire the Vercel project

- **What:** delete or disconnect the `campus-homes-web` Vercel project.
- **Why:** you chose Dokploy for web hosting (2026-08-31), but Vercel still
  builds a preview on every PR (seen on PR #152).
- **Before:** confirm Dokploy's web service is current at the real domain.

## 6. Verify the contact phone by SMS

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
- **Depends on:** T2 shipped; Africa's Talking production account live.

---

## Done

_(Move finished items here with the date and PR.)_
