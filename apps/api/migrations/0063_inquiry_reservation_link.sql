-- R18: a student can attach one of their own reservations to a support
-- inquiry, so staff know which booking the question is about.
--
-- Ownership is checked in InquiriesService.create, inside the student's own
-- RLS transaction (reservations_student_read only returns their rows), so
-- another student's reservation id is rejected before the insert. No UPDATE
-- grant is added: 0031's column-level grant leaves reservation_id write-once.
ALTER TABLE inquiries ADD COLUMN reservation_id uuid REFERENCES reservations(id) ON DELETE SET NULL;
