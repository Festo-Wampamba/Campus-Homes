/**
 * RLS proof tests — brief §8: "RLS policies are tested, not assumed."
 *
 * Every test runs as the `app_user` DB role (exactly like the API runtime),
 * with identity bound via app.user_id / app.user_role session variables.
 * Prerequisite: docker compose -f docker-compose.test.yml up -d && pnpm db:migrate
 */
import { asIdentity, pool, seed } from './helpers';

// Seeded fixture ids
let landlord1: string;
let landlord2: string;
let student1: string;
let student2: string;
let opsLead: string;
let property1: string; // owned by landlord1, verified listing
let property2: string; // owned by landlord2, draft listing only
let listing1: string; // verified
let listing2: string; // draft
let unit1: string;
let unit2: string; // owned by landlord2, on the draft listing (listing2)
let version1: string;
let reservation1: string; // student1's held reservation on unit1
let payment1: string;
let unitPhoto1: string; // on unit1 (verified listing, landlord1)
let unitPhoto2: string; // on unit2 (draft listing, landlord2)

const FULL_CHECKLIST = JSON.stringify(
  Object.fromEntries(
    ['location_gps', 'rooms_capacity', 'amenities', 'photos', 'landlord_identity', 'safety'].map(
      (c) => [c, { passed: true }],
    ),
  ),
);

async function seedUser(role: string, phone: string): Promise<string> {
  return seed(
    `INSERT INTO users (phone, role, status) VALUES ($1, $2, 'active') RETURNING id`,
    [phone, role],
  );
}

beforeAll(async () => {
  await pool.query(
    `TRUNCATE users, students, landlords, ops_staff, semesters, properties,
     property_documents, verification_visits, listings, listing_versions,
     units, unit_photos, reservations, payments, refunds, move_ins, reviews,
     landlord_strikes, student_flags, audit_log CASCADE`,
  );

  landlord1 = await seedUser('landlord', '+256700000001');
  landlord2 = await seedUser('landlord', '+256700000002');
  student1 = await seedUser('student', '+256700000003');
  student2 = await seedUser('student', '+256700000004');
  opsLead = await seedUser('ops_lead', '+256700000005');
  const inspector = await seedUser('ops_inspector', '+256700000006');

  await seed(`INSERT INTO landlords (user_id, legal_name) VALUES ($1, 'Landlord One')`, [landlord1]);
  await seed(`INSERT INTO landlords (user_id, legal_name) VALUES ($1, 'Landlord Two')`, [landlord2]);
  await seed(`INSERT INTO students (user_id, university) VALUES ($1, 'MUK')`, [student1]);
  await seed(`INSERT INTO students (user_id, university) VALUES ($1, 'MUK')`, [student2]);
  await seed(`INSERT INTO ops_staff (user_id, team) VALUES ($1, 'lead')`, [opsLead]);
  await seed(`INSERT INTO ops_staff (user_id, team) VALUES ($1, 'inspector')`, [inspector]);

  const semester = await seed(
    `INSERT INTO semesters (name, starts_on, ends_on, re_verification_window_starts_on)
     VALUES ('Sem 1 2026/27', '2026-08-01', '2026-12-15', '2026-11-15') RETURNING id`,
  );

  property1 = await seed(
    `INSERT INTO properties (landlord_id, name, street_address, status, gps_lat, gps_lon, catchment)
     VALUES ($1, 'Hostel One', 'Wandegeya', 'active', 0.3345678, 32.5678901, 'MUK') RETURNING id`,
    [landlord1],
  );
  property2 = await seed(
    `INSERT INTO properties (landlord_id, name, street_address, status, catchment)
     VALUES ($1, 'Hostel Two', 'Kikoni', 'active', 'MUK') RETURNING id`,
    [landlord2],
  );

  // Passed, lead-approved visit with a complete checklist → property1 may verify.
  await seed(
    `INSERT INTO verification_visits
       (property_id, inspector_id, checklist, client_idempotency_key, result, approved_by, approved_at)
     VALUES ($1, $2, $3::jsonb, 'seed-visit-p1-0000', 'passed', $4, now()) RETURNING id`,
    [property1, inspector, FULL_CHECKLIST, opsLead],
  );

  listing1 = await seed(
    `INSERT INTO listings (property_id, semester_id, status, verified_at)
     VALUES ($1, $2, 'verified', now()) RETURNING id`,
    [property1, semester],
  );
  listing2 = await seed(
    `INSERT INTO listings (property_id, semester_id, status)
     VALUES ($1, $2, 'draft') RETURNING id`,
    [property2, semester],
  );

  version1 = await seed(
    `INSERT INTO listing_versions
       (listing_id, version_number, price_per_term_ugx, amenities, verified_at, verified_by)
     VALUES ($1, 1, 800000, '{"wifi": true}'::jsonb, now(), $2) RETURNING id`,
    [listing1, opsLead],
  );
  unit1 = await seed(
    `INSERT INTO units (listing_id, label, room_category, price_per_term_ugx, available_for_semester_id)
     VALUES ($1, 'Room 1A', 'single', 800000, $2) RETURNING id`,
    [listing1, semester],
  );
  unit2 = await seed(
    `INSERT INTO units (listing_id, label, room_category, price_per_term_ugx, available_for_semester_id)
     VALUES ($1, 'Room 2A', 'single', 700000, $2) RETURNING id`,
    [listing2, semester],
  );
  unitPhoto1 = await seed(
    `INSERT INTO unit_photos (unit_id, storage_key, uploaded_by) VALUES ($1, 'room1-photo', $2) RETURNING id`,
    [unit1, landlord1],
  );
  unitPhoto2 = await seed(
    `INSERT INTO unit_photos (unit_id, storage_key, uploaded_by) VALUES ($1, 'room2-photo', $2) RETURNING id`,
    [unit2, landlord2],
  );

  reservation1 = await seed(
    `INSERT INTO reservations
       (student_id, unit_id, listing_version_id, status, idempotency_key, hold_expires_at)
     VALUES ($1, $2, $3, 'held', 'seed-hold-s1-000000', now() + interval '72 hours') RETURNING id`,
    [student1, unit1, version1],
  );
  payment1 = await seed(
    `INSERT INTO payments (reservation_id, amount_ugx, payment_method, status)
     VALUES ($1, 5000, 'mtn_momo', 'pending') RETURNING id`,
    [reservation1],
  );

  await seed(
    `INSERT INTO audit_log (actor_id, actor_role, action, target_type, target_id, payload)
     VALUES ($1, 'ops_lead', 'listing.verify', 'listing', $2, '{}'::jsonb) RETURNING id`,
    [opsLead, listing1],
  );
});

