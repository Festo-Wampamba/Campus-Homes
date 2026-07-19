# Phase 6 — Chat: Design

Ground truth: `FRONTEND.md` §7 flow 6, `CLAUDE.md` build memory. Backend
`ChatModule` (`apps/api/src/modules/chat/`) and `packages/shared/src/chat.ts`
already exist and are unchanged by this phase except where noted.

## Scope

Per-reservation chat between a student and their landlord. History via REST.
Live updates via `pusher-js` against Soketi (`private-thread-{threadId}`,
event `message`), degrading to poll/refetch when Soketi isn't provisioned.
Chat itself must work in both cases.

## Gaps found during scoping (in scope for this phase)

1. **No Pusher channel-auth endpoint exists.** `private-thread-{id}` is a
   *private* Pusher channel — `pusher-js` requires a signed server auth
   handshake before it will subscribe at all (this is not a degrade case,
   it's a hard failure without the endpoint). Nothing in `apps/api` handles
   this today (`grep` for `authorizeChannel` / `pusher/auth` is empty).
2. **No landlord-side reservations page exists.** `GET
   /reservations/landlord-inbox` is live on the backend
   (`reservations.controller.ts:41-44`) but nothing in `apps/web` calls it —
   the landlord dashboard (`(landlord)/landlord/page.tsx`) only lists
   properties. Chat needs a landlord-side entry point into a thread, which
   needs a reservation to originate from.

## Architecture

### 1. Backend: `POST /chat/pusher/auth`

Added to `ChatController`. Request body (Pusher's standard form-encoded
auth request): `socket_id`, `channel_name`. Steps:

- Parse `threadId` out of `channel_name` (`private-thread-{threadId}`).
- Verify the caller is a participant using the same RLS-scoped read
  `ChatService.messages()` already relies on (participant-only via RLS) —
  reuse `chatThreads` lookup scoped to `ctx`; if no row comes back, the
  caller isn't a participant (or ops) → 403.
- Call `pusher.authorizeChannel(socket_id, channel_name)` on the same
  `Pusher` client `SoketiRealtime` constructs, and return its result.
- If running under `NoopRealtime` (no Soketi configured), this endpoint
  won't be hit by the frontend at all (client-side env check gates
  `pusher-js` initialization — see §3), so no special-casing needed here.

`realtime.adapter.ts` gains an exported `createPusherClient(config)` factory;
`SoketiRealtime` and the new controller endpoint both call it, so the
`Pusher` client is constructed once per config rather than duplicated.

### 2. Frontend: landlord reservations page

`apps/web/src/app/(landlord)/landlord/reservations/page.tsx` — server
component, calls `GET /reservations/landlord-inbox` via a new
`getLandlordReservations()` in `src/lib/landlord.ts`. Renders bare rows
(id, unitId, status, holdExpiresAt) — same intentional minimalism as
`(student)/reservations/reservations-list.tsx` (no listing/property join on
this endpoint). Each row gets a "Message" button.

Add `{ label: "Reservations", href: "/landlord/reservations" }` to the
landlord nav in `(landlord)/layout.tsx`.

### 3. Frontend: messages inbox (shared component, one route per portal)

- `apps/web/src/app/(student)/messages/page.tsx`
- `apps/web/src/app/(landlord)/messages/page.tsx`

Both render `<ChatInbox currentUserId={session.user.id} />`
(`src/components/chat/chat-inbox.tsx`, client component):

- Left pane: thread list from `GET /chat/threads`
  (`src/lib/chat.ts` → `getMyThreads()`), sorted by `lastMessageAt` desc.
- Right pane: selected thread (via `?thread=<id>` search param) — messages
  from `GET /chat/threads/:id/messages`, composer `POST`s to the same route
  via `sendMessageSchema`.
- Empty state when no thread selected / no threads yet.

"Message" buttons on reservation cards (student `reservations-list.tsx` and
the new landlord reservations page) call
`POST /chat/threads/:reservationId` (ensureThread) then
`router.push('/messages?thread=' + id)`.

Add `{ label: "Messages", href: "/messages" }` to both the student and
landlord nav arrays.

### 4. Real-time with poll fallback

`useThreadMessages(threadId)` hook in `chat-inbox.tsx`:

- Always fetches `GET /chat/threads/:id/messages` on mount / thread change.
- Reads `process.env.NEXT_PUBLIC_SOKETI_KEY` (new public env var, mirrors
  the backend's `SOKETI_*` group). If set: lazily import `pusher-js`,
  construct `new Pusher(key, { cluster: ..., authEndpoint:
  '{API_BASE}/chat/pusher/auth' })`, subscribe to
  `private-thread-{threadId}`, append incoming `message` events to state
  (dedupe by `id`).
- If unset: 4s `setInterval` refetch of the messages endpoint (same shape as
  `usePaymentPoll` in `reservations-list.tsx`), replacing state each tick
  (server is source of truth; dedupe by `id` isn't needed since it's a full
  refetch, not an append).
- Cleanup: unsubscribe/disconnect Pusher or clear interval on unmount /
  thread change.

New env var: `NEXT_PUBLIC_SOKETI_KEY` (and `NEXT_PUBLIC_SOKETI_CLUSTER` if
Soketi's config needs it) added to `FRONTEND.md`'s env table — left unset
for now since Soketi isn't provisioned (matches the existing pattern for
`FLUTTERWAVE_SECRET_KEY` / VAPID keys: subscription/capture code exists,
delivery activates when the env var is added later).

## Data flow

```text
Reservation card "Message" → POST /chat/threads/:reservationId (ensureThread)
  → redirect to /messages?thread={id}
ChatInbox mount → GET /chat/threads (list) + GET /chat/threads/:id/messages (active)
Composer submit → POST /chat/threads/:id/messages → optimistic append + real send
  → backend triggers Soketi event (if configured) → other participant's
    useThreadMessages receives it live; otherwise their next poll tick picks it up
```

## Error handling

- `ensureThread` 403 (not a party to the reservation) — surface as a toast,
  no crash (mirrors existing pattern of clean 403s over raw DB errors, per
  CLAUDE.md Phase 4 notes).
- `pusher/auth` 403 — `pusher-js` will emit a subscription error; the hook
  catches it and falls back to polling for that session rather than hard
  failing (defense in depth — should never actually trigger since only
  participants reach a thread's URL, but avoids a dead chat pane if it
  does).
- Message send failure — composer keeps the drafted text and shows an
  inline error instead of clearing on failure.

## Testing

- Backend: Jest test for `POST /chat/pusher/auth` — participant gets 200
  with an auth signature, non-participant gets 403. This is the
  highest-value test since it's the one place with real security surface
  (a forged channel-auth request could otherwise leak another thread's
  live messages).
- Frontend: manual browser QA against the local docker test DB (matches
  existing project pattern — no new Cypress e2e for this phase, per
  FRONTEND.md §8 priority order which reserves e2e investment for the
  reservation-hold and ops offline-sync flows).

## Out of scope (explicitly deferred)

- Read receipts / unread counts (`readAt` column exists on `chat_messages`
  but nothing sets it in this phase).
- Ops visibility into chat threads (RLS already allows ops reads per the
  brief's matrix if that's ever needed — no UI this phase).
- Message soft-delete UI (`deletedAt` column exists, unused).
