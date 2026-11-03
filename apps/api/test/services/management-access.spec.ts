import { ForbiddenException } from '@nestjs/common';
import { RlsDb } from '../../src/db/db.module';
import type { RlsContext } from '../../src/db/rls-context';
import { ManagementService } from '../../src/modules/management/management.service';
import { BusinessAccessService } from '../../src/modules/management/business-access.service';
import { assertGrantAllowed } from '../../src/modules/staff/role-assignment.service';
import { pool, seed } from '../rls/helpers';
import {
  createMandateSchema,
  managedPropertyUpdateSchema,
  officeCaseSchema,
} from '@campushomes/shared';

const management = new ManagementService(new RlsDb(pool));
const business = new BusinessAccessService(new RlsDb(pool));
let owner: RlsContext,
  otherOwner: RlsContext,
  manager: RlsContext,
  member: RlsContext,
  director: RlsContext,
  office: RlsContext,
  gm: RlsContext;
let propertyId: string, otherPropertyId: string;
const allScope = [{ scopeType: 'platform_wide', scopeId: null }];
const mukScope = [{ scopeType: 'catchment', scopeId: 'MUK' }];
const start = () => new Date(Date.now() - 60_000).toISOString();
const end = () => new Date(Date.now() + 86400_000).toISOString();
async function user(role: RlsContext['role'], email: string): Promise<RlsContext> {
  const id = await seed(
    "INSERT INTO users(role,status,name,email) VALUES($1,'active',$2,$2) RETURNING id",
    [role, email],
  );
  return { userId: id, role, mfaVerified: true };
}
async function staff(actor: RlsContext, key: string) {
  await seed(
    `INSERT INTO user_role_assignments(user_id,role_id,scope_type,assigned_by,reason)
 SELECT $1,id,'platform_wide',$1,'management test' FROM roles WHERE key=$2`,
    [actor.userId, key],
  );
}
async function offer(
  email = 'manager@example.test',
  capabilities = ['property.read', 'property.edit', 'maintenance.manage'],
) {
  return management.createMandate(owner, {
    propertyId,
    managerEmail: email,
    capabilities: capabilities as ['property.read'],
    startsAt: start(),
    endsAt: end(),
    reason: 'Signed property management agreement',
  });
}
beforeAll(async () => {
  owner = await user('landlord', 'owner@example.test');
  otherOwner = await user('landlord', 'other-owner@example.test');
  manager = await user('student', 'manager@example.test');
  member = await user('student', 'member@example.test');
  director = await user('admin', 'director@example.test');
  office = await user('admin', 'office@example.test');
  gm = await user('admin', 'gm@example.test');
  await staff(director, 'director');
  await staff(office, 'office_admin');
  await staff(gm, 'general_manager');
  for (const o of [owner, otherOwner])
    await seed(
      "INSERT INTO landlords(user_id,legal_name,kyc_status) VALUES($1,'Owner','verified')",
      [o.userId],
    );
  propertyId = await seed(
    "INSERT INTO properties(landlord_id,name,street_address,catchment,status) VALUES($1,'Managed hostel','Makerere','MUK','active') RETURNING id",
    [owner.userId],
  );
  otherPropertyId = await seed(
    "INSERT INTO properties(landlord_id,name,street_address,catchment,status) VALUES($1,'Other hostel','MUBS','MUBS','active') RETURNING id",
    [otherOwner.userId],
  );
});
afterAll(() => pool.end());
beforeEach(async () => {
  await pool.query(
    'TRUNCATE management_assignments,property_management_mandates,management_agency_members,management_agencies,management_notes,office_cases CASCADE',
  );
});

