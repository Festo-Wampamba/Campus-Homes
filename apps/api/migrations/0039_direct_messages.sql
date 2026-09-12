-- Allow student/landlord conversations to begin before a reservation while
-- preserving one reservation thread per reservation.
ALTER TABLE chat_threads ALTER COLUMN reservation_id DROP NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX chat_threads_direct_parties_uk
  ON chat_threads (student_id, landlord_id)
  WHERE reservation_id IS NULL;
--> statement-breakpoint
ALTER TABLE chat_messages ADD COLUMN edited_at timestamp with time zone;
--> statement-breakpoint
DROP POLICY IF EXISTS chat_messages_participant_update ON chat_messages;
--> statement-breakpoint
CREATE POLICY chat_messages_sender_update ON chat_messages FOR UPDATE
  USING (
    from_user_id = app_user_id()
    AND EXISTS (SELECT 1 FROM chat_threads t
                WHERE t.id = thread_id
                  AND (t.student_id = app_user_id() OR t.landlord_id = app_user_id()))
  )
  WITH CHECK (
    from_user_id = app_user_id()
    AND EXISTS (SELECT 1 FROM chat_threads t
                WHERE t.id = thread_id
                  AND (t.student_id = app_user_id() OR t.landlord_id = app_user_id()))
  );
