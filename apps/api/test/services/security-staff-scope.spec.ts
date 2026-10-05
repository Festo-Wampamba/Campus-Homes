import { Pool } from 'pg';
import type { PublishListingInput } from '@campushomes/shared';

import { RlsDb } from '../../src/db/db.module';
import type { RlsContext } from '../../src/db/rls-context';
import { assertStaffScope } from '../../src/modules/auth/staff-scope';
import { AuditService } from '../../src/modules/ops/audit.service';
import { OpsService } from '../../src/modules/ops/ops.service';
import type { LogtoManagementClient } from '../../src/modules/auth/logto-management.client';
import type { NotificationsService } from '../../src/modules/notifications/notifications.service';
import { RoomManagementService } from '../../src/modules/room-management/room-management.service';
import { TenantAgreementsService } from '../../src/modules/tenant-agreements/tenant-agreements.service';
import { testDatabaseUrl } from '../test-database-url';

const pool = new Pool({ connectionString: testDatabaseUrl(), max: 5 });
const db = new RlsDb(pool);
const notifications = { notify: jest.fn().mockResolvedValue(undefined) } as unknown as NotificationsService;
const audit = new AuditService(db);
const ops = new OpsService(db, audit, notifications, {} as LogtoManagementClient);
const rooms = new RoomManagementService(db, audit, notifications);
const agreements = new TenantAgreementsService(db);
let actor: RlsContext;
let landlord: string;
let ownProperty: string;
let otherProperty: string;
let ownChanges: string;
let otherChanges: string;
let otherListing: string;
let semester: string;
async function insert(sql: string, params: unknown[] = []): Promise<string> {
  return (await pool.query(sql, params)).rows[0].id;
}

beforeAll(async () => {
  await pool.query('TRUNCATE users CASCADE');
  landlord = await insert("INSERT INTO users (email,role,status) VALUES ('scope-landlord@example.test','landlord','active') RETURNING id");
  await pool.query("INSERT INTO landlords (user_id,legal_name,kyc_status) VALUES ($1,'Scope Landlord','pending')", [landlord]);
  const userId = await insert("INSERT INTO users (email,role,status) VALUES ('scope-lead@example.test','ops_lead','active') RETURNING id");
  actor = { userId, role: 'ops_lead', mfaVerified: true };
  await pool.query("INSERT INTO user_role_assignments (user_id,role_id,scope_type,scope_id,assigned_by,reason) SELECT $1,id,'catchment','MUK',$1,'security test' FROM roles WHERE key='ops_lead'", [userId]);
  ownProperty = await insert("INSERT INTO properties (landlord_id,name,street_address,status,catchment) VALUES ($1,'Own','Own street','active','MUK') RETURNING id", [landlord]);
  otherProperty = await insert("INSERT INTO properties (landlord_id,name,street_address,status,catchment) VALUES ($1,'Other','Other street','active','KIU') RETURNING id", [landlord]);
  semester = await insert("INSERT INTO semesters (name,starts_on,ends_on,re_verification_window_starts_on) VALUES ('Security scope','2026-08-01','2026-12-15','2026-11-15') RETURNING id");
  ownChanges = await insert("INSERT INTO room_inventory_change_sets (property_id,semester_id,status) VALUES ($1,$2,'pending_review') RETURNING id", [ownProperty, semester]);
  otherChanges = await insert("INSERT INTO room_inventory_change_sets (property_id,semester_id,status) VALUES ($1,$2,'pending_review') RETURNING id", [otherProperty, semester]);
  otherListing = await insert("INSERT INTO listings (property_id,semester_id,status) VALUES ($1,$2,'pending_verification') RETURNING id", [otherProperty, semester]);
});
afterAll(async () => { await pool.end(); });

it('shares the RLS scope rules: covered property allowed, other property/global/MFA absent denied', async () => {
  const check = (ctx: RlsContext, propertyId: string | null) => db.run({ ...ctx, role: 'service_role' }, (_db, client) => assertStaffScope(client, ctx, propertyId));
  await expect(check(actor, ownProperty)).resolves.toBeUndefined();
  await expect(check(actor, otherProperty)).rejects.toMatchObject({ status: 403 });
  await expect(check(actor, null)).rejects.toMatchObject({ status: 403 });
  await expect(check({ ...actor, mfaVerified: false }, ownProperty)).rejects.toMatchObject({ status: 403 });
});

it('preserves agreement editing within scope and refuses other properties', async () => {
  await expect(agreements.getTemplateForEdit(actor, ownProperty)).resolves.toBeNull();
  await expect(agreements.getTemplateForEdit(actor, otherProperty)).rejects.toMatchObject({ status: 403 });
});

it('filters the review queue and blocks approve/reject outside scope without modifying state', async () => {
  const queue = await rooms.reviewQueue(actor);
  expect(queue.map((row) => row.id)).toContain(ownChanges);
  expect(queue.map((row) => row.id)).not.toContain(otherChanges);
  await expect(rooms.approveChangeSet(actor, otherChanges)).rejects.toMatchObject({ status: 403 });
  await expect(rooms.rejectChangeSet(actor, otherChanges, 'rejected')).rejects.toMatchObject({ status: 403 });
  expect((await pool.query('SELECT status FROM room_inventory_change_sets WHERE id=$1', [otherChanges])).rows[0].status).toBe('pending_review');
});

it('denies draft creation, pre-publish deletion and global KYC before side effects', async () => {
  await expect(ops.createDraftListing(actor, { propertyId: otherProperty, semesterId: semester })).rejects.toMatchObject({ status: 403 });
  await expect(ops.publishListing(actor, { listingId: otherListing, units: [] } as unknown as PublishListingInput)).rejects.toMatchObject({ status: 403 });
  await expect(ops.decideKyc(actor, landlord, { decision: 'verified' })).rejects.toMatchObject({ status: 403 });
  expect((await pool.query('SELECT kyc_status FROM landlords WHERE user_id=$1', [landlord])).rows[0].kyc_status).toBe('pending');
});

it('honors property assignments and revoked assignments without granting platform access', async () => {
  await pool.query("UPDATE user_role_assignments SET scope_type='property',scope_id=$2 WHERE user_id=$1", [actor.userId, otherProperty]);
  await expect(agreements.getTemplateForEdit(actor, otherProperty)).resolves.toBeNull();
  await expect(agreements.getTemplateForEdit(actor, ownProperty)).rejects.toMatchObject({ status: 403 });
  await pool.query('UPDATE user_role_assignments SET revoked_at=now() WHERE user_id=$1', [actor.userId]);
  await expect(agreements.getTemplateForEdit(actor, otherProperty)).rejects.toMatchObject({ status: 403 });
});