it('requires a single recipient, property read, and a valid expiry', () => {
  const input = {
    propertyId,
    managerEmail: 'manager@example.test',
    capabilities: ['property.read'],
    startsAt: start(),
    endsAt: end(),
    reason: 'Authority',
  };
  expect(createMandateSchema.safeParse(input).success).toBe(true);
  expect(createMandateSchema.safeParse({ ...input, agencyId: propertyId }).success).toBe(false);
  expect(createMandateSchema.safeParse({ ...input, capabilities: ['finance.read'] }).success).toBe(
    false,
  );
  expect(managedPropertyUpdateSchema.safeParse({ landlordId: manager.userId }).success).toBe(false);
  expect(managedPropertyUpdateSchema.safeParse({ payoutAccount: '123' }).success).toBe(false);
  expect(
    officeCaseSchema.safeParse({
      kind: 'appointment',
      subject: 'Visit',
      customerName: 'Student',
      catchment: 'MUK',
    }).success,
  ).toBe(false);
});
it('keeps leadership provisioning and manager access behind their own workflows', () => {
  expect(() =>
    assertGrantAllowed(new Set(['roles.assign']), allScope, {
      roleKey: 'director',
      scopeType: 'platform_wide',
      reason: 'hire',
    }),
  ).toThrow(ForbiddenException);
  expect(() =>
    assertGrantAllowed(new Set(['roles.assign']), allScope, {
      roleKey: 'property_manager',
      scopeType: 'property',
      scopeId: propertyId,
      reason: 'hire',
    }),
  ).toThrow(ForbiddenException);
});
it('only the verified property owner can offer a mandate', async () => {
  await expect(
    management.createMandate(otherOwner, {
      propertyId,
      managerEmail: 'manager@example.test',
      capabilities: ['property.read'],
      startsAt: start(),
      endsAt: end(),
      reason: 'No authority',
    }),
  ).rejects.toThrow(ForbiddenException);
});
it('requires acceptance and exposes only assigned property data', async () => {
  const m = await offer();
  expect((await management.dashboard(manager)).properties).toHaveLength(0);
  await expect(management.decideMandate(member, m.id, 'accept')).rejects.toThrow(
    ForbiddenException,
  );
  await management.decideMandate(manager, m.id, 'accept');
  expect((await management.dashboard(manager)).properties.map((p) => p.id)).toEqual([propertyId]);
  expect(await management.property(manager, propertyId)).toEqual({
    units: [],
    reservations: [],
    finance: [],
    notes: [],
  });
  await expect(management.property(manager, otherPropertyId)).rejects.toThrow(ForbiddenException);
  await management.updateProperty(manager, propertyId, { description: 'Managed description' });
  expect(
    (await pool.query('SELECT description FROM properties WHERE id=$1', [propertyId])).rows[0]
      .description,
  ).toBe('Managed description');
});
it('denies financial access and unrelated actions outside the delegated capabilities', async () => {
  const m = await offer('manager@example.test', ['property.read']);
  await management.decideMandate(manager, m.id, 'accept');
  await expect(
    management.updateProperty(manager, propertyId, { description: 'forbidden' }),
  ).rejects.toThrow(ForbiddenException);
  await expect(
    management.addNote(manager, propertyId, {
      kind: 'report',
      title: 'Private report',
      body: 'No authority',
    }),
  ).rejects.toThrow(ForbiddenException);
  expect((await management.property(manager, propertyId)).finance).toEqual([]);
});
it('revocation takes effect on the next property request and retains history', async () => {
  const m = await offer();
  await management.decideMandate(manager, m.id, 'accept');
  await management.revokeMandate(owner, m.id);
  await expect(management.property(manager, propertyId)).rejects.toThrow(ForbiddenException);
  expect(
    (await pool.query('SELECT status FROM property_management_mandates WHERE id=$1', [m.id]))
      .rows[0].status,
  ).toBe('revoked');
  expect(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM audit_log WHERE action='management.mandate_revoke' AND target_id=$1",
        [m.id],
      )
    ).rows[0].n,
  ).toBe(1);
});
it('enforces future start, expiry and the current owner', async () => {
  const m = await offer();
  await management.decideMandate(manager, m.id, 'accept');
  await pool.query(
    "UPDATE property_management_mandates SET starts_at=now()+interval '1 hour' WHERE id=$1",
    [m.id],
  );
  await expect(management.property(manager, propertyId)).rejects.toThrow(ForbiddenException);
  await pool.query(
    "UPDATE property_management_mandates SET starts_at=now()-interval '2 days',ends_at=now()-interval '1 day' WHERE id=$1",
    [m.id],
  );
  await expect(management.property(manager, propertyId)).rejects.toThrow(ForbiddenException);
  await pool.query(
    "UPDATE property_management_mandates SET starts_at=now()-interval '1 hour',ends_at=now()+interval '1 day',landlord_id=$2 WHERE id=$1",
    [m.id, otherOwner.userId],
  );
  await expect(management.property(manager, propertyId)).rejects.toThrow(ForbiddenException);
});
it('blocks staff accounts from enrollment or agency membership', async () => {
  await expect(management.enroll(director)).rejects.toThrow(ForbiddenException);
  const a = await management.createAgency(manager, 'Agency');
  await expect(management.addMember(manager, a.id, 'director@example.test')).rejects.toThrow(
    ForbiddenException,
  );
});
it('requires individual agency assignments and forbids permission escalation', async () => {
  const a = await management.createAgency(manager, 'Agency');
  await management.addMember(manager, a.id, 'member@example.test');
  await management.enroll(member);
  const m = await management.createMandate(owner, {
    propertyId,
    agencyId: a.id,
    capabilities: ['property.read', 'team.manage', 'maintenance.manage'],
    startsAt: start(),
    endsAt: end(),
    reason: 'Agency authority',
  });
  await management.decideMandate(manager, m.id, 'accept');
  expect((await management.dashboard(member)).properties).toHaveLength(0);
  await expect(
    management.assign(manager, m.id, member.userId, ['property.read', 'finance.read']),
  ).rejects.toThrow(ForbiddenException);
  await management.assign(manager, m.id, member.userId, ['property.read', 'maintenance.manage']);
  expect((await management.dashboard(member)).properties).toHaveLength(1);
  await expect(
    management.assign(member, m.id, manager.userId, ['property.read', 'team.manage']),
  ).rejects.toThrow(ForbiddenException);
  await management.addNote(member, propertyId, {
    kind: 'maintenance',
    title: 'Leaking tap',
    body: 'Repair needed in the shared kitchen',
  });
  expect((await management.ownerDashboard(owner)).notes).toHaveLength(1);
  const members = await management.agencyMembers(manager, a.id);
  const membership = members.find((r) => r.userId === member.userId)!;
  await management.removeMember(manager, a.id, membership.id);
  await expect(management.property(member, propertyId)).rejects.toThrow(ForbiddenException);
  await management.addMember(manager, a.id, 'member@example.test');
  await expect(management.property(member, propertyId)).rejects.toThrow(ForbiddenException);
});
it('does not leak another landlord portfolio through owner reporting', async () => {
  const m = await offer('manager@example.test', ['property.read', 'reports.submit']);
  await management.decideMandate(manager, m.id, 'accept');
  await management.addNote(manager, propertyId, {
    kind: 'report',
    title: 'Weekly report',
    body: 'All work completed',
  });
  expect((await management.ownerDashboard(otherOwner)).notes).toHaveLength(0);
  expect((await management.ownerDashboard(owner)).notes).toHaveLength(1);
});
it('requires an independent decision and prevents decision replay', async () => {
  const request = await business.request(director, {
    type: 'expenditure',
    title: 'Office supplies',
    reason: 'Restock office supplies',
    amountUgx: 100000,
  });
  await expect(business.decide(director, request.id, 'approved', 'Approved')).rejects.toThrow(
    ForbiddenException,
  );
  const other = await user('admin', 'second-director@example.test');
  await staff(other, 'director');
  await business.decide(other, request.id, 'approved', 'Within the agreed budget');
  await expect(
    business.decide(other, request.id, 'rejected', 'Repeated decision'),
  ).rejects.toThrow();
  expect((await business.governance(director, true)).find((r) => r.id === request.id)?.status).toBe(
    'approved',
  );
});
it('scopes front-desk cases to the caller and catchment', async () => {
  const row = await business.createCase(office, mukScope, false, {
    kind: 'inquiry',
    subject: 'Help finding a room',
    customerName: 'Jane',
    contact: '',
    notes: '',
    catchment: 'MUK',
  });
  expect((await business.office(office, mukScope, false)).rows).toHaveLength(1);
  expect((await business.office(gm, mukScope, false)).rows).toHaveLength(0);
  expect((await business.office(gm, mukScope, true)).rows).toHaveLength(1);
  expect(
    (await business.office(office, [{ scopeType: 'catchment', scopeId: 'MUBS' }], false)).rows,
  ).toHaveLength(0);
  await expect(
    business.updateCase(gm, mukScope, false, row.id, { status: 'closed' }),
  ).rejects.toThrow(ForbiddenException);
  await expect(
    business.createCase(office, mukScope, false, {
      kind: 'inquiry',
      subject: 'Wrong region',
      customerName: 'Jane',
      contact: '',
      notes: '',
      catchment: 'MUBS',
    }),
  ).rejects.toThrow(ForbiddenException);
  await business.updateCase(office, mukScope, false, row.id, { status: 'escalated' });
  expect((await business.office(gm, allScope, true)).rows[0].status).toBe('escalated');
});
it('returns source-backed executive totals within catchment scope', async () => {
  const result = await business.overview(mukScope);
  expect(result.properties.every((p: { catchment: string }) => p.catchment === 'MUK')).toBe(true);
  expect(result.beds).toBeGreaterThanOrEqual(0);
  expect(result.recordedCollectionsUgx).toBeGreaterThanOrEqual(0);
});
