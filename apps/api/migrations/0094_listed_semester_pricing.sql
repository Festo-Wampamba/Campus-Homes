-- Public search only counts rooms priced for the listing's own semester.
-- Rooms added in Manage Rooms under another semester of the same period had
-- no price for the listed semester, so a live listing showed no rooms and
-- stayed out of search (Campushomes Villas, production, 2026-11-15). Give
-- those rooms the listed semester's price too. Only prices from a semester
-- the property has no listing for are copied, newest semester first, and an
-- existing price is never replaced.
INSERT INTO unit_semester_pricing (unit_id, semester_id, price_per_term_ugx, deposit_ugx)
SELECT DISTINCT ON (u.id, l.semester_id) u.id, l.semester_id, usp.price_per_term_ugx, usp.deposit_ugx
FROM listings l
JOIN units u ON u.property_id = l.property_id AND u.archived_at IS NULL
JOIN unit_semester_pricing usp ON usp.unit_id = u.id
JOIN semesters s ON s.id = usp.semester_id
WHERE l.status IN ('verified', 'suspended')
  AND NOT EXISTS (SELECT 1 FROM listings own
                  WHERE own.property_id = l.property_id AND own.semester_id = usp.semester_id)
ORDER BY u.id, l.semester_id, s.starts_on DESC
ON CONFLICT (unit_id, semester_id) DO NOTHING;
