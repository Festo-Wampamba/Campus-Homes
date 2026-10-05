/**
 * GET /uploads/document-url: identity and ownership documents live in a
 * private bucket, so every read is a short-lived presigned GET issued only to
 * a reader authorized for the row that references the key.
 */
import { Pool } from 'pg';

import { RlsDb } from '../../src/db/db.module';
import type { RlsContext } from '../../src/db/rls-context';
import { DocumentsService } from '../../src/modules/uploads/uploads.module';

// This suite TRUNCATEs users CASCADE, so it must never fall back to a default database.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
if (!TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL must be set to a disposable database; this suite truncates tables');
}
process.env.DATABASE_URL ??= TEST_DATABASE_URL;
Object.assign(process.env, {
  B2_S3_ENDPOINT: 'https://s3.example.invalid', B2_S3_REGION: 'us-east-1', B2_BUCKET: 'photos',
  B2_PRIVATE_BUCKET: 'private-docs', B2_ACCESS_KEY_ID: 'fake-access-key', B2_SECRET_ACCESS_KEY: 'fake-secret',
});

const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 5 });
const documents = new DocumentsService(new RlsDb(pool));

let landlord: string;
let otherLandlord: string;
let student: string;
let custodian: string;
let kycReviewer: string;
let inspector: string;
let scopedLead: string;
let idDocKey: string;
let propertyDocKey: string;
let signatureKey: string;
const LEGACY_URL = 'https://s3.example.invalid/photos/uploads/legacy/id-doc';

const user = (userId: string): RlsContext => ({ userId, role: 'student' });
const staff = (userId: string, role: 'ops_lead' | 'ops_inspector'): RlsContext => ({ userId, role, mfaVerified: true });
const read = (ctx: RlsContext, key: string) => documents.documentUrl(ctx, key);

async function seed(sql: string, params: unknown[] = []): Promise<string> {
  return (await pool.query(sql, params)).rows[0]?.id as string;
}

async function staffUser(phone: string, role: string, scopeType: string, scopeId: string | null): Promise<string> {
  const id = await seed(`INSERT INTO users (phone, role, status) VALUES ($1, $2, 'active') RETURNING id`, [phone, role]);
  await pool.query(
    `INSERT INTO user_role_assignments (user_id, role_id, scope_type, scope_id, assigned_by, reason)
     SELECT $1, id, $3, $4, $1, 'document-url test' FROM roles WHERE key = $2`,
    [id, role, scopeType, scopeId],
  );
  return id;
}

beforeAll(async () => {
  await pool.query(
    `TRUNCATE users, students, landlords, properties, property_documents, property_memberships,
     tenant_agreement_templates, tenant_agreements CASCADE`,
  );
  landlord = await seed(`INSERT INTO users (phone, role, status) VALUES ('+256710000700', 'landlord', 'active') RETURNING id`);
  otherLandlord = await seed(`INSERT INTO users (phone, role, status) VALUES ('+256710000701', 'landlord', 'active') RETURNING id`);
  student = await seed(`INSERT INTO users (phone, role, status) VALUES ('+256710000702', 'student', 'active') RETURNING id`);
  custodian = await seed(`INSERT INTO users (phone, role, status) VALUES ('+256710000703', 'custodian', 'active') RETURNING id`);
  kycReviewer = await staffUser('+256710000704', 'ops_lead', 'platform_wide', null);
  inspector = await staffUser('+256710000705', 'ops_inspector', 'platform_wide', null);
  scopedLead = await staffUser('+256710000706', 'ops_lead', 'catchment', 'MUK');

  idDocKey = `uploads/${landlord}/${crypto.randomUUID()}`;
  propertyDocKey = `uploads/${landlord}/${crypto.randomUUID()}`;
  signatureKey = `uploads/${student}/${crypto.randomUUID()}`;
  await pool.query(
    `INSERT INTO landlords (user_id, legal_name, id_doc_storage_key) VALUES ($1, 'LL A', $2), ($3, 'LL B', $4)`,
    [landlord, idDocKey, otherLandlord, LEGACY_URL],
  );
  const property = await seed(
    `INSERT INTO properties (landlord_id, name, street_address, status, catchment)
     VALUES ($1, 'Doc Hostel', 'Kikoni', 'active', 'MUK') RETURNING id`,
    [landlord],
  );
  await pool.query(
    `INSERT INTO property_documents (property_id, doc_type, storage_key, uploaded_by)
     SELECT $1, (enum_range(NULL::doc_type))[1], $2, $3`,
    [property, propertyDocKey, landlord],
  );
  await pool.query(
    `INSERT INTO property_memberships (user_id, property_id, role, assigned_by) VALUES ($1, $2, 'custodian', $3)`,
    [custodian, property, landlord],
  );
  await pool.query(`INSERT INTO students (user_id, university) VALUES ($1, 'MUK')`, [student]);
  const template = await seed(
    `INSERT INTO tenant_agreement_templates (property_id, created_by) VALUES ($1, $2) RETURNING id`,
    [property, landlord],
  );
  await pool.query(
    `INSERT INTO tenant_agreements (template_id, property_id, student_id, responses, declaration_accepted, signature_type, signature_storage_key)
     VALUES ($1, $2, $3, '[]', true, 'drawn', $4)`,
    [template, property, student, signatureKey],
  );
});

