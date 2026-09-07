/**
 * Self-service landlord enrollment (POST /landlords/enroll) must actually
 * unlock the landlord workspace. Regression for a bug where the role
 * assignment it writes (scope_type='own') was invisible to
 * resolveAccountAccess's scope filter, silently locking every self-enrolled
 * landlord out of /landlord/onboarding forever.
 */
import { Pool } from 'pg';

import { RlsDb } from '../../src/db/db.module';
import { resolveAccountAccess } from '../../src/modules/auth/access-resolver';
import { LandlordsService } from '../../src/modules/landlords/landlords.service';
import { AuditService } from '../../src/modules/ops/audit.service';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://campushomes:campushomes_test@localhost:54329/campushomes_test';

const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 5 });
const rlsDb = new RlsDb(pool);
const audit = new AuditService(rlsDb);
const landlords = new LandlordsService(rlsDb, audit);

let studentUserId: string;

beforeAll(async () => {
  await pool.query(`TRUNCATE users, landlords, user_role_assignments CASCADE`);
  const res = await pool.query(
    `INSERT INTO users (phone, role, status, name) VALUES ('+256710000201', 'student', 'active', 'Enrolling Student') RETURNING id`,
  );
  studentUserId = res.rows[0].id as string;
});

afterAll(async () => {
  await pool.end();
});

describe('self-service landlord enrollment', () => {
  it('adds the landlord workspace to account access after enrolling', async () => {
    await landlords.enroll({ userId: studentUserId, role: 'student' });

    const access = await resolveAccountAccess(rlsDb, studentUserId);

    expect(access?.workspaces).toContain('landlord');
  });
});
