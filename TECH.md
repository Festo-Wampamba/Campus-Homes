# CampusHomes — Third-Party Services

Tracks every external service account: status, where it lives, what's pending.
Update this file whenever a service is added, swapped, or its setup state changes.

## Status legend
- ✅ Account created, credentials in `.env`
- 🟡 Account created, not yet wired into `.env` / app
- ⏸️ On hold (decision pending)
- ❌ Not started

## Services

| Service | Purpose | Status | Notes |
|---|---|---|---|
| [Neon](https://console.neon.tech) | Postgres + PostGIS (DATABASE_URL) | ✅ | Project `silent-rain-62060648`, region AWS us-east-1. Connection string grabbed, not yet in `.env`. |
| [Upstash](https://console.upstash.com) | Redis (REDIS_URL, BullMQ) | ✅ | Global DB `campus-homes`, primary af-south-1 (Cape Town), Frankfurt read region, free tier. REDIS_URL uses the read-write `default` user. Eviction was turned OFF on 2026-07-31 so BullMQ queue/job keys cannot be discarded under memory pressure. |
| [Africa's Talking](https://account.africastalking.com) | SMS/OTP | ✅ | Sandbox app API key generated, AFRICASTALKING_API_KEY in `.env`. |
| [Cloudinary](https://cloudinary.com) | Image storage (CLOUDINARY_URL) | ✅ | Cloud name `bm2jqbac`, dedicated API key `campushomes` generated (not using Root key). CLOUDINARY_URL in `.env`. |
| [Sentry](https://sentry.io) | Error tracking (SENTRY_DSN) | ✅ | Org `Akolet Company Uganda`, Nest.js project, EU data region. SENTRY_DSN in `.env`. SDK wiring (`instrument.ts`, `SentryModule`) still needs to be added to the Nest app — see onboarding code snippet. |
| [Flutterwave](https://dashboard.flutterwave.com) | Payment processing | ⏸️ | **Phase 2 by product decision (2026-07-30).** The Phase 1 MVP has no real-money checkout. Uganda support and the adapter choice are already confirmed; resume with test-mode integration, provider verification, refunds, and reconciliation when Phase 2 begins. |

## Build order (per CLAUDE.md — nothing runs without DATABASE_URL)

1. ~~Neon → DATABASE_URL~~ done, migrations current through `0017`
2. ~~Upstash → REDIS_URL~~ done (BullMQ jobs + hold locks live on it)
3. ~~Cloudinary → CLOUDINARY_URL~~ done (`POST /api/v1/uploads/sign` issues signed params)
4. ~~Sentry → SENTRY_DSN~~ done (SDK wiring into Nest app still pending)
5. ~~Africa's Talking → AFRICASTALKING_API_KEY~~ done (OTP + notification SMS)
6. ~~BETTER_AUTH_SECRET~~ generated; ~~AuthModule~~ done
7. ~~Backend MVP modules~~ done — Listings/Ops/Reservations/Notifications/Chat/Jobs/Uploads;
   latest deployment verification passed 117 API tests and 16 web tests
8. ~~Phase 1 payment gate~~ done — `PAYMENTS_ENABLED=false` hides the frontend
   control and rejects payment initiation/webhooks server-side. Payments resume
   in Phase 2 only.
9. ~~Contabo + Dokploy foundation~~ done — hardened Ubuntu VPS, Cloudflare,
   CrowdSec, UFW, HTTPS panel domain, 2FA, and staging DNS are ready.
10. Next: deploy and smoke-test the API and web staging applications in Dokploy.

## Still unprovisioned (non-blocking, stubs in place)

- **Soketi** (SOKETI_* env) — chat persists; live pushes activate when set
- **Web Push VAPID keys** — subscriptions collected; delivery activates when added
- **Better Auth dashboard connect** (dash.better-auth.com) — passes after first deploy
