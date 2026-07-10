# Phase 5 — Ops verification queue + offline Inspection Mode

Status: approved by user 2026-07-10. Ground truth for implementation planning.

## Scope

Frontend Phase 5 per `FRONTEND.md` §7 item 5: the ops portal (`(ops)` route
group, already scaffolded with a role-gated layout and an empty queue page).
Two personas share the group and branch by role:

- **ops_lead / admin** — verification queue, schedule visits, review +
  approve completed visits, publish listings, issue landlord strikes.
- **ops_inspector** — "my visits" list, offline-capable Inspection Mode
  (6-component checklist capture, works with no connectivity).

Out of scope for this phase: Phase 7's PWA/service worker (manifest, SW
registration) — the sync mechanism here is a lightweight in-page manager, not
a Service Worker Background Sync, so it doesn't need that infra pulled
forward. Also out of scope: an ad-hoc/unscheduled visit flow — Inspection
Mode requires a visit already created by `POST /ops/visits` (ops_lead-only
today), so an inspector can't start a checklist for a property with no
scheduled visit row.

## Routes

```text
(ops)/ops/page.tsx              lead: queue list ; inspector: redirect to /ops/inspect
(ops)/ops/visits/schedule        lead: schedule-visit form
(ops)/ops/visits/[id]            lead: visit detail — review checklist, approve
(ops)/ops/publish/[listingId]    lead: publish form (price/amenities/units)
(ops)/ops/strikes                lead: issue-strike form
(ops)/ops/inspect                inspector: "my visits" list (home screen)
(ops)/ops/inspect/[visitId]      inspector: Inspection Mode checklist (offline)
```

Role branching happens in `page.tsx`/route logic, not in `layout.tsx` (which
stays as the existing coarse role gate: `ops_inspector | ops_lead | admin`).

## Backend additions

Two small, RLS-safe endpoints — both readable under the normal per-request
user ctx (no `service_role` needed):

1. **`GET /ops/inspectors`** (`ops_lead`, `admin`) — `ops_staff` join `users`
   where `team = 'inspector' AND active = true`. Returns
   `{ id, name, catchment }[]`. Feeds the schedule-visit inspector dropdown,
   which today has no data source.
2. **`GET /ops/visits/mine`** (`ops_inspector`) — `verification_visits` where
   `inspector_id = self`, not yet approved, joined to property name/address.
   Feeds the inspector's home list.

   Why not reuse `GET /ops/queue`: that endpoint returns *properties*
   (lead-shaped), and because `verification_visits` RLS scopes rows to
   `inspector_id = app_user_id() OR app_is_lead()`, a property whose visit is
   assigned to a *different* inspector would come back with `visit_id IS
   NULL` under an inspector's own ctx — indistinguishable from "no visit
   scheduled yet." Not a data leak (RLS still hides the other inspector's
   row), but wrong metadata for a screen whose whole job is "what do I need
   to go do." A dedicated query sidesteps it.
3. **`GET /ops/properties/:id/listings`** (`ops_lead`, `admin`) — a
   property's listings (`id`, `status`, `semesterId`). `publishListingSchema`
   takes a `listingId`, not a `propertyId`, but nothing today lets ops
   discover which listing belongs to a property they just approved a visit
   for — `GET /ops/queue` only joins `properties` + `verification_visits`,
   and the only other listing reads are public (`verified`-only) or
   landlord-scoped (`/listings/properties/mine`). RLS already permits it —
   `listings_read` includes `app_is_ops()` — this just exposes it as an
   ops-facing query. Visit detail uses it to link "Approve" through to the
   right "Publish" target.
4. **`GET /ops/visits/:id`** (`ops_lead`, `admin`) — the full
   `verification_visits` row (checklist, visit GPS, started/completed at,
   result, failure reason, approval state). Found while mapping the lead's
   "visit detail" screen to endpoints: `GET /ops/queue` is list-shaped and
   deliberately excludes the checklist column, so there was no way to review
   a completed checklist before approving. RLS already permits it
   (`visits_read`: `inspector_id = app_user_id() OR app_is_lead()`).

New shared schemas in `packages/shared/src/ops.ts`: `opsInspectorSchema`,
`opsVisitMineSchema` — response contracts, following the existing pattern of
typed response schemas for `listings` (§14 in CLAUDE.md).

