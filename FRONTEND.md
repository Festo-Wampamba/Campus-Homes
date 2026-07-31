# CampusHomes — Frontend Implementation Guide (`apps/web`)

How to add the Next.js frontend to this monorepo and wire it to the finished
backend. Grounded in the build brief (§12–§13, §17, §19) and the API as it
actually exists today. Read `CLAUDE.md` first for the locked decisions.

## 1. What the backend already gives you

Base URL: `http://localhost:4000` locally (Render in production).
All REST routes live under `/api/v1`; auth lives under `/api/auth` (Better Auth
convention, outside the versioned prefix).

### Auth (`/api/auth/*` — Better Auth endpoints, use the client SDK, not fetch)
| Flow | How |
|---|---|
| Student/landlord sign-in | Phone OTP: `phoneNumber.sendOtp({ phoneNumber })` → `phoneNumber.verify({ phoneNumber, code })`. First verify auto-creates the user (role `student`). |
| Ops/Admin sign-in | `signIn.email({ email, password })` — sign-*up* is disabled; ops users are seeded server-side. |
| Session | Cookie-based; `getSession()` returns `{ user: { id, role, status, phone, ... }, session }`. |

### REST endpoints (`/api/v1`)
| Method + path | Who | Purpose |
|---|---|---|
| GET `/listings/search?minLat&minLon&maxLat&maxLon&maxPriceUgx?&limit?` | public | PostGIS bounding-box search over verified listings |
| GET `/listings/:id` | public | Version snapshot + photos + units + per-unit availability |
| POST `/listings/properties` | landlord | Submit a property |
| GET `/listings/properties/mine` | landlord | Own properties |
| POST `/listings/properties/:id/documents` | landlord | Attach KYC/property doc metadata (Cloudinary storage key) |
| POST `/listings/drafts` | landlord | Create draft listing (property + semester) |
| GET `/ops/queue` | ops | Verification queue with SLA age |
| POST `/ops/visits` | ops_lead | Schedule visit, assign inspector |
| POST `/ops/visits/sync` | ops_inspector | **Offline-sync drain target** — idempotency-keyed checklist submission |
| POST `/ops/visits/:id/approve` | ops_lead | Approve a completed visit |
| POST `/ops/listings/publish` | ops_lead | Publish: version snapshot + `verified` flip + units |
| POST `/ops/strikes` | ops_lead | Issue landlord strike (3 ⇒ auto-suspend, DB-enforced) |
| POST `/reservations/holds` | student | Create hold — send client-generated `idempotencyKey`; returns `checkoutUrl` |
| GET `/reservations/mine` | student | Own reservations |
| GET `/reservations/landlord-inbox` | landlord | Status-only view (payment detail is RLS-invisible) |
| GET `/reservations/:id/payment-status` | student | Poll after checkout redirect |
| POST `/reservations/:id/cancel` | student | Cancel a held reservation |
| POST `/reservations/:id/move-in` | student, landlord | Confirm move-in |
| GET `/chat/threads` · POST `/chat/threads/:reservationId` | participants | Thread list / ensure thread for a reservation |
| GET+POST `/chat/threads/:id/messages` | participants | History / send (Soketi event `message` on channel `private-thread-{id}`) |
| GET `/notifications` · POST `/notifications/:id/read` | any authed | Feed / mark read |
| POST `/notifications/push-subscriptions` | any authed | Register Web Push subscription |

Validation errors come back as 400 with Zod issue detail (nestjs-zod format).

## 2. Scaffold

```bash
cd apps
pnpm create next-app@latest web --ts --app --tailwind --eslint --src-dir --use-pnpm
cd web && pnpm dlx shadcn@latest init   # Tailwind v4 + React 19 defaults
```

`apps/web/package.json` additions:

```jsonc
{
  "dependencies": {
    "@campushomes/shared": "workspace:*",   // the same Zod schemas the API validates with
    "better-auth": "…same version as apps/api…",
    "@tanstack/react-query": "^5",
    "react-hook-form": "latest",
    "@hookform/resolvers": "latest",
    "pusher-js": "latest",                  // Soketi client
    "next-intl": "latest"                   // scaffold day one, single English catalog (§16)
  }
}
```

Node 24 (`.nvmrc` already at repo root). Next.js 16 uses `proxy.ts` — not
`middleware.ts` — for request interception (CLAUDE.md stack pin).

