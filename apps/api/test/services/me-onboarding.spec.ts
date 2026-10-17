/**
 * MeController.completeOnboarding against the real docker test DB: sets name,
 * a lowercased username and a contact phone, and rejects a case-insensitive
 * duplicate handle.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { BadRequestException, ConflictException } from '@nestjs/common';
import { Pool } from 'pg';

import { profileOnboardingSchema } from '@campushomes/shared';

import { RlsDb } from '../../src/db/db.module';
import { LogtoManagementClient } from '../../src/modules/auth/logto-management.client';
import type { LogtoProfileSync } from '../../src/modules/auth/logto-profile-sync';
import { MeController } from '../../src/modules/profile/me.controller';
import { updateSelfParticulars } from '../../src/modules/profile/particulars';
import type { AuthenticatedRequest } from '../../src/modules/auth/auth.guard';
import { testDatabaseUrl } from '../test-database-url';

const TEST_DATABASE_URL = testDatabaseUrl();

const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 5 });
const rlsDb = new RlsDb(pool);
const logtoSync = { push: jest.fn() };
const controller = new MeController(rlsDb, {} as unknown as LogtoManagementClient, logtoSync as unknown as LogtoProfileSync);

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

async function seedUser(phone: string, role = 'student'): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (phone, role, status) VALUES ($1, $2, 'active') RETURNING id`,
    [phone, role],
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
    await controller.completeOnboarding(reqFor(userId), { name: 'Jane Doe', username: 'JaneDoe', contactPhone: '+256772000501', gender: 'female' });
    const [row] = (await pool.query(`SELECT name, username FROM users WHERE id = $1`, [userId])).rows;
    expect(row).toEqual({ name: 'Jane Doe', username: 'janedoe' });
  });

  it('rejects a username already taken in a different case', async () => {
    const first = await seedUser('+256700000502');
    await controller.completeOnboarding(reqFor(first), { name: 'First', username: 'sharedhandle', contactPhone: '+256772000502', gender: 'male' });
    const second = await seedUser('+256700000503');
    await expect(
      controller.completeOnboarding(reqFor(second), { name: 'Second', username: 'SharedHandle', contactPhone: '+256772000503', gender: 'male' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('stores the contact phone without touching the sign-in phone', async () => {
    const userId = await seedUser('+256700000504');
    await controller.completeOnboarding(reqFor(userId), { name: 'Sam', username: 'sam_k', contactPhone: '+256772000504', gender: 'male' });
    const [row] = (await pool.query(`SELECT phone, contact_phone FROM users WHERE id = $1`, [userId])).rows;
    expect(row).toEqual({ phone: '+256700000504', contact_phone: '+256772000504' });
  });

  it('stores the gender a student picks', async () => {
    const userId = await seedUser('+256700000506');
    await controller.completeOnboarding(reqFor(userId), { name: 'Amy', username: 'amy_n', contactPhone: '+256772000506', gender: 'female' });
    const [row] = (await pool.query(`SELECT gender FROM users WHERE id = $1`, [userId])).rows;
    expect(row.gender).toBe('female');
  });

  it('requires a student or landlord to pick a gender', async () => {
    const userId = await seedUser('+256700000507', 'landlord');
    await expect(
      controller.completeOnboarding(reqFor(userId), { name: 'Ben', username: 'ben_o', contactPhone: '+256772000507' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lets a staff account finish without a gender', async () => {
    const userId = await seedUser('+256700000508', 'admin');
    await controller.completeOnboarding(reqFor(userId), { name: 'Cleo', username: 'cleo_s', contactPhone: '+256772000508' });
    const [row] = (await pool.query(`SELECT username FROM users WHERE id = $1`, [userId])).rows;
    expect(row.username).toBe('cleo_s');
  });

  it('copies the saved details to Logto', async () => {
    const userId = await seedUser('+256700000509');
    await controller.completeOnboarding(reqFor(userId), { name: 'Dan', username: 'dan_m', contactPhone: '+256772000509', gender: 'male' });
    expect(logtoSync.push).toHaveBeenCalledWith(userId);
  });

  it('does not let a student clear their gender from the profile page', async () => {
    const userId = await seedUser('+256700000510');
    await controller.completeOnboarding(reqFor(userId), { name: 'Eve', username: 'eve_k', contactPhone: '+256772000510', gender: 'female' });
    await expect(
      updateSelfParticulars(rlsDb, { userId, role: 'student' }, { gender: null }, logtoSync as unknown as LogtoProfileSync),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a contact phone that is not a valid African mobile number', () => {
    expect(profileOnboardingSchema.safeParse({ name: 'Sam', username: 'sam_k', contactPhone: '12345' }).success).toBe(false);
  });

  it('requires a contact phone', () => {
    expect(profileOnboardingSchema.safeParse({ name: 'Sam', username: 'sam_k' }).success).toBe(false);
  });
});

describe('migration 0062 backfill', () => {
  // The ALTER already ran on this DB; replay only the backfill statement.
  const backfill = readFileSync(join(__dirname, '../../migrations/0062_users_contact_phone.sql'), 'utf8')
    .split('--> statement-breakpoint')[1]!;

  it('copies an existing sign-in phone into contact_phone', async () => {
    const userId = await seedUser('+256700000505');
    await pool.query(`UPDATE users SET contact_phone = NULL WHERE id = $1`, [userId]);
    await pool.query(backfill);
    const [row] = (await pool.query(`SELECT contact_phone FROM users WHERE id = $1`, [userId])).rows;
    expect(row.contact_phone).toBe('+256700000505');
  });
});
