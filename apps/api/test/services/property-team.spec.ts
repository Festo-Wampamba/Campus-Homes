import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { propertyTeamAssignmentSchema } from '@campushomes/shared';
import { RlsDb } from '../../src/db/db.module';
import type { RlsContext } from '../../src/db/rls-context';
import { PropertyTeamService } from '../../src/modules/management/property-team.service';
import { resolveAccountAccess } from '../../src/modules/auth/access-resolver';
import { pool, seed } from '../rls/helpers';

const db = new RlsDb(pool);
const service = new PropertyTeamService(db);
let owner: RlsContext, other: RlsContext, recipient: RlsContext, staff: RlsContext;
let property: string, otherProperty: string;
const email = 'ground-team-recipient@example.test';
const input = () => ({ propertyId: property, email, role: 'property_worker' as const,
  workerType: 'maintenance_worker' as const, reason: 'On-site maintenance responsibilities' });

beforeAll(async () => {
  async function user(role: RlsContext['role'], address: string) {
    const id = await seed(`INSERT INTO users(role,status,name,email,email_verified,logto_user_id)
      VALUES($1,'active',$2,$2,true,$2) RETURNING id`, [role, address]);
    return { userId: id, role };
  }
  owner = await user('landlord', 'ground-team-owner@example.test');
  other = await user('landlord', 'ground-team-other@example.test');
  recipient = await user('student', email);
  staff = await user('admin', 'ground-team-staff@example.test');
  for (const actor of [owner, other]) await seed(`INSERT INTO landlords(user_id,legal_name,kyc_status)
    VALUES($1,'Owner','verified')`, [actor.userId]);
  property = await seed(`INSERT INTO properties(landlord_id,name,street_address,catchment,status)
    VALUES($1,'Team property','Makerere','MUK','active') RETURNING id`, [owner.userId]);
  otherProperty = await seed(`INSERT INTO properties(landlord_id,name,street_address,catchment,status)
    VALUES($1,'Other property','MUBS','MUBS','active') RETURNING id`, [other.userId]);
});
afterAll(() => pool.end());

