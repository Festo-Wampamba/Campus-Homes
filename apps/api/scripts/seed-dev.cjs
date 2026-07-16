const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
});

const FULL_CHECKLIST = {
  location_gps: { passed: true },
  rooms_capacity: { passed: true },
  amenities: { passed: true },
  photos: { passed: true },
  landlord_identity: { passed: true },
  safety: { passed: true },
};

async function main() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(`
      TRUNCATE TABLE users, students, landlords, ops_staff, semesters, properties,
      property_documents, verification_visits, listings, listing_versions,
      units, reservations, payments, refunds, move_ins, audit_log, notifications
      CASCADE
    `);

    const studentId = await insertUser(client, {
      phone: '+256700000001',
      email: 'student1@campushomes.ug',
      role: 'student',
      status: 'active',
      name: 'Student One',
    });

    const landlordId = await insertUser(client, {
      phone: '+256700000002',
      email: 'landlord1@campushomes.ug',
      role: 'landlord',
      status: 'active',
      name: 'Landlord One',
    });

    const opsLeadId = await insertUser(client, {
      phone: '+256700000003',
      email: 'opslead@campushomes.ug',
      role: 'ops_lead',
      status: 'active',
      name: 'Ops Lead',
    });

    const inspectorId = await insertUser(client, {
      phone: '+256700000004',
      email: 'inspector@campushomes.ug',
      role: 'ops_inspector',
      status: 'active',
      name: 'Inspector One',
    });

    await client.query(
      `INSERT INTO students (user_id, university, year_of_study) VALUES ($1, 'MUK', 2)`,
      [studentId],
    );

    await client.query(
      `INSERT INTO landlords (user_id, legal_name, kyc_status) VALUES ($1, 'Landlord One', 'verified')`,
      [landlordId],
    );

    await client.query(
      `INSERT INTO ops_staff (user_id, team, active) VALUES ($1, 'lead', true), ($2, 'inspector', true)`,
      [opsLeadId, inspectorId],
    );

    const semesterRes = await client.query(
      `INSERT INTO semesters (name, starts_on, ends_on, re_verification_window_starts_on)
       VALUES ('Semester 1 2026/27', '2026-08-01', '2026-12-15', '2026-11-15')
       RETURNING id`,
    );
    const semesterId = semesterRes.rows[0].id;

    const propertyRes = await client.query(
      `INSERT INTO properties (landlord_id, name, street_address, type, status, gps_lat, gps_lon)
       VALUES ($1, 'Test Hostel', 'Wandegeya', 'hostel', 'active', 0.33, 32.57)
       RETURNING id`,
      [landlordId],
    );
    const propertyId = propertyRes.rows[0].id;

    await client.query(
      `INSERT INTO verification_visits (
          property_id, inspector_id, checklist, client_idempotency_key,
          result, approved_by, approved_at, completed_at
        ) VALUES ($1, $2, $3, $4, 'passed', $5, now(), now())`,
      [propertyId, inspectorId, JSON.stringify(FULL_CHECKLIST), `seed-visit-${randomUUID()}`, opsLeadId],
    );

    const listingRes = await client.query(
      `INSERT INTO listings (property_id, semester_id, status)
       VALUES ($1, $2, 'pending_verification') RETURNING id`,
      [propertyId, semesterId],
    );
    const listingId = listingRes.rows[0].id;

    const versionRes = await client.query(
      `INSERT INTO listing_versions (
          listing_id, version_number, price_per_term_ugx, amenities,
          description, verified_at, verified_by
        ) VALUES ($1, 1, 800000, $2, $3, now(), $4) RETURNING id`,
      [listingId, JSON.stringify({ water: true, power: true }), 'Test listing for local dev', opsLeadId],
    );
    const versionId = versionRes.rows[0].id;

    await client.query(
      `UPDATE listings
       SET current_version_id = $1,
           status = 'verified',
           verified_at = now()
       WHERE id = $2`,
      [versionId, listingId],
    );

    await client.query(
      `INSERT INTO units (listing_id, label, capacity, available_for_semester_id)
       VALUES ($1, 'Room 1A', 1, $2)`,
      [listingId, semesterId],
    );

    await client.query('COMMIT');

    console.log(JSON.stringify({
      ok: true,
      created: {
        studentId,
        landlordId,
        opsLeadId,
        inspectorId,
        semesterId,
        propertyId,
        listingId,
        versionId,
      },
    }, null, 2));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function insertUser(client, { phone, email, role, status, name }) {
  const res = await client.query(
    `INSERT INTO users (phone, email, role, status, name)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [phone, email, role, status, name],
  );

  return res.rows[0].id;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
