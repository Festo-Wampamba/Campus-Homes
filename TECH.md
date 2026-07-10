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
| [Upstash](https://console.upstash.com) | Redis (REDIS_URL, BullMQ) | ✅ | DB `campus-homes`, region af-south-1 (Cape Town), free tier. REDIS_URL in `.env` (read-write `default` user, not `default_ro`). Eviction toggle was ON — recommend turning OFF in Settings (job data shouldn't be evictable). |
| [Africa's Talking](https://account.africastalking.com) | SMS/OTP | ✅ | Sandbox app API key generated, AFRICASTALKING_API_KEY in `.env`. |
| [Cloudinary](https://cloudinary.com) | Image storage (CLOUDINARY_URL) | ✅ | Cloud name `bm2jqbac`, dedicated API key `campushomes` generated (not using Root key). CLOUDINARY_URL in `.env`. |
| [Sentry](https://sentry.io) | Error tracking (SENTRY_DSN) | ✅ | Org `Akolet Company Uganda`, Nest.js project, EU data region. SENTRY_DSN in `.env`. SDK wiring (`instrument.ts`, `SentryModule`) still needs to be added to the Nest app — see onboarding code snippet. |
| [Flutterwave](https://dashboard.flutterwave.com) | Payment processing | ⏸️ | **Deferred by choice, not blocked.** Uganda confirmed supported (dedicated onboarding doc; Individual Account needs only National ID + bank reference letter, no CAC/URA docs). DPO Pay checked as alt, also works for Uganda, but brief §4 locks Flutterwave — no reason to switch. Resuming later with test-mode key. |

## Build order (per CLAUDE.md — nothing runs without DATABASE_URL)

1. ~~Neon → DATABASE_URL~~ done, migrations applied (0000–0002, 32 tables)
2. ~~Upstash → REDIS_URL~~ done (BullMQ jobs + hold locks live on it)
3. ~~Cloudinary → CLOUDINARY_URL~~ done (`POST /api/v1/uploads/sign` issues signed params)
4. ~~Sentry → SENTRY_DSN~~ done (SDK wiring into Nest app still pending)
5. ~~Africa's Talking → AFRICASTALKING_API_KEY~~ done (OTP + notification SMS)
6. ~~BETTER_AUTH_SECRET~~ generated; ~~AuthModule~~ done
7. ~~Backend MVP modules~~ done — Listings/Ops/Reservations/Notifications/Chat/Jobs/Uploads,
   34 tests green (see CLAUDE.md build memory)
8. Payments — deferred, pick back up when ready (Flutterwave test-mode key);
   StubPayments adapter covers dev meanwhile
9. Next: frontend (`apps/web`) — see FRONTEND.md

## Still unprovisioned (non-blocking, stubs in place)

- **Soketi** (SOKETI_* env) — chat persists; live pushes activate when set
- **Web Push VAPID keys** — subscriptions collected; delivery activates when added
- **Better Auth dashboard connect** (dash.better-auth.com) — passes after first deploy