afterAll(async () => {
  await pool.end();
});

describe('properties isolation', () => {
  it('landlord reads their own property', async () => {
    const rows = await asIdentity({ userId: landlord1, role: 'landlord' }, async (c) =>
      (await c.query('SELECT id FROM properties')).rows,
    );
    expect(rows.map((r) => r.id)).toEqual([property1]);
  });

  it("landlord cannot read another landlord's property", async () => {
    const rows = await asIdentity({ userId: landlord1, role: 'landlord' }, async (c) =>
      (await c.query('SELECT id FROM properties WHERE id = $1', [property2])).rows,
    );
    expect(rows).toHaveLength(0);
  });
});

describe('listings visibility', () => {
  it('anonymous sees only verified listings', async () => {
    const rows = await asIdentity({}, async (c) => (await c.query('SELECT id FROM listings')).rows);
    expect(rows.map((r) => r.id)).toEqual([listing1]);
  });

  it("landlord cannot see another landlord's draft listing", async () => {
    const rows = await asIdentity({ userId: landlord1, role: 'landlord' }, async (c) =>
      (await c.query('SELECT id FROM listings WHERE id = $1', [listing2])).rows,
    );
    expect(rows).toHaveLength(0);
  });

  it('the owning landlord sees their own draft', async () => {
    const rows = await asIdentity({ userId: landlord2, role: 'landlord' }, async (c) =>
      (await c.query('SELECT id FROM listings WHERE id = $1', [listing2])).rows,
    );
    expect(rows).toHaveLength(1);
  });
});

describe('reservations & payments isolation', () => {
  it("a student cannot read another student's reservation", async () => {
    const rows = await asIdentity({ userId: student2, role: 'student' }, async (c) =>
      (await c.query('SELECT id FROM reservations')).rows,
    );
    expect(rows).toHaveLength(0);
  });

  it("the unit's landlord can see the reservation", async () => {
    const rows = await asIdentity({ userId: landlord1, role: 'landlord' }, async (c) =>
      (await c.query('SELECT id FROM reservations WHERE id = $1', [reservation1])).rows,
    );
    expect(rows).toHaveLength(1);
  });

  it('the landlord can never read payment rows', async () => {
    const rows = await asIdentity({ userId: landlord1, role: 'landlord' }, async (c) =>
      (await c.query('SELECT id FROM payments WHERE id = $1', [payment1])).rows,
    );
    expect(rows).toHaveLength(0);
  });

  it('a student cannot INSERT a reservation directly (service-only writes)', async () => {
    await expect(
      asIdentity({ userId: student2, role: 'student' }, async (c) =>
        c.query(
          `INSERT INTO reservations (student_id, unit_id, listing_version_id, status, idempotency_key)
           VALUES ($1, $2, $3, 'held', 'attack-key-00000000')`,
          [student2, unit1, version1],
        ),
      ),
    ).rejects.toThrow(/row-level security|violates/i);
  });

  it('service_role can write reservations (the state machine path)', async () => {
    const rows = await asIdentity({ userId: opsLead, role: 'service_role' }, async (c) =>
      (
        await c.query(
          `UPDATE reservations SET status = 'payment_pending' WHERE id = $1 RETURNING status`,
          [reservation1],
        )
      ).rows,
    );
    expect(rows[0]?.status).toBe('payment_pending');
  });
});

describe('double-booking lock', () => {
  it('a second live hold on the same unit is rejected by the DB', async () => {
    await expect(
      asIdentity({ userId: opsLead, role: 'service_role' }, async (c) =>
        c.query(
          `INSERT INTO reservations (student_id, unit_id, listing_version_id, status, idempotency_key)
           SELECT $1, unit_id, listing_version_id, 'held', 'second-hold-0000000'
           FROM reservations WHERE id = $2`,
          [student2, reservation1],
        ),
      ),
    ).rejects.toThrow(/reservations_one_live_hold_per_unit/);
  });
});

