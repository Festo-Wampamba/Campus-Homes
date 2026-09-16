import type { PoolClient } from 'pg';

import type { RlsContext } from '../../src/db/rls-context';
import { AuditService } from '../../src/modules/ops/audit.service';
import type { LogtoManagementClient } from '../../src/modules/auth/logto-management.client';
import { AdminUsersService } from '../../src/modules/staff/admin-users.service';
import { pool } from './helpers';

// Runs the *real* purge cascade against the docker DB as the low-privilege
// app_user role with the service_role GUC — exactly the runtime path. This is
// the only place the successive-grant regressions (migrations 0042→0045) are
// caught: the mocked unit spec cannot execute a single DELETE, and a missing
// GRANT / FK / not-null gap surfaces only when Postgres actually runs the
// statements. Everything happens inside one transaction that is always rolled
// back, so nothing leaks into the shared suite DB.
async function inPurgeTx<T>(fn: (client: PoolClient, target: string) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Seed a full owned footprint as the superuser owner (RLS off, triggers on).
    const target = (
      await client.query(
        `INSERT INTO users (phone, role, status, deleted_at)
         VALUES ('+256780000001', 'landlord', 'active', now()) RETURNING id`,
      )
    ).rows[0].id as string;
    const studentUser = (
      await client.query(
        `INSERT INTO users (phone, role, status) VALUES ('+256780000002', 'student', 'active') RETURNING id`,
      )
    ).rows[0].id as string;

    const opsUser = (
      await client.query(
        `INSERT INTO users (phone, role, status) VALUES ('+256780000003', 'ops_inspector', 'active') RETURNING id`,
      )
    ).rows[0].id as string;

    await client.query(`INSERT INTO landlords (user_id, legal_name) VALUES ($1, 'Purge LL')`, [target]);
    await client.query(`INSERT INTO students (user_id, university) VALUES ($1, 'MUK')`, [studentUser]);
    await client.query(`INSERT INTO ops_staff (user_id, team) VALUES ($1, 'inspector')`, [opsUser]);

    const semester = (
      await client.query(
        `INSERT INTO semesters (name, starts_on, ends_on, re_verification_window_starts_on)
         VALUES ('Purge Sem', '2026-08-01', '2026-12-15', '2026-11-15') RETURNING id`,
      )
    ).rows[0].id as string;
    const property = (
      await client.query(
        `INSERT INTO properties (landlord_id, name, street_address, status, catchment)
         VALUES ($1, 'Purge Hostel', 'Wandegeya', 'active', 'MUK') RETURNING id`,
        [target],
      )
    ).rows[0].id as string;
    const listing = (
      await client.query(
        `INSERT INTO listings (property_id, semester_id, status) VALUES ($1, $2, 'draft') RETURNING id`,
        [property, semester],
      )
    ).rows[0].id as string;
    const version = (
      await client.query(
        `INSERT INTO listing_versions
           (listing_id, version_number, price_per_term_ugx, amenities, verified_at, verified_by)
         VALUES ($1, 1, 800000, '{"wifi": true}'::jsonb, now(), $2) RETURNING id`,
        [listing, opsUser],
      )
    ).rows[0].id as string;
    const unit = (
      await client.query(
        `INSERT INTO units (property_id, label, room_category) VALUES ($1, 'Room P1', 'single') RETURNING id`,
        [property],
      )
    ).rows[0].id as string;
    const bed = (
      await client.query(`INSERT INTO beds (unit_id, label) VALUES ($1, 'Bed 1') RETURNING id`, [unit])
    ).rows[0].id as string;
    await client.query(
      `INSERT INTO unit_photos (unit_id, storage_key, uploaded_by) VALUES ($1, 'p1-photo', $2)`,
      [unit, target],
    );

    const reservation = (
      await client.query(
        `INSERT INTO reservations
           (student_id, bed_id, listing_version_id, status, idempotency_key, reserved_expires_at, price_per_term_ugx)
         VALUES ($1, $2, $3, 'reserved', 'purge-hold-000001', now() + interval '24 hours', 800000) RETURNING id`,
        [studentUser, bed, version],
      )
    ).rows[0].id as string;
    await client.query(
      `INSERT INTO payments (reservation_id, amount_ugx, payment_method, status)
       VALUES ($1, 5000, 'mtn_momo', 'pending')`,
      [reservation],
    );

    const thread = (
      await client.query(
        `INSERT INTO chat_threads (reservation_id, student_id, landlord_id) VALUES ($1, $2, $3) RETURNING id`,
        [reservation, studentUser, target],
      )
    ).rows[0].id as string;
    await client.query(
      `INSERT INTO chat_messages (thread_id, from_user_id, body) VALUES ($1, $2, 'hi')`,
      [thread, target],
    );

    // Actor references that must survive the purge, anonymized to NULL.
    await client.query(
      `INSERT INTO inquiries (student_id, subject, message, listing_id, landlord_id)
       VALUES ($1, 'Q', 'body', $2, $3)`,
      [studentUser, listing, target],
    );
    await client.query(
      `INSERT INTO audit_log (actor_id, actor_role, action, target_type, target_id, payload)
       VALUES ($1, 'landlord', 'listing.submit', 'listing', $2, '{}'::jsonb)`,
      [target, listing],
    );
    await client.query(
      `INSERT INTO report_exports (report_type, format, created_by) VALUES ('occupancy', 'csv', $1)`,
      [target],
    );
    await client.query(
      `INSERT INTO user_role_assignments (user_id, role_id, scope_type, assigned_by, reason)
       SELECT $1, id, 'platform_wide', $2, 'purge fixture' FROM roles LIMIT 1`,
      [studentUser, target],
    );

    // Switch to the runtime identity: restricted role + service_role context.
    await client.query('SET LOCAL ROLE app_user');
    await client.query(
      `SELECT set_config('app.user_id', '00000000-0000-0000-0000-000000000000', true),
              set_config('app.user_role', 'service_role', true),
              set_config('app.mfa_verified', 'true', true)`,
    );

    return await fn(client, target);
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
  }
}

