/**
 * InquiriesService round trip against the real docker test DB: student
 * submission scoped by RLS self policies (0028), the staff list/resolve
 * path under service_role, and the best-effort notification email hook.
 */
import { createInquirySchema } from '@campushomes/shared';

import { Pool } from 'pg';

import { ConsoleMessaging } from '../../src/adapters/messaging.adapter';
import { RlsDb } from '../../src/db/db.module';
import type { RlsContext } from '../../src/db/rls-context';
import { AuditService } from '../../src/modules/ops/audit.service';
import { InquiriesService } from '../../src/modules/inquiries/inquiries.service';
import { NotificationsService } from '../../src/modules/notifications/notifications.service';
import { StaffService } from '../../src/modules/staff/staff.service';

jest.mock('../../src/modules/inquiries/inquiry-email', () => ({
  sendInquiryEmail: jest.fn().mockResolvedValue(undefined),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { sendInquiryEmail } = require('../../src/modules/inquiries/inquiry-email') as {
  sendInquiryEmail: jest.Mock;
};

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://campushomes:campushomes_test@localhost:54329/campushomes_test';

// InquiriesService reads env once via loadEnv() at construction. `||` not
// ?? — a blank-shell DATABASE_URL="" must fall through to the docker URL.
process.env.DATABASE_URL = process.env.DATABASE_URL || TEST_DATABASE_URL;

const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 5 });
const rlsDb = new RlsDb(pool);
const auditService = new AuditService(rlsDb);
const inquiriesService = new InquiriesService(
  rlsDb,
  auditService,
  new NotificationsService(rlsDb, new ConsoleMessaging()),
  new StaffService(rlsDb, auditService),
);

let student1: string;
let student2: string;
let staff1: string;

const student1Ctx = (): RlsContext => ({ userId: student1, role: 'student' });
const student2Ctx = (): RlsContext => ({ userId: student2, role: 'student' });
const staffCtx = (): RlsContext => ({ userId: staff1, role: 'admin' });
const SERVICE_CTX: RlsContext = { userId: '00000000-0000-0000-0000-000000000000', role: 'service_role' };

async function seed(sql: string, params: unknown[] = []): Promise<string> {
  const res = await pool.query(sql, params);
  return res.rows[0]?.id as string;
}

beforeAll(async () => {
  await pool.query(`TRUNCATE users CASCADE`);

  student1 = await seed(
    `INSERT INTO users (phone, role, status, name, email) VALUES ($1, 'student', 'active', 'Ada Student', 'ada@example.ac.ug') RETURNING id`,
    ['+256700002101'],
  );
  student2 = await seed(
    `INSERT INTO users (phone, role, status, name) VALUES ($1, 'student', 'active', 'Ben Student') RETURNING id`,
    ['+256700002102'],
  );
  staff1 = await seed(
    `INSERT INTO users (phone, role, status, name) VALUES ($1, 'admin', 'active', 'Ops Lead') RETURNING id`,
    ['+256700002103'],
  );
});

afterAll(async () => {
  await pool.end();
});

beforeEach(() => {
  sendInquiryEmail.mockClear();
});

describe('InquiriesService — student side', () => {
  it('creates an inquiry under the caller identity and fires the notify email', async () => {
    const created = await inquiriesService.create(student1Ctx(), {
      category: 'reservation',
      subject: 'Wrong room allocated',
      message: 'I reserved Room 1A but was told it is taken.',
    });

    expect(created?.subject).toBe('Wrong room allocated');
    expect(created?.status).toBe('open');
    expect(created?.studentId).toBe(student1);
    expect(created?.studentName).toBe('Ada Student');
    expect(sendInquiryEmail).toHaveBeenCalledTimes(1);
  });

  it('the shared schema defaults the category to general before it reaches the service', () => {
    const parsed = createInquirySchema.parse({ subject: 'Payment options', message: 'Can I pay per month?' });
    expect(parsed.category).toBe('general');
  });

  it("mine() returns only the caller's own rows", async () => {
    const [mine1Row, ...restMine1] = await inquiriesService.mine(student1Ctx());
    const mine2 = await inquiriesService.mine(student2Ctx());

    expect(restMine1).toHaveLength(0);
    expect(mine1Row?.studentId).toBe(student1);
    expect(mine2).toHaveLength(0);
  });
});

describe('InquiriesService — staff side', () => {
  let inquiryId: string;

  beforeAll(async () => {
    [inquiryId] = await inquiriesService.mine(student1Ctx()).then((rows) => rows.map((r) => r.id));
  });

  it('list() returns every inquiry regardless of author', async () => {
    const all = await inquiriesService.list();
    expect(all.length).toBeGreaterThanOrEqual(1);
    expect(all.every((row) => row.studentName !== undefined)).toBe(true);
  });

  it('list(status) filters', async () => {
    const open = await inquiriesService.list('open');
    expect(open.every((row) => row.status === 'open')).toBe(true);
  });

  it('resolve() stamps resolver and timestamp', async () => {
    const resolved = await inquiriesService.resolve(inquiryId, staffCtx(), {
      status: 'resolved',
      resolution: 'Hostel confirmed the room is free — proceed.',
    });

    expect(resolved?.status).toBe('resolved');
    expect(resolved?.resolution).toContain('proceed');
    expect(resolved?.resolvedByName).toBe('Ops Lead');
  });

  it('resolve() on an unknown id returns undefined', async () => {
    await expect(
      inquiriesService.resolve(SERVICE_CTX.userId, staffCtx(), { status: 'resolved' }),
    ).resolves.toBeUndefined();
  });
});