describe('audit log', () => {
  it('a landlord cannot read the audit log', async () => {
    const rows = await asIdentity({ userId: landlord1, role: 'landlord' }, async (c) =>
      (await c.query('SELECT id FROM audit_log')).rows,
    );
    expect(rows).toHaveLength(0);
  });

  it('ops_lead can read the audit log', async () => {
    const rows = await asIdentity({ userId: opsLead, role: 'ops_lead' }, async (c) =>
      (await c.query('SELECT id FROM audit_log')).rows,
    );
    expect(rows).toHaveLength(1);
  });

  it('the app role cannot UPDATE audit rows even as service_role (append-only)', async () => {
    await expect(
      asIdentity({ userId: opsLead, role: 'service_role' }, async (c) =>
        c.query(`UPDATE audit_log SET action = 'tampered'`),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});

describe('verification invariant (6-component checklist)', () => {
  it('a listing without a lead-approved complete checklist cannot become verified', async () => {
    await expect(
      asIdentity({ userId: opsLead, role: 'ops_lead' }, async (c) =>
        c.query(`UPDATE listings SET status = 'verified' WHERE id = $1`, [listing2]),
      ),
    ).rejects.toThrow(/cannot be verified/);
  });
});

describe('reviews', () => {
  it('a student cannot review a reservation that is not fulfilled', async () => {
    await expect(
      asIdentity({ userId: student1, role: 'student' }, async (c) =>
        c.query(
          `INSERT INTO reviews (reservation_id, listing_version_id, student_id, amenity_match, overall_rating)
           SELECT id, listing_version_id, student_id, '{}'::jsonb, 4
           FROM reservations WHERE id = $1`,
          [reservation1],
        ),
      ),
    ).rejects.toThrow(/row-level security|fulfilled/i);
  });
});

describe('unit_photos isolation (0008)', () => {
  // Each asIdentity() call is its own transaction, always rolled back
  // (helpers.ts) — an INSERT in one test is invisible to the next, so
  // read/delete assertions exercise the beforeAll-seeded unitPhoto1/2
  // (seed() runs as the superuser, outside RLS, and actually persists)
  // rather than depending on another test's now-rolled-back write.
  it('a landlord can add a photo to their own room', async () => {
    const inserted = await asIdentity({ userId: landlord1, role: 'landlord' }, async (c) =>
      (
        await c.query(
          `INSERT INTO unit_photos (unit_id, storage_key, uploaded_by)
           VALUES ($1, 'room1-photo-2', $2) RETURNING id`,
          [unit1, landlord1],
        )
      ).rows,
    );
    expect(inserted).toHaveLength(1);
  });

  it("a landlord cannot add a photo to another landlord's room", async () => {
    await expect(
      asIdentity({ userId: landlord1, role: 'landlord' }, async (c) =>
        c.query(
          `INSERT INTO unit_photos (unit_id, storage_key, uploaded_by)
           VALUES ($1, 'attack-photo', $2)`,
          [unit2, landlord1],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("the public sees a verified listing's room photos", async () => {
    const rows = await asIdentity({}, async (c) =>
      (await c.query('SELECT id FROM unit_photos WHERE id = $1', [unitPhoto1])).rows,
    );
    expect(rows).toHaveLength(1);
  });

  it("the public cannot see a draft listing's room photos", async () => {
    const rows = await asIdentity({}, async (c) =>
      (await c.query('SELECT id FROM unit_photos WHERE id = $1', [unitPhoto2])).rows,
    );
    expect(rows).toHaveLength(0);
  });

  it('a landlord can delete a photo on their own room', async () => {
    const res = await asIdentity({ userId: landlord1, role: 'landlord' }, async (c) =>
      c.query(`DELETE FROM unit_photos WHERE id = $1`, [unitPhoto1]),
    );
    expect(res.rowCount).toBe(1);
  });

  it("a landlord cannot delete another landlord's room photo", async () => {
    const res = await asIdentity({ userId: landlord1, role: 'landlord' }, async (c) =>
      c.query(`DELETE FROM unit_photos WHERE id = $1`, [unitPhoto2]),
    );
    expect(res.rowCount).toBe(0);
  });
});

describe('units.operational_status (0024): off-platform-occupancy write path', () => {
  it("a landlord can flip their own room's operational_status", async () => {
    const res = await asIdentity({ userId: landlord1, role: 'landlord' }, async (c) =>
      c.query(`UPDATE units SET operational_status = 'occupied' WHERE id = $1`, [unit1]),
    );
    expect(res.rowCount).toBe(1);
  });

  it("a landlord cannot flip another landlord's room operational_status", async () => {
    const res = await asIdentity({ userId: landlord1, role: 'landlord' }, async (c) =>
      c.query(`UPDATE units SET operational_status = 'occupied' WHERE id = $1`, [unit2]),
    );
    expect(res.rowCount).toBe(0);
  });

  it("a landlord cannot write any other units column, even on their own room", async () => {
    await expect(
      asIdentity({ userId: landlord1, role: 'landlord' }, async (c) =>
        c.query(`UPDATE units SET price_per_term_ugx = 1 WHERE id = $1`, [unit1]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it("ops_lead can flip operational_status on any unit", async () => {
    const res = await asIdentity({ userId: opsLead, role: 'ops_lead' }, async (c) =>
      c.query(`UPDATE units SET operational_status = 'under_maintenance' WHERE id = $1`, [unit2]),
    );
    expect(res.rowCount).toBe(1);
  });

  it('ops_lead is also restricted to the operational_status column', async () => {
    await expect(
      asIdentity({ userId: opsLead, role: 'ops_lead' }, async (c) =>
        c.query(`UPDATE units SET price_per_term_ugx = 1 WHERE id = $1`, [unit1]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('a student cannot write operational_status at all', async () => {
    const res = await asIdentity({ userId: student1, role: 'student' }, async (c) =>
      c.query(`UPDATE units SET operational_status = 'occupied' WHERE id = $1`, [unit1]),
    );
    expect(res.rowCount).toBe(0);
  });
});

describe('auth infra (0002): accounts / verifications / sessions are service-only', () => {
  beforeAll(async () => {
    await pool.query('TRUNCATE accounts, verifications, sessions CASCADE');
    await seed(
      `INSERT INTO accounts (id, account_id, provider_id, user_id, password)
       VALUES (gen_random_uuid(), $1, 'credential', $2, 'not-a-real-hash') RETURNING id`,
      [student1, student1],
    );
    await seed(
      `INSERT INTO verifications (id, identifier, value, expires_at)
       VALUES (gen_random_uuid(), 'phone-otp-+256700000003', '123456', now() + interval '5 minutes')
       RETURNING id`,
    );
    await seed(
      `INSERT INTO sessions (id, user_id, token, expires_at)
       VALUES ('rls-test-session', $1, 'rls-test-token', now() + interval '1 day') RETURNING id`,
      [student1],
    );
  });

  it('a student cannot read account rows (password hashes)', async () => {
    const rows = await asIdentity({ userId: student1, role: 'student' }, async (c) =>
      c.query('SELECT * FROM accounts').then((r) => r.rows),
    );
    expect(rows).toHaveLength(0);
  });

  it('a student cannot read OTP verification values', async () => {
    const rows = await asIdentity({ userId: student1, role: 'student' }, async (c) =>
      c.query('SELECT * FROM verifications').then((r) => r.rows),
    );
    expect(rows).toHaveLength(0);
  });

  it('a student cannot insert an account for themselves', async () => {
    await expect(
      asIdentity({ userId: student1, role: 'student' }, async (c) =>
        c.query(
          `INSERT INTO accounts (id, account_id, provider_id, user_id)
           VALUES (gen_random_uuid(), $1, 'credential', $2)`,
          [student1, student1],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('service_role reads account rows', async () => {
    const rows = await asIdentity({ role: 'service_role' }, async (c) =>
      c.query('SELECT * FROM accounts').then((r) => r.rows),
    );
    expect(rows).toHaveLength(1);
  });

  it('service_role can delete a consumed verification', async () => {
    const res = await asIdentity({ role: 'service_role' }, async (c) =>
      c.query(`DELETE FROM verifications WHERE identifier = 'phone-otp-+256700000003'`),
    );
    expect(res.rowCount).toBe(1);
  });

  it('service_role can delete a session (sign-out path)', async () => {
    const res = await asIdentity({ role: 'service_role' }, async (c) =>
      c.query(`DELETE FROM sessions WHERE id = 'rls-test-session'`),
    );
    expect(res.rowCount).toBe(1);
  });
});

describe('rbac (0003): roles/permissions/assignments are service-only', () => {
  let opsLeadRoleId: string;
  let superAdminRoleId: string;
  let assignmentId: string;

  beforeAll(async () => {
    opsLeadRoleId = await seed(`SELECT id FROM roles WHERE key = 'ops_lead'`);
    superAdminRoleId = await seed(`SELECT id FROM roles WHERE key = 'super_admin'`);
    assignmentId = await seed(
      `INSERT INTO user_role_assignments (user_id, role_id, scope_type, scope_id, assigned_by, reason)
       VALUES ($1, $2, 'catchment', 'MUK', $1, 'rls test fixture') RETURNING id`,
      [opsLead, opsLeadRoleId],
    );
  });

  it('a landlord cannot read role assignments', async () => {
    const rows = await asIdentity({ userId: landlord1, role: 'landlord' }, async (c) =>
      c.query('SELECT * FROM user_role_assignments').then((r) => r.rows),
    );
    expect(rows).toHaveLength(0);
  });

  it('an admin-mapped identity cannot read the permission catalog directly', async () => {
    const rows = await asIdentity({ userId: opsLead, role: 'admin' }, async (c) =>
      c.query('SELECT * FROM permissions').then((r) => r.rows),
    );
    expect(rows).toHaveLength(0);
  });

  it('a landlord cannot read the roles table', async () => {
    const rows = await asIdentity({ userId: landlord1, role: 'landlord' }, async (c) =>
      c.query('SELECT * FROM roles').then((r) => r.rows),
    );
    expect(rows).toHaveLength(0);
  });

  it('a landlord cannot read role_permissions', async () => {
    const rows = await asIdentity({ userId: landlord1, role: 'landlord' }, async (c) =>
      c.query('SELECT * FROM role_permissions').then((r) => r.rows),
    );
    expect(rows).toHaveLength(0);
  });

  it('a landlord cannot read approval_requests', async () => {
    const rows = await asIdentity({ userId: landlord1, role: 'landlord' }, async (c) =>
      c.query('SELECT * FROM approval_requests').then((r) => r.rows),
    );
    expect(rows).toHaveLength(0);
  });

  it('a landlord cannot insert a role assignment for themselves', async () => {
    await expect(
      asIdentity({ userId: landlord1, role: 'landlord' }, async (c) =>
        c.query(
          `INSERT INTO user_role_assignments (user_id, role_id, scope_type, assigned_by, reason)
           VALUES ($1, $2, 'platform_wide', $1, 'self-grant attempt')`,
          [landlord1, superAdminRoleId],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('service_role reads role assignments', async () => {
    const rows = await asIdentity({ role: 'service_role' }, async (c) =>
      c.query('SELECT * FROM user_role_assignments').then((r) => r.rows),
    );
    expect(rows.map((r) => r.id)).toContain(assignmentId);
  });

  it('service_role can revoke a role assignment', async () => {
    const res = await asIdentity({ role: 'service_role' }, async (c) =>
      c.query(`UPDATE user_role_assignments SET revoked_at = now() WHERE id = $1`, [assignmentId]),
    );
    expect(res.rowCount).toBe(1);
  });
});

describe('calendar_events (0016): personal calendar, owner-only', () => {
  let event1: string; // owned by student1

  beforeAll(async () => {
    event1 = await seed(
      `INSERT INTO calendar_events (user_id, title, starts_at) VALUES ($1, 'Pay rent', now()) RETURNING id`,
      [student1],
    );
  });

  it('a user can insert their own calendar event', async () => {
    const rows = await asIdentity({ userId: student1, role: 'student' }, async (c) =>
      c
        .query(
          `INSERT INTO calendar_events (user_id, title, starts_at) VALUES ($1, 'Visit day', now()) RETURNING id`,
          [student1],
        )
        .then((r) => r.rows),
    );
    expect(rows).toHaveLength(1);
  });

  it('a user cannot insert a calendar event for someone else', async () => {
    await expect(
      asIdentity({ userId: student1, role: 'student' }, async (c) =>
        c.query(`INSERT INTO calendar_events (user_id, title, starts_at) VALUES ($1, 'Sneaky', now())`, [
          student2,
        ]),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('the owner reads their own event', async () => {
    const rows = await asIdentity({ userId: student1, role: 'student' }, async (c) =>
      c.query('SELECT * FROM calendar_events WHERE id = $1', [event1]).then((r) => r.rows),
    );
    expect(rows).toHaveLength(1);
  });

  it("another user cannot read someone else's calendar event", async () => {
    const rows = await asIdentity({ userId: student2, role: 'student' }, async (c) =>
      c.query('SELECT * FROM calendar_events WHERE id = $1', [event1]).then((r) => r.rows),
    );
    expect(rows).toHaveLength(0);
  });

  it("another user's UPDATE affects zero rows instead of leaking or erroring", async () => {
    const res = await asIdentity({ userId: student2, role: 'student' }, async (c) =>
      c.query(`UPDATE calendar_events SET done = true WHERE id = $1`, [event1]),
    );
    expect(res.rowCount).toBe(0);
  });

  it('the owner can mark their own event done', async () => {
    const res = await asIdentity({ userId: student1, role: 'student' }, async (c) =>
      c.query(`UPDATE calendar_events SET done = true WHERE id = $1`, [event1]),
    );
    expect(res.rowCount).toBe(1);
  });

  it('service_role reads across all users', async () => {
    const rows = await asIdentity({ role: 'service_role' }, async (c) =>
      c.query('SELECT * FROM calendar_events WHERE id = $1', [event1]).then((r) => r.rows),
    );
    expect(rows).toHaveLength(1);
  });
});

describe('activities (0017): staff ops board is service-only', () => {
  let activity1: string;

  beforeAll(async () => {
    activity1 = await seed(
      `INSERT INTO activities (title, starts_at, created_by, assigned_to)
       VALUES ('Landlord KYC review', now(), $1, $1) RETURNING id`,
      [opsLead],
    );
  });

  it('a landlord cannot read activities', async () => {
    const rows = await asIdentity({ userId: landlord1, role: 'landlord' }, async (c) =>
      c.query('SELECT * FROM activities').then((r) => r.rows),
    );
    expect(rows).toHaveLength(0);
  });

  it('an ops_lead cannot insert an activity directly (app-layer write only)', async () => {
    await expect(
      asIdentity({ userId: opsLead, role: 'ops_lead' }, async (c) =>
        c.query(`INSERT INTO activities (title, starts_at, created_by) VALUES ('Sneaky', now(), $1)`, [opsLead]),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('service_role reads across all activities', async () => {
    const rows = await asIdentity({ role: 'service_role' }, async (c) =>
      c.query('SELECT * FROM activities WHERE id = $1', [activity1]).then((r) => r.rows),
    );
    expect(rows).toHaveLength(1);
  });

  it('service_role can update and delete an activity', async () => {
    const update = await asIdentity({ role: 'service_role' }, async (c) =>
      c.query(`UPDATE activities SET status = 'done' WHERE id = $1`, [activity1]),
    );
    expect(update.rowCount).toBe(1);
    const del = await asIdentity({ role: 'service_role' }, async (c) =>
      c.query(`DELETE FROM activities WHERE id = $1`, [activity1]),
    );
    expect(del.rowCount).toBe(1);
  });
});

describe('visit_corrections (0029): ops-only read, service-only write', () => {
  let correctionInspector: string;
  let correctionVisit: string;
  let correction1: string;

  beforeAll(async () => {
    correctionInspector = await seedUser('ops_inspector', '+256700000020');
    await seed(`INSERT INTO ops_staff (user_id, team) VALUES ($1, 'inspector')`, [
      correctionInspector,
    ]);
    correctionVisit = await seed(
      `INSERT INTO verification_visits (property_id, inspector_id, checklist, client_idempotency_key)
       VALUES ($1, $2, '{}'::jsonb, 'seed-visit-corrections-0000') RETURNING id`,
      [property1, correctionInspector],
    );
    correction1 = await seed(
      `INSERT INTO visit_corrections (visit_id, component, message, raised_by)
       VALUES ($1, 'photos', 'Photos are blurry, retake them', $2) RETURNING id`,
      [correctionVisit, opsLead],
    );
  });

  it('a landlord cannot read visit corrections', async () => {
    const rows = await asIdentity({ userId: landlord1, role: 'landlord' }, async (c) =>
      c.query('SELECT * FROM visit_corrections').then((r) => r.rows),
    );
    expect(rows).toHaveLength(0);
  });

  it('an ops_lead can read visit corrections', async () => {
    const rows = await asIdentity({ userId: opsLead, role: 'ops_lead' }, async (c) =>
      c.query('SELECT * FROM visit_corrections WHERE id = $1', [correction1]).then((r) => r.rows),
    );
    expect(rows).toHaveLength(1);
  });

  it('an ops_lead cannot insert a correction directly (app-layer write only)', async () => {
    await expect(
      asIdentity({ userId: opsLead, role: 'ops_lead' }, async (c) =>
        c.query(
          `INSERT INTO visit_corrections (visit_id, component, message, raised_by)
           VALUES ($1, 'safety', 'Sneaky', $2)`,
          [correctionVisit, opsLead],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('service_role reads, updates and deletes across all corrections', async () => {
    const rows = await asIdentity({ role: 'service_role' }, async (c) =>
      c.query('SELECT * FROM visit_corrections WHERE id = $1', [correction1]).then((r) => r.rows),
    );
    expect(rows).toHaveLength(1);
    const update = await asIdentity({ role: 'service_role' }, async (c) =>
      c.query(`UPDATE visit_corrections SET status = 'resolved' WHERE id = $1`, [correction1]),
    );
    expect(update.rowCount).toBe(1);
    const del = await asIdentity({ role: 'service_role' }, async (c) =>
      c.query(`DELETE FROM visit_corrections WHERE id = $1`, [correction1]),
    );
    expect(del.rowCount).toBe(1);
  });
});

describe('inquiries (0028): student support desk is self-insert + service-only staff access', () => {
  let inquiry1: string;

  beforeAll(async () => {
    inquiry1 = await seed(
      `INSERT INTO inquiries (student_id, category, subject, message)
       VALUES ($1, 'reservation', 'Wrong room allocated', 'I reserved Room 1A but was told it is taken.') RETURNING id`,
      [student1],
    );
  });

  it('a student can submit their own inquiry', async () => {
    const rows = await asIdentity({ userId: student2, role: 'student' }, async (c) =>
      c
        .query(
          `INSERT INTO inquiries (student_id, category, subject, message)
           VALUES ($1, 'general', 'Payment options', 'Can I pay per month?') RETURNING id`,
          [student2],
        )
        .then((r) => r.rows),
    );
    expect(rows).toHaveLength(1);
  });

  it('a student cannot submit an inquiry for someone else', async () => {
    await expect(
      asIdentity({ userId: student2, role: 'student' }, async (c) =>
        c.query(
          `INSERT INTO inquiries (student_id, subject, message) VALUES ($1, 'Sneaky', 'spoofed author')`,
          [student1],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('the author reads their own inquiry', async () => {
    const rows = await asIdentity({ userId: student1, role: 'student' }, async (c) =>
      c.query('SELECT * FROM inquiries WHERE id = $1', [inquiry1]).then((r) => r.rows),
    );
    expect(rows).toHaveLength(1);
  });

  it("another student cannot read someone else's inquiry", async () => {
    const rows = await asIdentity({ userId: student2, role: 'student' }, async (c) =>
      c.query('SELECT * FROM inquiries WHERE id = $1', [inquiry1]).then((r) => r.rows),
    );
    expect(rows).toHaveLength(0);
  });

  it("the author's own-row UPDATE affects zero rows (no self-UPDATE policy)", async () => {
    const res = await asIdentity({ userId: student1, role: 'student' }, async (c) =>
      c.query(`UPDATE inquiries SET status = 'resolved' WHERE id = $1`, [inquiry1]),
    );
    expect(res.rowCount).toBe(0);
  });

  it('service_role reads and resolves any inquiry', async () => {
    const rows = await asIdentity({ role: 'service_role' }, async (c) =>
      c.query('SELECT * FROM inquiries WHERE id = $1', [inquiry1]).then((r) => r.rows),
    );
    expect(rows).toHaveLength(1);
    const res = await asIdentity({ role: 'service_role' }, async (c) =>
      c.query(
        `UPDATE inquiries SET status = 'resolved', resolved_at = now() WHERE id = $1`,
        [inquiry1],
      ),
    );
    expect(res.rowCount).toBe(1);
  });
});

describe('ledger (0018): finance chart of accounts + journal is service-only', () => {
  let cashAccountId: string;
  let revenueAccountId: string;
  let entry1: string;

  beforeAll(async () => {
    cashAccountId = await seed(`SELECT id FROM ledger_accounts WHERE code = '1000'`);
    revenueAccountId = await seed(`SELECT id FROM ledger_accounts WHERE code = '4000'`);
    entry1 = await seed(
      `INSERT INTO journal_entries (memo, source_type) VALUES ('Seed balanced entry', 'manual') RETURNING id`,
    );
    // Both lines in one statement: the balance trigger is DEFERRED to the
    // statement's own implicit commit (seed() has no explicit transaction),
    // so two separate INSERTs would each individually look unbalanced.
    await seed(
      `INSERT INTO journal_lines (entry_id, account_id, debit_ugx, credit_ugx) VALUES ($1, $2, 1000, 0), ($1, $3, 0, 1000)`,
      [entry1, cashAccountId, revenueAccountId],
    );
  });

  it('a landlord cannot read ledger_accounts, journal_entries, or journal_lines', async () => {
    const rows = await asIdentity({ userId: landlord1, role: 'landlord' }, async (c) => ({
      accounts: (await c.query('SELECT * FROM ledger_accounts')).rows,
      entries: (await c.query('SELECT * FROM journal_entries')).rows,
      lines: (await c.query('SELECT * FROM journal_lines')).rows,
    }));
    expect(rows.accounts).toHaveLength(0);
    expect(rows.entries).toHaveLength(0);
    expect(rows.lines).toHaveLength(0);
  });

  it('a non-service role cannot insert a journal line directly (app-layer write only)', async () => {
    await expect(
      asIdentity({ userId: opsLead, role: 'ops_lead' }, async (c) =>
        c.query(`INSERT INTO journal_lines (entry_id, account_id, debit_ugx) VALUES ($1, $2, 500)`, [
          entry1,
          cashAccountId,
        ]),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('service_role reads across all three tables', async () => {
    const rows = await asIdentity({ role: 'service_role' }, async (c) =>
      c.query('SELECT * FROM journal_lines WHERE entry_id = $1', [entry1]).then((r) => r.rows),
    );
    expect(rows).toHaveLength(2);
  });

  it('service_role can update ledger_accounts (e.g. deactivate a non-system account)', async () => {
    const update = await asIdentity({ role: 'service_role' }, async (c) =>
      c.query(`UPDATE ledger_accounts SET is_active = false WHERE id = $1`, [cashAccountId]),
    );
    expect(update.rowCount).toBe(1);
  });

  it('the app role cannot UPDATE or DELETE journal_entries even as service_role (append-only)', async () => {
    await expect(
      asIdentity({ role: 'service_role' }, async (c) =>
        c.query(`UPDATE journal_entries SET memo = 'tampered' WHERE id = $1`, [entry1]),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asIdentity({ role: 'service_role' }, async (c) => c.query(`DELETE FROM journal_entries WHERE id = $1`, [entry1])),
    ).rejects.toThrow(/permission denied/i);
  });

  it('the app role cannot UPDATE or DELETE journal_lines even as service_role (append-only)', async () => {
    await expect(
      asIdentity({ role: 'service_role' }, async (c) =>
        c.query(`UPDATE journal_lines SET debit_ugx = 1 WHERE entry_id = $1`, [entry1]),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asIdentity({ role: 'service_role' }, async (c) => c.query(`DELETE FROM journal_lines WHERE entry_id = $1`, [entry1])),
    ).rejects.toThrow(/permission denied/i);
  });

  it('an unbalanced journal entry is rejected by the deferred balance trigger', async () => {
    await expect(
      asIdentity({ role: 'service_role' }, async (c) => {
        const [unbalanced] = (
          await c.query(`INSERT INTO journal_entries (memo, source_type) VALUES ('Unbalanced', 'manual') RETURNING id`)
        ).rows;
        await c.query(`INSERT INTO journal_lines (entry_id, account_id, debit_ugx) VALUES ($1, $2, 700)`, [
          unbalanced.id,
          cashAccountId,
        ]);
        // The trigger is DEFERRABLE INITIALLY DEFERRED — it only fires at
        // COMMIT, but asIdentity() always rolls back. Force the check now.
        await c.query('SET CONSTRAINTS journal_lines_balanced IMMEDIATE');
      }),
    ).rejects.toThrow(/not balanced/i);
  });

  it('a balanced journal entry passes the deferred balance trigger', async () => {
    await expect(
      asIdentity({ role: 'service_role' }, async (c) => {
        const [balanced] = (
          await c.query(`INSERT INTO journal_entries (memo, source_type) VALUES ('Balanced', 'manual') RETURNING id`)
        ).rows;
        await c.query(`INSERT INTO journal_lines (entry_id, account_id, debit_ugx) VALUES ($1, $2, 400)`, [
          balanced.id,
          cashAccountId,
        ]);
        await c.query(`INSERT INTO journal_lines (entry_id, account_id, credit_ugx) VALUES ($1, $2, 400)`, [
          balanced.id,
          revenueAccountId,
        ]);
        await c.query('SET CONSTRAINTS journal_lines_balanced IMMEDIATE');
      }),
    ).resolves.not.toThrow();
  });
});

describe('tenant_agreement_templates / tenant_agreement_fields (0020): svc_all-only RLS', () => {
  // Authorization for these two tables is entirely service-layer mediated
  // (landlord-own / custodian-assigned / ops / public-for-filling) — see
  // tenant-agreements.service.ts assertCanManageTemplate(). RLS itself is
  // just "service_role only", same posture as `roles`/`activities`.
  it('a landlord cannot read tenant_agreement_templates directly', async () => {
    const rows = await asIdentity({ userId: landlord1, role: 'landlord' }, async (c) =>
      c.query('SELECT * FROM tenant_agreement_templates').then((r) => r.rows),
    );
    expect(rows).toHaveLength(0);
  });

  it('a non-service role cannot insert a template directly', async () => {
    await expect(
      asIdentity({ userId: landlord1, role: 'landlord' }, async (c) =>
        c.query(`INSERT INTO tenant_agreement_templates (property_id, created_by) VALUES ($1, $2)`, [
          property1,
          landlord1,
        ]),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('service_role can read and write templates directly', async () => {
    const rows = await asIdentity({ role: 'service_role' }, async (c) =>
      c
        .query(
          `INSERT INTO tenant_agreement_templates (property_id, created_by) VALUES ($1, $2) RETURNING id`,
          [property1, landlord1],
        )
        .then((r) => r.rows),
    );
    expect(rows).toHaveLength(1);
  });
});

describe('tenant_agreements (0020): QR-code tenant registration responses', () => {
  let templateId: string;
  let fieldId: string;
  let agreement1: string; // student1's signed agreement on property1 (landlord1)
  let custodian: string; // assigned to property1

  beforeAll(async () => {
    templateId = await seed(
      `INSERT INTO tenant_agreement_templates (property_id, created_by) VALUES ($1, $2) RETURNING id`,
      [property1, landlord1],
    );
    fieldId = await seed(
      `INSERT INTO tenant_agreement_fields (template_id, position, field_type, label)
       VALUES ($1, 0, 'fill_in', 'Room number') RETURNING id`,
      [templateId],
    );
    agreement1 = await seed(
      `INSERT INTO tenant_agreements (template_id, property_id, student_id, responses, signature_type, signed_name)
       VALUES ($1, $2, $3, $4::jsonb, 'typed', 'Student One') RETURNING id`,
      [
        templateId,
        property1,
        student1,
        JSON.stringify([{ fieldId, label: 'Room number', fieldType: 'fill_in', value: '2A' }]),
      ],
    );

    custodian = await seedUser('custodian', '+256700000007');
    await seed(
      `INSERT INTO property_memberships (user_id, property_id, role, assigned_by) VALUES ($1, $2, 'custodian', $3)`,
      [custodian, property1, landlord1],
    );
  });

  it('a student can insert their own tenant agreement', async () => {
    const rows = await asIdentity({ userId: student2, role: 'student' }, async (c) =>
      c
        .query(
          `INSERT INTO tenant_agreements (template_id, property_id, student_id, responses, signature_type, signed_name)
           VALUES ($1, $2, $3, '[]'::jsonb, 'typed', 'Student Two') RETURNING id`,
          [templateId, property1, student2],
        )
        .then((r) => r.rows),
    );
    expect(rows).toHaveLength(1);
  });

  it('a student cannot insert a tenant agreement for someone else', async () => {
    await expect(
      asIdentity({ userId: student1, role: 'student' }, async (c) =>
        c.query(
          `INSERT INTO tenant_agreements (template_id, property_id, student_id, responses, signature_type, signed_name)
           VALUES ($1, $2, $3, '[]'::jsonb, 'typed', 'Sneaky')`,
          [templateId, property1, student2],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('a non-student cannot insert a tenant agreement even for themselves', async () => {
    await expect(
      asIdentity({ userId: landlord1, role: 'landlord' }, async (c) =>
        c.query(
          `INSERT INTO tenant_agreements (template_id, property_id, student_id, responses, signature_type, signed_name)
           VALUES ($1, $2, $3, '[]'::jsonb, 'typed', 'Not a student')`,
          [templateId, property1, landlord1],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('the submitting student reads their own agreement', async () => {
    const rows = await asIdentity({ userId: student1, role: 'student' }, async (c) =>
      c.query('SELECT * FROM tenant_agreements WHERE id = $1', [agreement1]).then((r) => r.rows),
    );
    expect(rows).toHaveLength(1);
  });

  it("another student cannot read someone else's tenant agreement", async () => {
    const rows = await asIdentity({ userId: student2, role: 'student' }, async (c) =>
      c.query('SELECT * FROM tenant_agreements WHERE id = $1', [agreement1]).then((r) => r.rows),
    );
    expect(rows).toHaveLength(0);
  });

  it('the property owner (landlord1) reads agreements on their own property', async () => {
    const rows = await asIdentity({ userId: landlord1, role: 'landlord' }, async (c) =>
      c.query('SELECT * FROM tenant_agreements WHERE id = $1', [agreement1]).then((r) => r.rows),
    );
    expect(rows).toHaveLength(1);
  });

  it("a different landlord cannot read another landlord's property agreements", async () => {
    const rows = await asIdentity({ userId: landlord2, role: 'landlord' }, async (c) =>
      c.query('SELECT * FROM tenant_agreements WHERE id = $1', [agreement1]).then((r) => r.rows),
    );
    expect(rows).toHaveLength(0);
  });

  it('an assigned custodian reads agreements on their assigned property', async () => {
    const rows = await asIdentity({ userId: custodian, role: 'custodian' }, async (c) =>
      c.query('SELECT * FROM tenant_agreements WHERE id = $1', [agreement1]).then((r) => r.rows),
    );
    expect(rows).toHaveLength(1);
  });

  it('ops reads across every property', async () => {
    const rows = await asIdentity({ userId: opsLead, role: 'ops_lead' }, async (c) =>
      c.query('SELECT * FROM tenant_agreements WHERE id = $1', [agreement1]).then((r) => r.rows),
    );
    expect(rows).toHaveLength(1);
  });

  it('a second agreement for the same student+property is rejected (one signature per tenancy)', async () => {
    await expect(
      asIdentity({ userId: student1, role: 'student' }, async (c) =>
        c.query(
          `INSERT INTO tenant_agreements (template_id, property_id, student_id, responses, signature_type, signed_name)
           VALUES ($1, $2, $3, '[]'::jsonb, 'typed', 'Student One Again')`,
          [templateId, property1, student1],
        ),
      ),
    ).rejects.toThrow(/duplicate key|unique constraint/i);
  });
});