afterAll(async () => {
  await pool.end();
});

describe('landlord ID document', () => {
  it('is readable by the landlord it belongs to as a private-bucket presigned GET', async () => {
    const { url } = await read(user(landlord), idDocKey);
    expect(new URL(url).pathname).toBe(`/private-docs/${idDocKey}`);
  });

  it('is presigned for 300 seconds', async () => {
    const { url } = await read(user(landlord), idDocKey);
    expect(new URL(url).searchParams.get('X-Amz-Expires')).toBe('300');
  });

  it('is forbidden to another landlord', async () => {
    await expect(read(user(otherLandlord), idDocKey)).rejects.toMatchObject({ status: 403 });
  });

  it('is readable by staff holding landlords.review_kyc', async () => {
    await expect(read(staff(kycReviewer, 'ops_lead'), idDocKey)).resolves.toHaveProperty('url');
  });

  it('is forbidden to staff without landlords.review_kyc', async () => {
    await expect(read(staff(inspector, 'ops_inspector'), idDocKey)).rejects.toMatchObject({ status: 403 });
  });

  it('is forbidden to a KYC reviewer whose session lacks MFA', async () => {
    await expect(read({ ...staff(kycReviewer, 'ops_lead'), mfaVerified: false }, idDocKey)).rejects.toMatchObject({ status: 403 });
  });

  it('returns a legacy public URL as-is to an authorized reader', async () => {
    await expect(read(user(otherLandlord), LEGACY_URL)).resolves.toEqual({ url: LEGACY_URL });
  });

  it('refuses a legacy public URL to an unrelated reader', async () => {
    await expect(read(user(landlord), LEGACY_URL)).rejects.toMatchObject({ status: 403 });
  });
});

describe('property document', () => {
  it('is readable by the property landlord', async () => {
    await expect(read(user(landlord), propertyDocKey)).resolves.toHaveProperty('url');
  });

  it('is readable by a lead whose scope covers the property', async () => {
    await expect(read(staff(scopedLead, 'ops_lead'), propertyDocKey)).resolves.toHaveProperty('url');
  });

  it('is forbidden to another landlord', async () => {
    await expect(read(user(otherLandlord), propertyDocKey)).rejects.toMatchObject({ status: 403 });
  });
});

describe('tenant-agreement signature', () => {
  it('is readable by the submitting student', async () => {
    await expect(read(user(student), signatureKey)).resolves.toHaveProperty('url');
  });

  it("is readable by the agreement property's landlord", async () => {
    await expect(read(user(landlord), signatureKey)).resolves.toHaveProperty('url');
  });

  it("is readable by the property's active custodian", async () => {
    await expect(read(user(custodian), signatureKey)).resolves.toHaveProperty('url');
  });

  it('is forbidden to an unrelated user', async () => {
    await expect(read(user(otherLandlord), signatureKey)).rejects.toMatchObject({ status: 403 });
  });
});

describe('unreferenced key', () => {
  it('is readable by its uploader for a pre-submit preview', async () => {
    await expect(read(user(student), `uploads/${student}/${crypto.randomUUID()}`)).resolves.toHaveProperty('url');
  });

  it("is forbidden when it is someone else's upload", async () => {
    await expect(read(user(student), `uploads/${landlord}/${crypto.randomUUID()}`)).rejects.toMatchObject({ status: 403 });
  });
});
