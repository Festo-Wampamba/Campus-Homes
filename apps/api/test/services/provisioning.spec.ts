/**
 * ProvisioningService against the real docker test DB: JIT user creation,
 * verified-subject linking to an existing unlinked user, the fast path for
 * an already-linked sub, staff invite-only enforcement, and the double-click
 * race on a never-before-seen sub.
 */
import { Pool } from 'pg';

import { RlsDb } from '../../src/db/db.module';
import { ProvisioningService } from '../../src/modules/auth/provisioning.service';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://campushomes:campushomes_test@localhost:54329/campushomes_test';

const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 5 });
const rlsDb = new RlsDb(pool);
const provisioning = new ProvisioningService(rlsDb);

async function seed(sql: string, params: unknown[] = []): Promise<string> {
  const res = await pool.query(sql, params);
  return res.rows[0]?.id as string;
}

beforeAll(async () => {
  await pool.query(`TRUNCATE users RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await pool.end();
});

describe('ProvisioningService', () => {
  it('creates a new student on the consumer portal for a never-seen identity', async () => {
    const result = await provisioning.provision(
      { sub: 'logto-sub-new-1', phoneNumber: '+256700000401', name: 'New Student' },
      'consumer',
    );
    expect(result).not.toBeNull();
    expect(result?.role).toBe('student');
    expect(result?.status).toBe('active');
    const [row] = (await pool.query(`SELECT logto_user_id FROM users WHERE id = $1`, [result?.id])).rows;
    expect(row.logto_user_id).toBe('logto-sub-new-1');
    expect((await pool.query(`
      SELECT r.key, a.scope_type FROM user_role_assignments a
      JOIN roles r ON r.id = a.role_id WHERE a.user_id = $1 AND a.revoked_at IS NULL
    `, [result?.id])).rows).toEqual([{ key: 'student', scope_type: 'own' }]);
  });

  it('refuses to auto-create a user on the staff portal', async () => {
    const result = await provisioning.provision({ sub: 'logto-sub-new-staff', email: 'nobody@campushomes.ug' }, 'staff');
    expect(result).toBeNull();
  });

  it('atomically creates and grants an invited staff identity after verified sign-in', async () => {
    const inviter = await seed(
      `INSERT INTO users (phone, role, status, name) VALUES ($1, 'admin', 'active', 'Inviter') RETURNING id`,
      ['+256700000405'],
    );
    const invitation = await seed(`
      INSERT INTO auth_invitations
        (name, email, role_key, scope_type, reason, invited_by, expires_at)
      VALUES ('Invited Support', 'invited.support@example.com', 'support_admin',
        'platform_wide', 'approved hire', $1, now() + interval '7 days')
      RETURNING id
    `, [inviter]);

    const result = await provisioning.provision({
      sub: 'logto-invited-support',
      email: 'INVITED.SUPPORT@example.com',
      emailVerified: true,
      name: 'Invited Support',
    }, 'consumer');

    expect(result).toMatchObject({ role: 'admin', status: 'active' });
    expect((await pool.query(`
      SELECT r.key, a.scope_type FROM user_role_assignments a
      JOIN roles r ON r.id = a.role_id WHERE a.user_id = $1 AND a.revoked_at IS NULL
    `, [result?.id])).rows).toEqual([{ key: 'support_admin', scope_type: 'platform_wide' }]);
    expect((await pool.query(
      `SELECT status, accepted_by, assignment_id FROM auth_invitations WHERE id = $1`,
      [invitation],
    )).rows[0]).toMatchObject({ status: 'accepted', accepted_by: result?.id });
  });

  it('does not accept a staff invitation from an unverified contact claim', async () => {
    const inviter = await seed(
      `INSERT INTO users (phone, role, status, name) VALUES ($1, 'admin', 'active', 'Inviter Two') RETURNING id`,
      ['+256700000406'],
    );
    const invitation = await seed(`
      INSERT INTO auth_invitations
        (name, email, role_key, scope_type, reason, invited_by, expires_at)
      VALUES ('Unverified Invite', 'unverified.invite@example.com', 'support_admin',
        'platform_wide', 'approved hire', $1, now() + interval '7 days')
      RETURNING id
    `, [inviter]);
    const result = await provisioning.provision({
      sub: 'logto-unverified-invite',
      email: 'unverified.invite@example.com',
      emailVerified: false,
    }, 'consumer');
    expect(result?.role).toBe('student');
    expect((await pool.query(
      `SELECT status FROM auth_invitations WHERE id = $1`,
      [invitation],
    )).rows[0].status).toBe('pending');
  });

  it('requires every contact on an untargeted dual-contact invitation to be verified', async () => {
    const inviter = await seed(
      `INSERT INTO users (phone, role, status, name) VALUES ($1, 'admin', 'active', 'Inviter Three') RETURNING id`,
      ['+256700000407'],
    );
    const invitation = await seed(`
      INSERT INTO auth_invitations
        (name, email, phone, role_key, scope_type, reason, invited_by, expires_at)
      VALUES ('Dual Contact Invite', 'dual.invite@example.com', '+256700000408', 'support_admin',
        'platform_wide', 'approved hire', $1, now() + interval '7 days')
      RETURNING id
    `, [inviter]);

    const result = await provisioning.provision({
      sub: 'logto-dual-contact-partial',
      email: 'dual.invite@example.com',
      emailVerified: true,
    }, 'consumer');

    expect(result?.role).toBe('student');
    expect((await pool.query(
      `SELECT status FROM auth_invitations WHERE id = $1`,
      [invitation],
    )).rows[0].status).toBe('pending');
  });

  it('allows either verified contact when the invitation is bound to that exact account', async () => {
    const inviter = await seed(
      `INSERT INTO users (phone, role, status, name) VALUES ($1, 'admin', 'active', 'Inviter Four') RETURNING id`,
      ['+256700000409'],
    );
    const target = await seed(
      `INSERT INTO users (phone, email, role, status, name, logto_user_id)
       VALUES ($1, $2, 'student', 'active', 'Existing Invitee', $3) RETURNING id`,
      ['+256700000410', 'existing.invitee@example.com', 'logto-existing-invitee'],
    );
    const invitation = await seed(`
      INSERT INTO auth_invitations
        (name, email, phone, role_key, scope_type, reason, invited_by, target_user_id, expires_at)
      VALUES ('Existing Invitee', 'existing.invitee@example.com', '+256700000410', 'support_admin',
        'platform_wide', 'approved hire', $1, $2, now() + interval '7 days')
      RETURNING id
    `, [inviter, target]);

    const result = await provisioning.provision({
      sub: 'logto-existing-invitee',
      email: 'existing.invitee@example.com',
      emailVerified: true,
    }, 'consumer');

    expect(result?.id).toBe(target);
    expect((await pool.query(
      `SELECT status, accepted_by FROM auth_invitations WHERE id = $1`,
      [invitation],
    )).rows[0]).toMatchObject({ status: 'accepted', accepted_by: target });
  });

  it('links an existing unlinked user by phone on first sign-in, then never re-matches by email', async () => {
    const userId = await seed(
      `INSERT INTO users (phone, email, name, role, status) VALUES ($1, $2, $3, 'landlord', 'active') RETURNING id`,
      ['+256700000402', 'preexisting@campushomes.ug', 'Pre-existing Landlord'],
    );

    const firstLink = await provisioning.provision({
      sub: 'logto-sub-link-1', phoneNumber: '+256700000402', phoneVerified: true,
    }, 'consumer');
    expect(firstLink?.id).toBe(userId);

    // Second sign-in, different email claim entirely — must still resolve to
    // the same user via the already-recorded logto_user_id, never by
    // re-matching email (verified-subject linking, not email-derived).
    const secondSignIn = await provisioning.provision(
      { sub: 'logto-sub-link-1', email: 'a-different-email@campushomes.ug' },
      'consumer',
    );
    expect(secondSignIn?.id).toBe(userId);
    const [row] = (await pool.query(`SELECT email FROM users WHERE id = $1`, [userId])).rows;
    expect(row.email).toBe('preexisting@campushomes.ug');
  });

  it('never silently hijacks an already-linked candidate for a second Logto identity', async () => {
    await seed(
      `INSERT INTO users (phone, name, role, status, logto_user_id) VALUES ($1, $2, 'student', 'active', $3) RETURNING id`,
      ['+256700000403', 'Already Linked', 'logto-sub-already-linked'],
    );

    // A different, never-seen sub claiming the same phone number: the
    // unlinked-candidate search correctly excludes the already-linked row,
    // and the fallback new-user insert then fails on the phone's own unique
    // constraint — this must surface as a real error, not a silent hijack
    // of the existing account or a fabricated new row with a duplicate phone.
    await expect(
      provisioning.provision({
        sub: 'logto-sub-hijack-attempt', phoneNumber: '+256700000403', phoneVerified: true,
      }, 'consumer'),
    ).rejects.toThrow('Verified contact is already linked to another identity');
  });

  it('handles a concurrent double-click for the same never-seen sub without creating duplicate rows', async () => {
    const sub = 'logto-sub-race';
    const [a, b] = await Promise.all([
      provisioning.provision({ sub, phoneNumber: '+256700000404', name: 'Race Condition' }, 'consumer'),
      provisioning.provision({ sub, phoneNumber: '+256700000404', name: 'Race Condition' }, 'consumer'),
    ]);
    expect(a?.id).toBe(b?.id);
    const rows = (await pool.query(`SELECT id FROM users WHERE logto_user_id = $1`, [sub])).rows;
    expect(rows).toHaveLength(1);
  });
});
