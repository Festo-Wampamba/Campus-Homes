-- Read-only audit. Review each candidate before changing any assignment.
-- Profiles and activity can indicate legitimate dual use; this query never revokes access.
SELECT u.id, u.created_at,
  EXISTS (SELECT 1 FROM students s WHERE s.user_id = u.id) AS has_student_profile,
  EXISTS (SELECT 1 FROM landlords l WHERE l.user_id = u.id) AS has_landlord_profile,
  EXISTS (SELECT 1 FROM reservations r WHERE r.student_id = u.id) AS has_student_reservations,
  a.reason AS student_grant_reason, a.valid_from AS student_granted_at
FROM users u
JOIN user_role_assignments a ON a.user_id = u.id
JOIN roles r ON r.id = a.role_id AND r.key = 'student'
WHERE u.deleted_at IS NULL AND a.revoked_at IS NULL
  AND a.valid_from <= now() AND (a.valid_until IS NULL OR a.valid_until > now())
  AND EXISTS (
    SELECT 1 FROM user_role_assignments la JOIN roles lr ON lr.id = la.role_id
    WHERE la.user_id = u.id AND lr.key = 'landlord' AND la.revoked_at IS NULL
      AND la.valid_from <= now() AND (la.valid_until IS NULL OR la.valid_until > now())
  )
ORDER BY u.created_at;
