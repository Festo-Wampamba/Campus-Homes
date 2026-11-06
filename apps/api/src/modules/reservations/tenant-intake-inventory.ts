import { ConflictException } from '@nestjs/common';
import type { PoolClient } from 'pg';

// The same live-inventory rules serve the picker and the write path. Public
// publication is required only for listed properties, not approved management.
export const INTAKE_BEDS_SQL = `
 SELECT b.id, p.id AS property_id, u.id AS "unitId", p.name AS "propertyName", u.label AS "roomLabel",
   b.label AS "bedLabel", u.room_category AS "roomCategory", u.self_contained AS "selfContained",
   price.price_per_term_ugx AS "pricePerTermUgx", price.deposit_ugx, price.semester_id AS "semesterId",
   price.semester_name AS "semesterName", p.listing_intent, live.current_version_id
 FROM beds b JOIN units u ON u.id=b.unit_id JOIN properties p ON p.id=u.property_id
 LEFT JOIN LATERAL (
   SELECT l.semester_id,l.current_version_id FROM listings l
   WHERE l.property_id=p.id AND l.status='verified' AND l.current_version_id IS NOT NULL
   ORDER BY l.created_at DESC LIMIT 1
 ) live ON true
 JOIN LATERAL (
   SELECT usp.*, s.name AS semester_name FROM unit_semester_pricing usp
   JOIN semesters s ON s.id=usp.semester_id
   WHERE usp.unit_id=u.id AND s.archived_at IS NULL AND s.ends_on >= CURRENT_DATE
     AND ($3::uuid IS NULL OR usp.semester_id=$3)
     AND (p.listing_intent='manage_only' OR usp.semester_id=live.semester_id)
   ORDER BY (s.starts_on <= CURRENT_DATE) DESC,
     CASE WHEN s.starts_on <= CURRENT_DATE THEN s.starts_on END DESC, s.starts_on ASC
   LIMIT 1
 ) price ON true
 WHERE ($1::uuid IS NULL OR b.id=$1) AND ($2::uuid IS NULL OR p.landlord_id=$2)
   AND p.status <> 'suspended' AND p.operational_status='open' AND u.archived_at IS NULL AND b.retired_at IS NULL
   AND NOT b.blocked AND u.operational_status NOT IN ('blocked','under_maintenance')
   AND ((p.listing_intent='manage_only' AND p.manage_review_status='approved')
     OR (p.listing_intent='list' AND live.current_version_id IS NOT NULL))
   AND NOT EXISTS (SELECT 1 FROM unit_blocks ub WHERE ub.unit_id=u.id AND ub.cleared_at IS NULL
     AND ub.starts_at <= now() AND (ub.ends_at IS NULL OR ub.ends_at > now()))
   AND NOT EXISTS (SELECT 1 FROM reservations r WHERE r.bed_id=b.id
     AND (r.status IN ('booked','occupied') OR (r.status='reserved' AND r.reserved_expires_at > now())))
 ORDER BY p.name,u.label,b.label`;

export type IntakeBed = {
  id: string; unitId?: string; property_id: string; propertyName: string; roomLabel: string; bedLabel: string;
  roomCategory: string; selfContained: boolean; pricePerTermUgx: number; deposit_ugx: number | null;
  semesterId: string; semesterName: string; listing_intent: string; current_version_id: string | null;
};

export async function bookableIntakeBed(client: PoolClient, bedId: string, semesterId?: string): Promise<IntakeBed> {
  // Serializes competing walk-ins/acceptances. The existing live-bed unique
  // index remains the final guard against concurrent public reservations.
  await client.query('SELECT id FROM beds WHERE id=$1 FOR UPDATE', [bedId]);
  await client.query(`UPDATE reservations SET status='expired',updated_at=now() WHERE bed_id=$1 AND status='reserved' AND reserved_expires_at<=now()`, [bedId]);
  const bed = (await client.query<IntakeBed>(INTAKE_BEDS_SQL, [bedId, null, semesterId ?? null])).rows[0];
  if (!bed) throw new ConflictException('This bed is unavailable or blocked. Check the room, semester, approval and maintenance status, then choose another free bed.');
  return bed;
}

export async function intakeVersion(client: PoolClient, bed: IntakeBed): Promise<string> {
  if (bed.listing_intent !== 'manage_only' && bed.current_version_id) return bed.current_version_id;
  // Legacy reservations require a listing-version reference. Keep an INTERNAL
  // draft snapshot for managed bookings; never mark the listing verified or
  // publish it. Public search and student reserve still require verification.
  await client.query(`INSERT INTO listings(property_id,semester_id,status) VALUES ($1,$2,'draft')
    ON CONFLICT (property_id,semester_id) DO NOTHING`, [bed.property_id, bed.semesterId]);
  const listing = (await client.query<{ id: string; current_version_id: string | null }>(
    'SELECT id,current_version_id FROM listings WHERE property_id=$1 AND semester_id=$2 FOR UPDATE',
    [bed.property_id, bed.semesterId],
  )).rows[0]!;
  if (listing.current_version_id) return listing.current_version_id;
  const version = (await client.query<{ id: string }>(
    `INSERT INTO listing_versions(listing_id,version_number,price_per_term_ugx,amenities,description,verified_at)
     SELECT $1,COALESCE(max(version_number),0)+1,$2,'{}'::jsonb,'Internal managed tenancy snapshot',now()
     FROM listing_versions WHERE listing_id=$1 RETURNING id`, [listing.id, bed.pricePerTermUgx],
  )).rows[0]!;
  await client.query('UPDATE listings SET current_version_id=$2 WHERE id=$1', [listing.id, version.id]);
  return version.id;
}
