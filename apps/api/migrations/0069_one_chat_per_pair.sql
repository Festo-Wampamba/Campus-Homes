-- One conversation per student-landlord pair. Threads used to be created per
-- reservation, so a student with two reservations at one landlord saw that
-- landlord twice. Merge each pair into one thread: the existing direct
-- thread if there is one, otherwise the oldest.
WITH canon AS (
  SELECT DISTINCT ON (student_id, landlord_id) id, student_id, landlord_id
  FROM chat_threads
  ORDER BY student_id, landlord_id, (reservation_id IS NULL) DESC, created_at, id
)
UPDATE chat_messages m SET thread_id = c.id
FROM chat_threads t JOIN canon c ON c.student_id = t.student_id AND c.landlord_id = t.landlord_id
WHERE m.thread_id = t.id AND t.id <> c.id;
--> statement-breakpoint
-- Unread-message notifications keep pointing at a thread that still exists.
WITH canon AS (
  SELECT DISTINCT ON (student_id, landlord_id) id, student_id, landlord_id
  FROM chat_threads
  ORDER BY student_id, landlord_id, (reservation_id IS NULL) DESC, created_at, id
)
UPDATE notifications n SET payload = jsonb_set(n.payload, '{threadId}', to_jsonb(c.id::text))
FROM chat_threads t JOIN canon c ON c.student_id = t.student_id AND c.landlord_id = t.landlord_id
WHERE n.payload->>'threadId' = t.id::text AND t.id <> c.id;
--> statement-breakpoint
-- The merged-away threads are empty now.
WITH canon AS (
  SELECT DISTINCT ON (student_id, landlord_id) id, student_id, landlord_id
  FROM chat_threads
  ORDER BY student_id, landlord_id, (reservation_id IS NULL) DESC, created_at, id
)
DELETE FROM chat_threads t USING canon c
WHERE c.student_id = t.student_id AND c.landlord_id = t.landlord_id AND t.id <> c.id;
--> statement-breakpoint
UPDATE chat_threads t SET reservation_id = NULL,
  last_message_at = (SELECT max(m.sent_at) FROM chat_messages m WHERE m.thread_id = t.id);
--> statement-breakpoint
DROP INDEX IF EXISTS chat_threads_direct_parties_uk;
--> statement-breakpoint
CREATE UNIQUE INDEX chat_threads_parties_uk ON chat_threads (student_id, landlord_id);
