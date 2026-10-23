import type { Pool } from 'pg';

/** Minimal hostel → room → bed → reservation chain tying a student to a
 * landlord, for specs that need the 0073 "reserved with this landlord" rule.
 * Seeds as the pool's owner role (RLS off, triggers on). `key` keeps names
 * and idempotency keys unique per call. */
export async function seedReservation(pool: Pool, studentId: string, landlordId: string, key: string): Promise<string> {
  const id = async (sql: string, params: unknown[]) => (await pool.query(sql, params)).rows[0].id as string;
  const semester = await id(
    `INSERT INTO semesters (name, starts_on, ends_on, re_verification_window_starts_on)
     VALUES ($1, '2026-08-01', '2026-12-15', '2026-11-15') RETURNING id`,
    [`Fixture semester ${key}`],
  );
  const property = await id(
    `INSERT INTO properties (landlord_id, name, street_address, status, catchment)
     VALUES ($1, $2, 'Kikoni', 'active', 'MUK') RETURNING id`,
    [landlordId, `Fixture hostel ${key}`],
  );
  const listing = await id(
    `INSERT INTO listings (property_id, semester_id, status) VALUES ($1, $2, 'draft') RETURNING id`,
    [property, semester],
  );
  const version = await id(
    `INSERT INTO listing_versions (listing_id, version_number, price_per_term_ugx, amenities, verified_at)
     VALUES ($1, 1, 800000, '{}'::jsonb, now()) RETURNING id`,
    [listing],
  );
  const unit = await id(
    `INSERT INTO units (property_id, label, room_category) VALUES ($1, 'Room 1', 'single') RETURNING id`,
    [property],
  );
  await pool.query(
    `INSERT INTO unit_semester_pricing (unit_id, semester_id, price_per_term_ugx) VALUES ($1, $2, 800000)`,
    [unit, semester],
  );
  const bed = await id(`INSERT INTO beds (unit_id, label) VALUES ($1, 'Bed 1') RETURNING id`, [unit]);
  return id(
    `INSERT INTO reservations
       (student_id, bed_id, listing_version_id, status, idempotency_key, reserved_expires_at, price_per_term_ugx)
     VALUES ($1, $2, $3, 'reserved', $4, now() + interval '24 hours', 800000) RETURNING id`,
    [studentId, bed, version, `fixture-reservation-${key}`],
  );
}