/** Drives the real service against a client already inside the purge transaction. */
function serviceFor(client: PoolClient): AdminUsersService {
  const rlsDb = {
    run: (_ctx: RlsContext, fn: (db: unknown, c: PoolClient) => Promise<unknown>) => fn(undefined, client),
  };
  const audit = { record: async () => undefined } as unknown as AuditService;
  return new AdminUsersService(rlsDb as never, audit, {} as LogtoManagementClient);
}

const actor: RlsContext = { userId: '00000000-0000-4000-8000-00000000dead', role: 'admin' };

afterAll(async () => {
  await pool.end();
});

describe('purge cascade (runs as the real app_user role)', () => {
  it('completes the whole cascade — every DELETE/UPDATE grant, FK and privilege the purge needs', async () => {
    await inPurgeTx(async (client, target) => {
      await expect(serviceFor(client).purgeUser(actor, new Set(), target)).resolves.toEqual({
        id: target,
        purged: true,
      });

      await client.query('RESET ROLE');
      const users = await client.query('SELECT id FROM users WHERE id = $1', [target]);
      expect(users.rowCount).toBe(0);
    });
  });

  it('removes the owned footprint (property, reservation, chat)', async () => {
    await inPurgeTx(async (client, target) => {
      await serviceFor(client).purgeUser(actor, new Set(), target);
      await client.query('RESET ROLE');

      const props = await client.query('SELECT id FROM properties WHERE landlord_id = $1', [target]);
      const chat = await client.query('SELECT id FROM chat_messages WHERE from_user_id = $1', [target]);
      expect(props.rowCount).toBe(0);
      expect(chat.rowCount).toBe(0);
    });
  });

  it('retains append-only history with the actor anonymized to NULL', async () => {
    await inPurgeTx(async (client, target) => {
      await serviceFor(client).purgeUser(actor, new Set(), target);
      await client.query('RESET ROLE');

      const audit = await client.query(
        `SELECT actor_id FROM audit_log WHERE action = 'listing.submit'`,
      );
      const reports = await client.query(`SELECT created_by FROM report_exports WHERE report_type = 'occupancy'`);
      expect(audit.rowCount).toBe(1);
      expect(audit.rows[0].actor_id).toBeNull();
      expect(reports.rowCount).toBe(1);
      expect(reports.rows[0].created_by).toBeNull();
    });
  });
});

