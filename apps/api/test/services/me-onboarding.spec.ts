/**
 * MeController.completeOnboarding against the real docker test DB: sets name +
 * a lowercased username, and rejects a case-insensitive duplicate handle.
 */
import { ConflictException } from '@nestjs/common';
import { Pool } from 'pg';

import { RlsDb } from '../../src/db/db.module';
import { LogtoManagementClient } from '../../src/modules/auth/logto-management.client';
import { MeController } from '../../src/modules/profile/me.controller';
import type { AuthenticatedRequest } from '../../src/modules/auth/auth.guard';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://campushomes:campushomes_test@localhost:54329/campushomes_test';

const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 5 });
const rlsDb = new RlsDb(pool);
const controller = new MeController(rlsDb, {} as unknown as LogtoManagementClient);

function reqFor(userId: string): AuthenticatedRequest {
  return {
    effectiveRole: 'student',
    session: {
      user: { id: userId },
      access: { roles: ['student'], assurance: { mfaVerified: false } },
      session: { createdAt: new Date().toISOString() },
    },
  } as unknown as AuthenticatedRequest;
}

async function seedUser(phone: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (phone, role, status) VALUES ($1, 'student', 'active') RETURNING id`,
    [phone],
  );
  return rows[0]!.id;
}

beforeAll(async () => {
  await pool.query(`TRUNCATE users RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await pool.end();
});

describe('MeController.completeOnboarding', () => {
  it('stores the full name and a lowercased username', async () => {
    const userId = await seedUser('+256700000501');
    await controller.completeOnboarding(reqFor(userId), { name: 'Jane Doe', username: 'JaneDoe' });
    const [row] = (await pool.query(`SELECT name, username FROM users WHERE id = $1`, [userId])).rows;
    expect(row).toEqual({ name: 'Jane Doe', username: 'janedoe' });
  });

  it('rejects a username already taken in a different case', async () => {
    const first = await seedUser('+256700000502');
    await controller.completeOnboarding(reqFor(first), { name: 'First', username: 'sharedhandle' });
    const second = await seedUser('+256700000503');
    await expect(
      controller.completeOnboarding(reqFor(second), { name: 'Second', username: 'SharedHandle' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
