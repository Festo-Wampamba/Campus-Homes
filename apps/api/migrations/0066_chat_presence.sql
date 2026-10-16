-- WhatsApp-style receipts and presence (plan: docs/superpowers/plans/2026-10-16-chat-presence-and-receipts.md).
-- delivered_at: the recipient had CampusHomes open (one grey tick -> two).
-- Existing messages count as delivered so history doesn't drop to one tick.
ALTER TABLE chat_messages ADD COLUMN delivered_at timestamptz;
UPDATE chat_messages SET delivered_at = COALESCE(read_at, sent_at);

-- The heartbeat marks a user's undelivered messages every ~25 s; keep that
-- lookup on the small undelivered set only.
CREATE INDEX chat_messages_undelivered_idx ON chat_messages (thread_id) WHERE delivered_at IS NULL;

-- "Last seen": written by the presence heartbeat at most once a minute.
ALTER TABLE users ADD COLUMN last_seen_at timestamptz;
