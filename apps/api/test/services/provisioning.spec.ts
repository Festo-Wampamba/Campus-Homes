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
  });

  it('refuses to auto-create a user on the staff portal', async () => {
    const result = await provisioning.provision({ sub: 'logto-sub-new-staff', email: 'nobody@campushomes.ug' }, 'staff');
    expect(result).toBeNull();
  });

  it('links an existing unlinked user by phone on first sign-in, then never re-matches by email', async () => {
    const userId = await seed(
      `INSERT INTO users (phone, email, name, role, status) VALUES ($1, $2, $3, 'landlord', 'active') RETURNING id`,
      ['+256700000402', 'preexisting@campushomes.ug', 'Pre-existing Landlord'],
    );

    const firstLink = await provisioning.provision({ sub: 'logto-sub-link-1', phoneNumber: '+256700000402' }, 'consumer');
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
      provisioning.provision({ sub: 'logto-sub-hijack-attempt', phoneNumber: '+256700000403' }, 'consumer'),
    ).rejects.toThrow();
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