// Purging a STAFF user (ops inspector/lead) is a different footprint from a
// landlord: they own no properties, but their ops_staff row is referenced as
// the actor on OTHER landlords' visits/versions. Those FKs (0046) are ON DELETE
// SET NULL, so the delete completes and the inspection history survives with the
// actor anonymized — the exact case that used to 500.
async function inStaffPurgeTx<T>(fn: (client: PoolClient, target: string) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const landlord = (
      await client.query(
        `INSERT INTO users (phone, role, status) VALUES ('+256780000010', 'landlord', 'active') RETURNING id`,
      )
    ).rows[0].id as string;
    await client.query(`INSERT INTO landlords (user_id, legal_name) VALUES ($1, 'Other LL')`, [landlord]);

    // The target: an inspector, already soft-deleted (purge precondition).
    const inspector = (
      await client.query(
        `INSERT INTO users (phone, role, status, deleted_at)
         VALUES ('+256780000011', 'ops_inspector', 'active', now()) RETURNING id`,
      )
    ).rows[0].id as string;
    await client.query(`INSERT INTO ops_staff (user_id, team) VALUES ($1, 'inspector')`, [inspector]);

    const semester = (
      await client.query(
        `INSERT INTO semesters (name, starts_on, ends_on, re_verification_window_starts_on)
         VALUES ('Staff Purge Sem', '2026-08-01', '2026-12-15', '2026-11-15') RETURNING id`,
      )
    ).rows[0].id as string;
    const property = (
      await client.query(
        `INSERT INTO properties (landlord_id, name, street_address, status, catchment)
         VALUES ($1, 'Other Hostel', 'Wandegeya', 'active', 'MUK') RETURNING id`,
        [landlord],
      )
    ).rows[0].id as string;
    // The inspector ran and approved this visit — inspector_id + approved_by.
    await client.query(
      `INSERT INTO verification_visits
         (property_id, inspector_id, checklist, client_idempotency_key, result, approved_by, approved_at)
       VALUES ($1, $2, '{}'::jsonb, 'staff-purge-visit', 'passed', $2, now())`,
      [property, inspector],
    );
    const listing = (
      await client.query(
        `INSERT INTO listings (property_id, semester_id, status) VALUES ($1, $2, 'draft') RETURNING id`,
        [property, semester],
      )
    ).rows[0].id as string;
    // ...and verified this listing version — verified_by.
    await client.query(
      `INSERT INTO listing_versions
         (listing_id, version_number, price_per_term_ugx, amenities, verified_at, verified_by)
       VALUES ($1, 1, 800000, '{}'::jsonb, now(), $2)`,
      [listing, inspector],
    );

    await client.query('SET LOCAL ROLE app_user');
    await client.query(
      `SELECT set_config('app.user_id', '00000000-0000-0000-0000-000000000000', true),
              set_config('app.user_role', 'service_role', true),
              set_config('app.mfa_verified', 'true', true)`,
    );

    return await fn(client, inspector);
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
  }
}

describe('purge cascade for a staff user (ops inspector)', () => {
  it('deletes the inspector and keeps their inspection history with the actor nulled', async () => {
    await inStaffPurgeTx(async (client, inspector) => {
      await expect(serviceFor(client).purgeUser(actor, new Set(), inspector)).resolves.toEqual({
        id: inspector,
        purged: true,
      });

      await client.query('RESET ROLE');
      const users = await client.query('SELECT id FROM users WHERE id = $1', [inspector]);
      const visit = await client.query(
        `SELECT inspector_id, approved_by FROM verification_visits WHERE client_idempotency_key = 'staff-purge-visit'`,
      );
      const version = await client.query(
        `SELECT verified_by FROM listing_versions WHERE verified_by IS NULL`,
      );
      expect(users.rowCount).toBe(0);
      expect(visit.rowCount).toBe(1);
      expect(visit.rows[0].inspector_id).toBeNull();
      expect(visit.rows[0].approved_by).toBeNull();
      expect(version.rowCount).toBe(1);
    });
  });
});