it('accepts only property-ground roles and requires worker duties', () => {
  expect(propertyTeamAssignmentSchema.safeParse(input()).success).toBe(true);
  expect(propertyTeamAssignmentSchema.safeParse({ ...input(), role: 'general_manager' }).success).toBe(false);
  expect(propertyTeamAssignmentSchema.safeParse({ ...input(), role: 'property_manager' }).success).toBe(false);
  expect(propertyTeamAssignmentSchema.safeParse({ ...input(), workerType: undefined }).success).toBe(false);
});
it('denies assignments and roster reads outside the current owner’s properties', async () => {
  await expect(service.assign(other, input())).rejects.toThrow(ForbiddenException);
  expect((await service.owner(other)).members).toHaveLength(0);
});
it('does not assign a company staff identity or the owner themselves', async () => {
  await expect(service.assign(owner, { ...input(), email: 'ground-team-staff@example.test' })).rejects.toThrow(ForbiddenException);
  await expect(service.assign(owner, { ...input(), email: 'ground-team-owner@example.test' })).rejects.toThrow(BadRequestException);
});
it('creates a usable property-scoped grant, updates duties idempotently and isolates another property', async () => {
  const first = await service.assign(owner, input());
  const second = await service.assign(owner, { ...input(), workerType: 'cleaner' });
  expect(first.id).toBe(second.id);
  expect((await service.owner(owner)).members).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: first.id, propertyId: property, role: 'property_worker', workerType: 'cleaner', status: 'active' }),
  ]));
  expect((await service.mine(recipient)).map(p => p.propertyId)).toEqual([property]);
  const access = await resolveAccountAccess(db, recipient.userId);
  expect(access?.roles).toContain('property_worker');
  expect(access?.workspaces).toContain('landlord');
  expect((await service.owner(other)).members).toHaveLength(0);
  await expect(service.revoke(other, first.id)).rejects.toThrow(ForbiddenException);
});
it('keeps assignments to different properties independent on revocation', async () => {
  const a = await service.assign(owner, input());
  const b = await service.assign(other, { ...input(), propertyId: otherProperty });
  await service.revoke(owner, a.id);
  expect((await service.mine(recipient)).map(p => p.propertyId)).toEqual([otherProperty]);
  await service.revoke(other, b.id);
  expect(await service.mine(recipient)).toHaveLength(0);
  expect((await resolveAccountAccess(db, recipient.userId))?.roles).not.toContain('property_worker');
});
it('supports custodians without granting ownership or management mandates', async () => {
  await service.assign(owner, { ...input(), role: 'custodian', workerType: undefined });
  const access = await resolveAccountAccess(db, recipient.userId);
  expect(access?.roles).toContain('custodian');
  expect(access?.roles).not.toContain('landlord');
  expect(access?.roles).not.toContain('property_manager');
  expect(await service.mine(recipient)).toEqual(expect.arrayContaining([expect.objectContaining({ role: 'custodian' })]));
});
it('rejects unverified recipients and users with company roles even when their legacy identity is a customer', async () => {
  await pool.query('UPDATE users SET email_verified=false WHERE id=$1', [recipient.userId]);
  await expect(service.assign(owner, input())).rejects.toThrow(ForbiddenException);
  await pool.query('UPDATE users SET email_verified=true WHERE id=$1', [recipient.userId]);
  await pool.query("UPDATE users SET role='student' WHERE id=$1", [staff.userId]);
  await seed(`INSERT INTO user_role_assignments(user_id,role_id,scope_type,assigned_by,reason)
    SELECT $1,id,'platform_wide',$1,'Company role fixture' FROM roles WHERE key='director'`, [staff.userId]);
  await expect(service.assign(owner, { ...input(), email: 'ground-team-staff@example.test' })).rejects.toThrow(BadRequestException);
});
it('serializes duplicate assignments and restores the explicit owner-authorised validity', async () => {
  const assignments = await Promise.all([service.assign(owner, input()), service.assign(owner, input())]);
  expect(assignments[0].id).toBe(assignments[1].id);
  await pool.query(`UPDATE property_memberships SET starts_at=now()+interval '1 day',ends_at=now()+interval '2 days' WHERE id=$1`, [assignments[0].id]);
  await pool.query(`UPDATE user_role_assignments SET valid_from=now()+interval '1 day',valid_until=now()+interval '2 days'
    WHERE user_id=$1 AND scope_id=$2 AND revoked_at IS NULL AND role_id=(SELECT id FROM roles WHERE key='property_worker')`, [recipient.userId, property]);
  await service.assign(owner, input());
  expect(await service.mine(recipient)).toEqual(expect.arrayContaining([expect.objectContaining({ propertyId: property, role: 'property_worker' })]));
});
it('does not revoke a later reassignment when an old removal request is replayed', async () => {
  const old = await service.assign(owner, input());
  await service.revoke(owner, old.id);
  const current = await service.assign(owner, input());
  expect(current.id).not.toBe(old.id);
  await service.revoke(owner, old.id);
  expect(await service.mine(recipient)).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: current.id, propertyId: property, role: 'property_worker' }),
  ]));
});
it('suspension or loss of owner verification stops assignment creation and visibility', async () => {
  await pool.query("UPDATE landlords SET kyc_status='pending' WHERE user_id=$1", [owner.userId]);
  await expect(service.assign(owner, input())).rejects.toThrow(ForbiddenException);
  expect(await service.mine(recipient)).toHaveLength(0);
  await pool.query("UPDATE landlords SET kyc_status='verified' WHERE user_id=$1", [owner.userId]);
  await pool.query("UPDATE users SET status='suspended' WHERE id=$1", [recipient.userId]);
  await expect(service.assign(owner, input())).rejects.toThrow(ForbiddenException);
  expect(await service.mine(recipient)).toHaveLength(0);
});