## 3. Environment (`apps/web/.env.local`)

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
NEXT_PUBLIC_SOKETI_HOST=          # empty until Soketi is provisioned (TECH.md)
NEXT_PUBLIC_SOKETI_KEY=
NEXT_PUBLIC_TILE_URL=             # optional; defaults to OSM raster tiles (§20 resolved: MapLibre + OSM)
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=# for rendering listing photos (res.cloudinary.com URLs)
NEXT_PUBLIC_SENTRY_DSN=           # separate browser DSN, not the API's
```

**No database credentials of any kind in this app (§17).**

## 4. Better Auth client

```ts
// src/lib/auth-client.ts
import { createAuthClient } from 'better-auth/react';
import { phoneNumberClient, inferAdditionalFields } from 'better-auth/client/plugins';
import type { Auth } from '@campushomes/api-types'; // or duplicate the additionalFields shape

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL, // Better Auth appends /api/auth
  plugins: [
    phoneNumberClient(),
    inferAdditionalFields({ user: { role: { type: 'string' }, status: { type: 'string' } } }),
  ],
});
```

Cross-origin cookies (Vercel frontend ↔ Render backend): the API must add the
web origin to Better Auth `trustedOrigins` and CORS with `credentials: true`;
client fetches use `credentials: 'include'`. Do this when the first deployed
environment exists — localhost works without it.

## 5. API client — one thin wrapper, shared schemas as the contract

```ts
// src/lib/api.ts
const BASE = process.env.NEXT_PUBLIC_API_BASE_URL;

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) throw await res.json();
  return res.json() as Promise<T>;
}
```

Request bodies are typed by importing from `@campushomes/shared` — the exact
schemas the backend validates with (`createHoldSchema`, `submitPropertySchema`,
`syncVisitSchema`, …). Forms: `useForm({ resolver: zodResolver(schema) })`.
Never hand-write a request/response type (§14).

## 6. Route groups (§12)

```
src/app/
  (public)/          # marketing, search, listing detail — no auth
  (student)/         # guard: session && role === 'student'
  (landlord)/        # guard: role === 'landlord' && kycStatus === 'verified' (except onboarding/*)
  (ops)/             # guard: role in (ops_inspector, ops_lead); lead-only subroutes for approvals
```

RBAC is enforced in each group's `layout.tsx` from the Better Auth session.
This is UX-level gating only — the API + RLS are the real enforcement, so a
bug here can annoy users but can't leak data.

## 7. Portal build order (§19, frontend steps)

1. **Design system base** — shadcn primitives + brand tokens in `@theme`
   (Tailwind v4 CSS-first, no `tailwind.config.js`); verification badge and
   layout shells first.
2. **(public) + (student) read-only** — search page against
   `/listings/search`, map (⚠️ §20 decision first), listing detail rendering
   the *version snapshot* the API returns (never re-fetch live listing fields).
3. **(landlord) onboarding + property submission** — phone-OTP sign-in →
   profile → `POST /listings/properties` (+ document metadata after Cloudinary
   upload). Client-side MIME/size checks are convenience only.
4. **(student) reservation flow (Phase 2)** — the implementation foundation is
   built, but it is not part of the Phase 1 public MVP. When Phase 2 activates,
   generate `idempotencyKey` client-side (`crypto.randomUUID()`), POST the
   hold, redirect to `checkoutUrl`, then poll
   `/reservations/:id/payment-status` on return. Until then, hide payment entry
   points and rely on the backend `PAYMENTS_ENABLED=false` guard; do not expose
   the stub checkout to public users.
5. **(ops) queue + scheduler + offline Inspection Mode** — the technically
   distinct piece: every checklist edit writes to IndexedDB immediately; a sync
   worker drains to `POST /ops/visits/sync` when connectivity returns. The
   payload's `clientIdempotencyKey` is generated when the visit starts and
   reused across retries — the server dedupes on it (already tested).
6. **Chat** — history via REST; live updates via `pusher-js` against Soketi
   channel `private-thread-{threadId}`, event `message`. Works without Soketi
   (poll or refetch) until it's provisioned.
7. **Notifications + PWA** — feed from `/notifications`; Web Push:
   `PushManager.subscribe()` → `POST /notifications/push-subscriptions`
   (delivery activates when VAPID keys are added server-side). Manifest +
   service worker: cache verified-listings index + last-viewed listing
   (student), IndexedDB queue (ops). Nothing more (§15).
8. **Sentry + Vercel deploy** — browser DSN, PII scrubbing, Node 24 runtime
   set explicitly in Vercel project settings.

## 8. Testing expectations (§18)

- Jest component/unit tests; Cypress e2e.
- Priority order: reservation-hold flow, then Ops offline-sync — the two
  places where a bug costs money or a missed verification.
- Real-device testing matters: target the devices actually common in Kampala.

## 9. Deployment (§17)

- Vercel project rooted at `apps/web`, Node 24, `pnpm build` via workspace.
- Backend stays on Render — two independent deployables; the frontend only
  ever talks to `NEXT_PUBLIC_API_BASE_URL`.
- After first deploy: add the Vercel URL to the API's CORS + Better Auth
  `trustedOrigins`, and update the Better Auth dashboard "Connect" check
  (dash.better-auth.com) which currently points at https://campushomes.ug.

## 10. Open items that block specific frontend pieces

| Item | Blocks | Where it's tracked |
|---|---|---|
| ~~Mapbox vs MapLibre (§20)~~ | — | resolved: MapLibre + OSM tiles (free); `NEXT_PUBLIC_TILE_URL` optional override |
| Flutterwave Phase 2 activation | real checkout, transaction verification, refunds, reconciliation, and removal of the Phase 1 payment guard | TECH.md |
| Soketi provisioning | live chat pushes (chat itself works) | TECH.md |
| VAPID keys | Web Push delivery (subscription capture works) | TECH.md |
| ~~Cloudinary signed-upload endpoint~~ | — | built: `POST /uploads/sign` (authed) returns `{ cloudName, apiKey, timestamp, folder, signature }` for direct browser→Cloudinary upload |
