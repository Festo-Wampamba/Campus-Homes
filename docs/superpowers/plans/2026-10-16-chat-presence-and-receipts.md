# Chat: online / last seen + WhatsApp-style ticks

_Drafted 2026-10-16. Status: decided, Phase 1 in progress._

**Decided by Festo (2026-10-16):**
- "Online" = CampusHomes open on any page (option A).
- Phase 1 on polling now; Soketi (instant) later (option A).
- First release extras: **unread counts** (sidebar + browser tab) and **typing… indicator** (on polling: Redis key with a short TTL, shown on the next poll; moves to Soketi client events in Phase 2).
- Not now: privacy toggles, offline SMS/email nudge.

## 1. What exists today

| Piece | Today |
|---|---|
| Messages | `chat_messages` has `sent_at`, `edited_at`, `read_at`, `deleted_at`. No delivered state. |
| Read | `POST /chat/threads/:id/read` sets `read_at` when the other person opens the thread. |
| Ticks | Every own message shows a double tick, light blue once read. No single tick, no "delivered". |
| Presence | None: no online, no last seen. |
| Live updates | Polling: inbox every 5 s, open thread every 4 s. Soketi (Pusher protocol) is wired in `use-thread-messages.ts` but not running on the VPS. |
| Alerts | New message → in-app notification to the recipient (`chat.message_received`). |

## 2. The behaviour we want (WhatsApp rules)

| Tick | Meaning | When it changes |
|---|---|---|
| 🕓 clock | Sending | Until the API saves it |
| ✓ grey | Sent | Saved; the recipient is not on CampusHomes |
| ✓✓ grey | Delivered | The recipient had CampusHomes open (any page) when it arrived, or opened it later |
| ✓✓ blue | Read | The recipient opened that conversation while the message was on screen |
| ⚠ red | Not sent | Network/API error, with "Retry" |

Chat header for the other person:

- **Online** (green dot): they have CampusHomes open in a visible tab right now.
- **Last seen today at 2:14 pm / yesterday at 9:02 am / 12 Oct**: when they last had it open.
- Nothing shown if we have never seen them (or if they hid it, see 5).

## 3. Design

### Data (migration 0066, hand-written like 0013+)

- `chat_messages.delivered_at timestamptz`, backfilled `= COALESCE(read_at, sent_at)` so old messages don't all drop to one tick.
- `users.last_seen_at timestamptz` (persisted "last seen"; survives a Redis restart).
- No new table, so no new RLS policies. Writes go through service_role with the participant check in SQL, same pattern as `markRead`. RLS tests still added for the new column paths.

### Presence (Redis + one endpoint)

- `POST /api/v1/presence/heartbeat`, sent by every signed-in page **every 25 s while the tab is visible** (Page Visibility API), and immediately when a tab becomes visible again.
  - Sets Redis `presence:{userId}` with a 60 s TTL → "online".
  - Writes `users.last_seen_at = now()` at most once a minute (skip if Redis says we wrote it < 60 s ago), so the DB isn't hit every 25 s.
  - Marks every undelivered message **addressed to this user** as delivered (`delivered_at = now()`), one `UPDATE … FROM chat_threads` with the participant check. This is what turns ✓ into ✓✓.
- `navigator.sendBeacon('/api/v1/presence/away')` on `pagehide` / tab hidden → drops the Redis key so "last seen" is exact when they leave. If another tab is still open its next heartbeat (≤ 25 s) restores "online".
- Own rate-limit bucket (like `/events`) so heartbeats never eat the write quota on a campus NAT.
- **Privacy:** presence is only returned for people you share a chat thread with, never by arbitrary user id.

### API changes

- Message payloads gain `deliveredAt`.
- Thread list + thread messages gain `counterpart: { online: boolean, lastSeenAt: string | null }`.
- `markRead` runs on each poll while the thread is open **and** the tab is visible (today it only runs on open, so messages that arrive while you're looking stay "unread" to the sender until you reopen).

### Web

- `usePresenceHeartbeat()` mounted once in the student, landlord and staff shells.
- `chat-inbox.tsx`: tick icon by state (clock / ✓ / ✓✓ grey / ✓✓ blue / failed + Retry), `aria-label` on each ("Sent", "Delivered", "Read"); header line "Online" or "last seen …"; green dot on inbox avatars.
- Optimistic send: message appears instantly with the clock, swaps to ✓ when the API answers.

### Live updates: two phases

- **Phase 1 (polling, ships first):** everything above works with today's 4–5 s polling. Ticks and "online" update within ~5 s. No new infrastructure.
- **Phase 2 (Soketi, instant):** run Soketi on the VPS (Dokploy service, `ws.campushomes.co.ug`), set `NEXT_PUBLIC_SOKETI_*` + API `SOKETI_*`. The web already subscribes to `private-thread-{id}`; add `message-delivered` / `message-read` events and a Pusher **presence channel** per thread (built-in "who's online"), then slow polling to a 30 s fallback. Same DB columns stay the source of truth, so Phase 2 is additive.

## 4. Build order (one PR each)

1. Migration 0066 + presence module (heartbeat/away) + `delivered_at` marking + RLS/service tests.
2. Chat API: `deliveredAt`, counterpart presence, mark-read-while-visible + tests.
3. Web: heartbeat hook in shells, ticks, header presence, optimistic send/retry + tests; browser check with two accounts (student + landlord in separate browsers).
4. (Phase 2) Soketi service + realtime events + typing indicator.

Each: staging check with a real student and landlord, then release.

## 5. Things worth adding (Festo may have missed)

- **Typing… indicator.** Best on Soketi (client events); possible on polling but laggy. Recommend Phase 2.
- **Privacy settings** in Profile: "Show my last seen" and "Read receipts" (WhatsApp rule: if you hide yours, you can't see others'). Recommend Phase 1 setting stored on `users`, default on.
- **Unread count everywhere:** sidebar "Messages (2)" and the browser tab title "(2) CampusHomes", plus a sound/vibration option.
- **Offline follow-up:** if a message stays unread 15 min and the recipient is offline, send one SMS/email nudge ("You have a new message from … on CampusHomes"). Landlords are often off the platform; this matters more than ticks for actual replies.
- **Message failed / retry** and an offline queue so nothing is silently lost on a weak connection.
- **Read receipts in the landlord's booking flow:** show "Seen" on a Request booking notification.

## 6. Decisions for Festo

1. **"Online" means:** (A, recommended) CampusHomes open on any page, like WhatsApp with the app open; or (B) only while on the Messages page.
2. **Delivery speed:** (A, recommended) Phase 1 polling now, Soketi later; or (B) set up Soketi first so everything is instant from day one (adds VPS service + DNS + env work before any UI).
3. **Privacy toggles** (hide last seen / read receipts): now with Phase 1, or later.
4. **Offline SMS/email nudge** for unread messages: include, or skip for now.
