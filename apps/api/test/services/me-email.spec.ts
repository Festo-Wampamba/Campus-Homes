/**
 * MeController.confirmEmailChange against the real docker test DB: a valid
 * emailed code applies the change (Logto + local), a wrong code is rejected
 * and counted, and Logto is only touched once ownership is proven.
 */
import { createHash } from 'node:crypto';

import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { Pool } from 'pg';

import { RlsDb } from '../../src/db/db.module';
import { LogtoEmailConflictError, LogtoManagementClient } from '../../src/modules/auth/logto-management.client';
import { MeController } from '../../src/modules/profile/me.controller';
import type { AuthenticatedRequest } from '../../src/modules/auth/auth.guard';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://campushomes:campushomes_test@localhost:54329/campushomes_test';

const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 5 });
const rlsDb = new RlsDb(pool);

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

function reqFor(userId: string): AuthenticatedRequest {
  return {
    effectiveRole: 'admin',
    session: {
      user: { id: userId },
      access: { roles: ['admin'], assurance: { mfaVerified: true } },
      session: { createdAt: new Date().toISOString() },
    },
  } as unknown as AuthenticatedRequest;
}

async function seedUser(email: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (logto_user_id, email, role, status, name)
     VALUES ($1, $2, 'admin', 'active', 'Staffer') RETURNING id`,
    [`logto-${email}`, email],
  );
  return rows[0]!.id;
}

async function seedRequest(userId: string, newEmail: string, code: string): Promise<void> {
  await pool.query(
    `INSERT INTO email_change_requests (user_id, new_email, code_hash, expires_at)
     VALUES ($1, $2, $3, now() + interval '15 minutes')`,
    [userId, newEmail, hashCode(code)],
  );
}

beforeAll(async () => {
  await pool.query(`TRUNCATE users RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await pool.end();
});

describe('MeController.confirmEmailChange', () => {
  it('applies the change at Logto and locally when the code matches', async () => {
    const updatePrimaryEmail = jest.fn().mockResolvedValue(undefined);
    const controller = new MeController(rlsDb, { updatePrimaryEmail } as unknown as LogtoManagementClient);
    const userId = await seedUser('before1@example.com');
    await seedRequest(userId, 'after1@example.com', '123456');

    const result = await controller.confirmEmailChange(reqFor(userId), { email: 'after1@example.com', code: '123456' });

    expect(result).toMatchObject({ email: 'after1@example.com' });
    expect(updatePrimaryEmail).toHaveBeenCalledWith(`logto-before1@example.com`, 'after1@example.com');
    const [row] = (await pool.query(`SELECT email_verified AS v FROM users WHERE id = $1`, [userId])).rows;
    expect(row.v).toBe(true);
  });

  it('consumes the request so the same code cannot be replayed', async () => {
    const controller = new MeController(rlsDb, { updatePrimaryEmail: jest.fn().mockResolvedValue(undefined) } as unknown as LogtoManagementClient);
    const userId = await seedUser('before2@example.com');
    await seedRequest(userId, 'after2@example.com', '654321');
    await controller.confirmEmailChange(reqFor(userId), { email: 'after2@example.com', code: '654321' });

    await expect(
      controller.confirmEmailChange(reqFor(userId), { email: 'after2@example.com', code: '654321' }),
    ).rejects.toThrow(/Request a verification code first/);
  });

  it('rejects a wrong code and counts the attempt without touching Logto', async () => {
    const updatePrimaryEmail = jest.fn();
    const controller = new MeController(rlsDb, { updatePrimaryEmail } as unknown as LogtoManagementClient);
    const userId = await seedUser('before3@example.com');
    await seedRequest(userId, 'after3@example.com', '111111');

    await expect(
      controller.confirmEmailChange(reqFor(userId), { email: 'after3@example.com', code: '000000' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(updatePrimaryEmail).not.toHaveBeenCalled();
    const [row] = (await pool.query(
      `SELECT attempts FROM email_change_requests WHERE user_id = $1`, [userId])).rows;
    expect(row.attempts).toBe(1);
  });

  it('maps a Logto duplicate-email rejection to a conflict', async () => {
    const controller = new MeController(rlsDb, {
      updatePrimaryEmail: jest.fn().mockRejectedValue(new LogtoEmailConflictError()),
    } as unknown as LogtoManagementClient);
    const userId = await seedUser('before4@example.com');
    await seedRequest(userId, 'after4@example.com', '222222');

    await expect(
      controller.confirmEmailChange(reqFor(userId), { email: 'after4@example.com', code: '222222' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
