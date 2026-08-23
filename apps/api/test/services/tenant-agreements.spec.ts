/**
 * Service-level tests for the QR-code tenant registration flow: template
 * authorization (landlord-own / custodian-assigned / ops, and the public
 * fill-time read), the whole-form save-and-replace semantics, and the two
 * submit guards that don't fit the RLS suite (missing student profile,
 * duplicate submission mapped to a clean 409).
 */
import { Pool } from 'pg';

import { RlsDb } from '../../src/db/db.module';
import { TenantAgreementsService } from '../../src/modules/tenant-agreements/tenant-agreements.service';
import type { RlsContext } from '../../src/db/rls-context';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://campushomes:campushomes_test@localhost:54329/campushomes_test';

const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 5 });
const rlsDb = new RlsDb(pool);
const tenantAgreements = new TenantAgreementsService(rlsDb);

let landlordA: string;
let landlordB: string;
let custodianA: string; // assigned to propertyA
let studentWithProfile: string;
let studentWithoutProfile: string;
let propertyA: string;

const landlordCtx = (userId: string): RlsContext => ({ userId, role: 'landlord' });
const custodianCtx = (userId: string): RlsContext => ({ userId, role: 'custodian' });
const studentCtx = (userId: string): RlsContext => ({ userId, role: 'student' });

async function seed(sql: string, params: unknown[] = []): Promise<string> {
  const res = await pool.query(sql, params);
  return res.rows[0]?.id as string;
}

beforeAll(async () => {
  await pool.query(
    `TRUNCATE users, students, landlords, properties, property_memberships,
     tenant_agreement_templates, tenant_agreement_fields, tenant_agreements CASCADE`,
  );

  landlordA = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000040', 'landlord', 'active') RETURNING id`,
  );
  landlordB = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000041', 'landlord', 'active') RETURNING id`,
  );
  await pool.query(`INSERT INTO landlords (user_id, legal_name) VALUES ($1, 'LL A'), ($2, 'LL B')`, [
    landlordA,
    landlordB,
  ]);
  propertyA = await seed(
    `INSERT INTO properties (landlord_id, name, street_address, status, catchment)
     VALUES ($1, 'Template Test Hostel', 'Kikoni', 'active', 'MUK') RETURNING id`,
    [landlordA],
  );

  custodianA = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000042', 'custodian', 'active') RETURNING id`,
  );
  await pool.query(
    `INSERT INTO property_memberships (user_id, property_id, role, assigned_by) VALUES ($1, $2, 'custodian', $3)`,
    [custodianA, propertyA, landlordA],
  );

  studentWithProfile = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000043', 'student', 'active') RETURNING id`,
  );
  await pool.query(`INSERT INTO students (user_id, university) VALUES ($1, 'MUK')`, [studentWithProfile]);

  studentWithoutProfile = await seed(
    `INSERT INTO users (phone, role, status) VALUES ('+256710000044', 'student', 'active') RETURNING id`,
  );
});

afterAll(async () => {
  await pool.end();
});