## Ops-lead screens

- **Queue** (`/ops`, replaces the current static empty-state page): table
  from `GET /ops/queue` — property name/address, SLA age (color threshold:
  amber >48h, red >96h), visit status. Row action: "Schedule" if no visit
  exists yet, "View" if one does.
- **Schedule visit**: form matching `ScheduleVisitDto` — inspector select
  (from the new endpoint), datetime picker for `scheduledAt`. `POST
  /ops/visits`.
- **Visit detail**: read-only render of the synced checklist — each of the 6
  components (`VERIFICATION_CHECKLIST_COMPONENTS`) with its pass/fail +
  notes, plus visit GPS and overall `result`. "Approve" button calls `POST
  /ops/visits/:id/approve`, enabled only when `result === 'passed'`. Once
  approved, fetches `GET /ops/properties/:id/listings` to link to that
  property's listing for publishing.
- **Publish**: form matching `PublishListingDto` (price, amenities map,
  description, units array) — reached from an approved visit via the
  listing id resolved above. `POST /ops/listings/publish`.
- **Strikes**: standalone form — landlord id, `STRIKE_REASONS` enum,
  optional reservation id + notes. `POST /ops/strikes`.

## Ops-inspector screens

- **My visits** (`/ops/inspect`): list from `GET /ops/visits/mine` —
  property + scheduled time; tapping a row opens Inspection Mode.
- **Inspection Mode** (`/ops/inspect/[visitId]`): full-screen, mobile-first.
  - On open: look up an IndexedDB draft keyed by `visitId`. If none exists,
    create one and generate `clientIdempotencyKey` once (persisted with the
    draft, reused across every retry — this is the field that makes
    `POST /ops/visits/sync` idempotent server-side).
  - `startedAt` set on first open. GPS auto-captured via
    `navigator.geolocation.getCurrentPosition()`; manual lat/lon fields shown
    as a fallback if permission is denied or the API is unavailable.
  - 6 sections, one per checklist component: pass/fail toggle + notes
    textarea. Every change writes the entire draft to IndexedDB immediately
    (notes debounced ~300ms so we're not writing on every keystroke).
  - Overall `result` (`passed`/`failed`) + optional `failureReason`,
    `completedAt` set on submit.
  - Submit enqueues the draft in the IndexedDB sync queue and the sync
    manager attempts it immediately. If offline, it sits queued with a
    visible "will sync when back online" badge.
  - Portal shell gets a persistent online/offline indicator; each queued
    visit shows a per-item status: synced / queued / syncing /
    failed-needs-review.

## Offline architecture

- Plain IndexedDB, no new runtime dependency — a small hand-rolled wrapper
  (`apps/web/src/lib/ops/inspection-db.ts`), one object store keyed by
  `visitId`, storing the draft checklist + metadata (`clientIdempotencyKey`,
  `startedAt`, sync status).
- Sync manager (`apps/web/src/lib/ops/sync-manager.ts`) — in-page, not a
  Service Worker: triggers on the browser `online` event, immediately after
  an Inspection Mode submit, and on a 30s interval fallback while any `(ops)`
  page is mounted. Drains the queue serially via `POST /ops/visits/sync`. A
  non-network 4xx marks the item `failed-needs-review` (surfaced, not
  silently retried forever); network errors retry on the next tick.

## New UI primitives

`apps/web/src/components/ui/` currently has button, card, input, label,
skeleton only. This phase adds, hand-rolled in the same style (no new UI
library): `Textarea`, a pass/fail segmented `Toggle`, and `Select` (for the
inspector dropdown).

## Testing

- Jest: sync-manager queue/retry logic (mocked `fetch`, real IndexedDB via
  `fake-indexeddb` in jsdom — the one new test-only dependency this phase
  needs); `inspection-db` read/write/resume round-trip.
- Manual QA against the live docker test DB (per this project's established
  pattern): throttle network offline mid-checklist in devtools, confirm the
  draft survives a reload, confirm the sync manager drains on reconnect,
  confirm a replayed sync doesn't double-submit (backend dedupe already
  covered by existing RLS/service tests).
