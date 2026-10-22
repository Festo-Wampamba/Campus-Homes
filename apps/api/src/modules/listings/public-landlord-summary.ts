/** Aggregate recent, mature inquiries. A full 24h observation window avoids
 * penalizing unanswered questions that arrived moments ago. The recorded reply
 * timestamp may reflect an edited reply, so timings are conservative, not an SLA. */
export const PUBLIC_LANDLORD_SUMMARY_SQL = `
  -- First name only on public pages (Festo, 2026-10-22): a full account name
  -- is personal data anyone could read.
  SELECT COALESCE(NULLIF(split_part(TRIM(u.name), ' ', 1), ''), 'Property landlord') AS "displayName",
         ll.created_at AS "joinedAt",
         CASE WHEN stats.total >= 5
           THEN ROUND(100.0 * stats.replied / stats.total)::int ELSE NULL END AS "responseRate",
         CASE WHEN stats.total >= 5
           THEN ROUND(100.0 * stats.within_day / stats.total)::int ELSE NULL END AS "within24HoursRate"
  FROM properties p
  JOIN landlords ll ON ll.user_id = p.landlord_id
  JOIN users u ON u.id = ll.user_id AND u.deleted_at IS NULL
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS total,
           COUNT(*) FILTER (WHERE i.landlord_responded_at >= i.created_at) AS replied,
           COUNT(*) FILTER (WHERE i.landlord_responded_at >= i.created_at
             AND i.landlord_responded_at <= i.created_at + interval '24 hours') AS within_day
    FROM inquiries i
    WHERE i.landlord_id = p.landlord_id AND i.listing_id IS NOT NULL
      AND i.created_at >= now() - interval '90 days'
      AND i.created_at <= now() - interval '24 hours'
  ) stats ON true
  WHERE p.id = $1
    AND EXISTS (SELECT 1 FROM listings l WHERE l.property_id = p.id AND l.status = 'verified')
`;