describe('template authorization', () => {
  it('the owning landlord can save a template', async () => {
    const template = await tenantAgreements.saveTemplate(landlordCtx(landlordA), propertyA, {
      title: 'Move-in Agreement',
      fields: [{ fieldType: 'fill_in', label: 'Room number', required: true }],
    });
    expect(template.title).toBe('Move-in Agreement');
    expect(template.fields).toHaveLength(1);
  });

  it('a different landlord cannot save a template for a property they do not own', async () => {
    await expect(
      tenantAgreements.saveTemplate(landlordCtx(landlordB), propertyA, {
        title: 'Hijack',
        fields: [{ fieldType: 'fill_in', label: 'x', required: false }],
      }),
    ).rejects.toThrow(/don't have permission/i);
  });

  it('an assigned custodian can save a template', async () => {
    const template = await tenantAgreements.saveTemplate(custodianCtx(custodianA), propertyA, {
      title: 'Custodian Edit',
      fields: [{ fieldType: 'fill_in', label: 'Move-in date', required: true }],
    });
    expect(template.title).toBe('Custodian Edit');
  });

  it('a student can never save a template', async () => {
    await expect(
      tenantAgreements.saveTemplate(studentCtx(studentWithProfile), propertyA, {
        title: 'Nope',
        fields: [{ fieldType: 'fill_in', label: 'x', required: false }],
      }),
    ).rejects.toThrow(/don't have permission/i);
  });
});

describe('saveTemplate replace semantics', () => {
  it('replaces the field set on save rather than accumulating fields', async () => {
    await tenantAgreements.saveTemplate(landlordCtx(landlordA), propertyA, {
      title: 'Replace Test',
      fields: [
        { fieldType: 'fill_in', label: 'Field A', required: false },
        { fieldType: 'fill_in', label: 'Field B', required: false },
      ],
    });
    const replaced = await tenantAgreements.saveTemplate(landlordCtx(landlordA), propertyA, {
      title: 'Replace Test',
      fields: [{ fieldType: 'checkboxes', label: 'Field C', options: ['Yes', 'No'], required: true }],
    });
    expect(replaced.fields).toHaveLength(1);
    expect(replaced.fields[0]?.label).toBe('Field C');
  });
});

describe('getTemplateForFill', () => {
  it('is readable without any authorization (public, for the QR landing page)', async () => {
    const template = await tenantAgreements.getTemplateForFill(propertyA);
    expect(template?.propertyId).toBe(propertyA);
  });

  it('returns null for a property with no template yet', async () => {
    const bareProperty = await seed(
      `INSERT INTO properties (landlord_id, name, street_address, status, catchment)
       VALUES ($1, 'Bare Property', 'Kikoni', 'active', 'MUK') RETURNING id`,
      [landlordA],
    );
    const template = await tenantAgreements.getTemplateForFill(bareProperty);
    expect(template).toBeNull();
  });
});

describe('submit', () => {
  let templateFieldId: string;

  beforeAll(async () => {
    const template = await tenantAgreements.saveTemplate(landlordCtx(landlordA), propertyA, {
      title: 'Submit Test',
      fields: [
        { fieldType: 'paragraph', label: 'Please read these terms.', required: false },
        { fieldType: 'fill_in', label: 'Room number', required: true },
      ],
    });
    templateFieldId = template.fields.find((f) => f.fieldType === 'fill_in')!.id;
  });

  it('rejects a missing required field', async () => {
    await expect(
      tenantAgreements.submit(studentCtx(studentWithProfile), {
        propertyId: propertyA,
        responses: [],
        declarationAccepted: true,
        signature: { type: 'typed', signedName: 'Student One' },
      }),
    ).rejects.toThrow(/room number.*required/i);
  });

  it('rejects a student with no completed profile', async () => {
    await expect(
      tenantAgreements.submit(studentCtx(studentWithoutProfile), {
        propertyId: propertyA,
        responses: [{ fieldId: templateFieldId, value: '2A' }],
        declarationAccepted: true,
        signature: { type: 'typed', signedName: 'No Profile' },
      }),
    ).rejects.toThrow(/complete your student profile/i);
  });

  it('rejects an unknown property', async () => {
    await expect(
      tenantAgreements.submit(studentCtx(studentWithProfile), {
        propertyId: '00000000-0000-0000-0000-000000000000',
        responses: [],
        declarationAccepted: true,
        signature: { type: 'typed', signedName: 'Student One' },
      }),
    ).rejects.toThrow(/property not found/i);
  });

  it('succeeds and snapshots the field label/type alongside the answer', async () => {
    const agreement = await tenantAgreements.submit(studentCtx(studentWithProfile), {
      propertyId: propertyA,
      responses: [{ fieldId: templateFieldId, value: '2A' }],
      declarationAccepted: true,
      signature: { type: 'typed', signedName: 'Student One' },
    });
    expect(agreement.signedName).toBe('Student One');
    expect(agreement.declarationAccepted).toBe(true);
    expect(agreement.responses).toEqual([
      { fieldId: templateFieldId, label: 'Room number', fieldType: 'fill_in', value: '2A' },
    ]);
  });

  it('rejects a second submission for the same student + property', async () => {
    await expect(
      tenantAgreements.submit(studentCtx(studentWithProfile), {
        propertyId: propertyA,
        responses: [{ fieldId: templateFieldId, value: '2B' }],
        declarationAccepted: true,
        signature: { type: 'typed', signedName: 'Student One Again' },
      }),
    ).rejects.toThrow(/already submitted/i);
  });
});

describe('mine / forProperty', () => {
  it("returns the student's own agreement for the property", async () => {
    const row = await tenantAgreements.mine(studentCtx(studentWithProfile), propertyA);
    expect(row?.signedName).toBe('Student One');
  });

  it('returns null when the student has no agreement for the property', async () => {
    const row = await tenantAgreements.mine(studentCtx(studentWithoutProfile), propertyA);
    expect(row).toBeNull();
  });

  it("returns the property owner's agreements with the signer's account name joined", async () => {
    const rows = (await tenantAgreements.forProperty(landlordCtx(landlordA), propertyA)) as Array<{
      signed_name: string;
      student_name: string | null;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.signed_name).toBe('Student One');
  });
});
