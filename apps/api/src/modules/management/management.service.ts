import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { z } from 'zod';
import type {
  CreateMandateInput,
  ManagementCapability,
  managedPropertyUpdateSchema,
  managementNoteSchema,
} from '@campushomes/shared';
import { RlsDb } from '../../db/db.module';
import type { RlsContext } from '../../db/rls-context';
import { recordAccessAudit, SERVICE_CTX, STAFF_ROLE_KEYS } from '../staff/role-assignment.service';

type Mandate = {
  id: string;
  property_id: string;
  landlord_id: string;
  manager_id: string | null;
  agency_id: string | null;
  capabilities: ManagementCapability[];
  status: string;
  ends_at: Date;
};

@Injectable()
export class ManagementService {
  constructor(private readonly db: RlsDb) {}

  private write<T>(fn: (client: PoolClient) => Promise<T>) {
    return this.db.run(SERVICE_CTX, async (_db, client) => {
      // Shared mutation lock serializes revocation against acceptance, edits and
      // agency reassignment; the next request cannot reuse a revoked mandate.
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended('property-management-access', 0))",
      );
      return fn(client);
    });
  }

  private async consumer(client: PoolClient, userId: string) {
    const user = (
      await client.query(
        `SELECT id FROM users WHERE id=$1 AND status='active' AND deleted_at IS NULL
      AND role NOT IN ('admin','ops_lead','ops_inspector') AND NOT EXISTS (
       SELECT 1 FROM user_role_assignments a JOIN roles r ON r.id=a.role_id WHERE a.user_id=$1
       AND r.key=ANY($2::text[]) AND a.revoked_at IS NULL AND (a.valid_until IS NULL OR a.valid_until>now()))`,
        [userId, STAFF_ROLE_KEYS],
      )
    ).rows[0];
    if (!user)
      throw new ForbiddenException('Use a separate customer account for property management');
  }

  private async enrollInTransaction(client: PoolClient, actor: RlsContext) {
    await this.consumer(client, actor.userId);
    await client.query(
      `INSERT INTO user_role_assignments(user_id,role_id,scope_type,assigned_by,reason)
      SELECT $1,r.id,'own',$1,'Property management enrollment; property access requires a mandate' FROM roles r
      WHERE r.key='property_manager' AND NOT EXISTS (SELECT 1 FROM user_role_assignments a
       WHERE a.user_id=$1 AND a.role_id=r.id AND a.revoked_at IS NULL AND (a.valid_until IS NULL OR a.valid_until>now()))`,
      [actor.userId],
    );
  }

  enroll(actor: RlsContext) {
    return this.write(async (c) => {
      await this.enrollInTransaction(c, actor);
      await recordAccessAudit(c, actor, 'management.enroll', 'user', actor.userId, {});
      return { enrolled: true };
    });
  }

  private async owner(c: PoolClient, actor: RlsContext, propertyId: string) {
    const row = (
      await c.query(
        `SELECT p.id FROM properties p JOIN landlords l ON l.user_id=p.landlord_id
      JOIN users u ON u.id=l.user_id WHERE p.id=$1 AND p.landlord_id=$2 AND l.kyc_status='verified'
       AND u.status='active' AND u.deleted_at IS NULL`,
        [propertyId, actor.userId],
      )
    ).rows[0];
    if (!row)
      throw new ForbiddenException('Only the verified property owner can delegate management');
  }

  private async can(
    c: PoolClient,
    actor: RlsContext,
    propertyId: string,
    capability: ManagementCapability,
  ) {
    const row = (
      await c.query<{ allowed: boolean }>('SELECT app_management_access_for($1,$2,$3) AS allowed', [
        actor.userId,
        propertyId,
        capability,
      ])
    ).rows[0];
    if (!row?.allowed)
      throw new ForbiddenException('This action is outside your active property mandate');
  }

  async dashboard(actor: RlsContext) {
    return this.db.run(SERVICE_CTX, async (_db, c) => {
      const properties = (
        await c.query(
          `SELECT p.id,p.name,p.street_address AS "streetAddress",p.description,
        p.contact_phone AS "contactPhone",p.contact_email AS "contactEmail",p.operational_status AS "operationalStatus",
        ARRAY(SELECT DISTINCT cap FROM management_assignments a JOIN property_management_mandates m ON m.id=a.mandate_id,
         unnest(a.capabilities) cap WHERE m.property_id=p.id AND a.user_id=$1
         AND app_management_access_for($1,p.id,cap)) AS capabilities
        FROM properties p WHERE app_management_access_for($1,p.id,'property.read') ORDER BY p.name`,
          [actor.userId],
        )
      ).rows;
      const offers = (
        await c.query(
          `SELECT m.id,p.name AS "propertyName",m.capabilities,m.starts_at AS "startsAt",m.ends_at AS "endsAt",m.reason,
        ag.name AS "agencyName" FROM property_management_mandates m JOIN properties p ON p.id=m.property_id
        LEFT JOIN management_agencies ag ON ag.id=m.agency_id
        WHERE m.status='pending' AND m.ends_at>now() AND p.landlord_id=m.landlord_id AND (m.manager_id=$1 OR EXISTS (
         SELECT 1 FROM management_agency_members am WHERE am.agency_id=m.agency_id AND am.user_id=$1
         AND am.member_role='owner' AND am.revoked_at IS NULL)) ORDER BY m.created_at DESC`,
          [actor.userId],
        )
      ).rows;
      const agencies = (
        await c.query(
          `SELECT ag.id,ag.name,am.member_role AS "memberRole" FROM management_agencies ag
        JOIN management_agency_members am ON am.agency_id=ag.id WHERE am.user_id=$1 AND am.revoked_at IS NULL ORDER BY ag.name`,
          [actor.userId],
        )
      ).rows;
      return { properties, offers, agencies, asOf: new Date().toISOString() };
    });
  }

  async ownerDashboard(actor: RlsContext) {
    return this.db.run(SERVICE_CTX, async (_db, c) => {
      const properties = (
        await c.query(
          `SELECT p.id,p.name FROM properties p JOIN landlords l ON l.user_id=p.landlord_id
       WHERE p.landlord_id=$1 AND l.kyc_status='verified' ORDER BY p.name`,
          [actor.userId],
        )
      ).rows;
      const mandates = (
        await c.query(
          `SELECT m.id,m.property_id AS "propertyId",p.name AS "propertyName",m.status,m.capabilities,
        m.starts_at AS "startsAt",m.ends_at AS "endsAt",m.reason,coalesce(ag.name,u.name,u.email) AS "managerName",
        m.agency_id AS "agencyId" FROM property_management_mandates m JOIN properties p ON p.id=m.property_id
        LEFT JOIN management_agencies ag ON ag.id=m.agency_id LEFT JOIN users u ON u.id=m.manager_id
        WHERE m.landlord_id=$1 AND p.landlord_id=$1 ORDER BY m.created_at DESC`,
          [actor.userId],
        )
      ).rows;
      const agencies = (
        await c.query('SELECT id,name FROM management_agencies ORDER BY name LIMIT 200')
      ).rows;
      const notes = (
        await c.query(
          `SELECT n.id,n.kind,n.title,n.body,n.status,p.name AS "propertyName",n.created_at AS "createdAt"
       FROM management_notes n JOIN properties p ON p.id=n.property_id WHERE p.landlord_id=$1 ORDER BY n.created_at DESC LIMIT 100`,
          [actor.userId],
        )
      ).rows;
      return { properties, mandates, agencies, notes, asOf: new Date().toISOString() };
    });
  }

  createAgency(actor: RlsContext, name: string) {
    return this.write(async (c) => {
      await this.enrollInTransaction(c, actor);
      const agency = (
        await c.query(
          'INSERT INTO management_agencies(name,created_by) VALUES($1,$2) RETURNING id,name',
          [name, actor.userId],
        )
      ).rows[0];
      await c.query(
        "INSERT INTO management_agency_members(agency_id,user_id,member_role) VALUES($1,$2,'owner')",
        [agency.id, actor.userId],
      );
      await recordAccessAudit(c, actor, 'management.agency_create', 'agency', agency.id, { name });
      return agency;
    });
  }

  private async agencyOwner(c: PoolClient, actor: RlsContext, agencyId: string) {
    await this.consumer(c, actor.userId);
    const member = (
      await c.query(
        `SELECT id FROM management_agency_members WHERE agency_id=$1 AND user_id=$2
      AND member_role='owner' AND revoked_at IS NULL`,
        [agencyId, actor.userId],
      )
    ).rows[0];
    if (!member) throw new ForbiddenException('Only the agency owner can manage its membership');
  }

  agencyMembers(actor: RlsContext, agencyId: string) {
    return this.db.run(SERVICE_CTX, async (_db, c) => {
      await this.agencyOwner(c, actor, agencyId);
      return (
        await c.query(
          `SELECT am.id,am.user_id AS "userId",u.name,u.email,am.member_role AS "memberRole"
      FROM management_agency_members am JOIN users u ON u.id=am.user_id WHERE am.agency_id=$1 AND am.revoked_at IS NULL ORDER BY u.name`,
          [agencyId],
        )
      ).rows;
    });
  }

  addMember(actor: RlsContext, agencyId: string, email: string) {
    return this.write(async (c) => {
      await this.agencyOwner(c, actor, agencyId);
      const target = (
        await c.query(
          "SELECT id FROM users WHERE lower(email)=lower($1) AND status='active' AND deleted_at IS NULL",
          [email],
        )
      ).rows[0];
      if (!target)
        throw new NotFoundException(
          'This person must first register an active CampusHomes customer account',
        );
      await this.consumer(c, target.id);
      // Membership alone grants no workspace or property authority. They must
      // enroll themselves and receive an explicit property assignment.
      const member = (
        await c.query(
          `INSERT INTO management_agency_members(agency_id,user_id,member_role) VALUES($1,$2,'member')
      ON CONFLICT(agency_id,user_id) WHERE revoked_at IS NULL DO UPDATE SET user_id=EXCLUDED.user_id RETURNING id`,
          [agencyId, target.id],
        )
      ).rows[0];
      await recordAccessAudit(c, actor, 'management.member_add', 'agency', agencyId, {
        userId: target.id,
      });
      return member;
    });
  }

  removeMember(actor: RlsContext, agencyId: string, memberId: string) {
    return this.write(async (c) => {
      await this.agencyOwner(c, actor, agencyId);
      const member = (
        await c.query(
          `UPDATE management_agency_members SET revoked_at=now() WHERE id=$1 AND agency_id=$2
      AND member_role='member' AND revoked_at IS NULL RETURNING user_id`,
          [memberId, agencyId],
        )
      ).rows[0];
      if (!member)
        throw new NotFoundException(
          'Active member not found; agency owners cannot remove themselves',
        );
      await c.query(
        `UPDATE management_assignments a SET revoked_at=now() FROM property_management_mandates m
      WHERE a.mandate_id=m.id AND m.agency_id=$1 AND a.user_id=$2 AND a.revoked_at IS NULL`,
        [agencyId, member.user_id],
      );
      await recordAccessAudit(c, actor, 'management.member_remove', 'agency', agencyId, {
        userId: member.user_id,
      });
      return { revoked: true };
    });
  }

  createMandate(actor: RlsContext, input: CreateMandateInput) {
    return this.write(async (c) => {
      await this.owner(c, actor, input.propertyId);
      let managerId: string | null = null;
      if (input.managerEmail) {
        managerId =
          (
            await c.query<{ id: string }>(
              `SELECT id FROM users WHERE lower(email)=lower($1) AND status='active' AND deleted_at IS NULL`,
              [input.managerEmail],
            )
          ).rows[0]?.id ?? null;
        if (!managerId)
          throw new NotFoundException(
            'The manager must first register an active CampusHomes customer account',
          );
        if (managerId === actor.userId)
          throw new BadRequestException('Choose a separate manager account');
        await this.consumer(c, managerId);
      } else if (
        !(await c.query('SELECT id FROM management_agencies WHERE id=$1', [input.agencyId])).rows[0]
      ) {
        throw new NotFoundException('Agency not found');
      }
      const row = (
        await c.query(
          `INSERT INTO property_management_mandates(property_id,landlord_id,manager_id,agency_id,capabilities,starts_at,ends_at,reason)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
          [
            input.propertyId,
            actor.userId,
            managerId,
            input.agencyId ?? null,
            input.capabilities,
            input.startsAt,
            input.endsAt,
            input.reason,
          ],
        )
      ).rows[0];
      await recordAccessAudit(c, actor, 'management.mandate_offer', 'management_mandate', row.id, {
        propertyId: input.propertyId,
        capabilities: input.capabilities,
      });
      return row;
    });
  }

  decideMandate(actor: RlsContext, id: string, decision: 'accept' | 'reject') {
    return this.write(async (c) => {
      await this.consumer(c, actor.userId);
      const m = (
        await c.query<Mandate>(
          `SELECT * FROM property_management_mandates WHERE id=$1 AND status='pending' AND ends_at>now() FOR UPDATE`,
          [id],
        )
      ).rows[0];
      if (!m) throw new NotFoundException('Pending mandate not found or expired');
      if (m.agency_id) await this.agencyOwner(c, actor, m.agency_id);
      else if (m.manager_id !== actor.userId)
        throw new ForbiddenException('This mandate belongs to another manager');
      await this.owner(c, { ...actor, userId: m.landlord_id }, m.property_id);
      await c.query(
        'UPDATE property_management_mandates SET status=$2,accepted_by=$3,accepted_at=now() WHERE id=$1',
        [id, decision === 'accept' ? 'active' : 'rejected', actor.userId],
      );
      if (decision === 'accept') {
        await this.enrollInTransaction(c, actor);
        await c.query(
          'INSERT INTO management_assignments(mandate_id,user_id,capabilities,assigned_by) VALUES($1,$2,$3,$2)',
          [id, actor.userId, m.capabilities],
        );
      }
      await recordAccessAudit(
        c,
        actor,
        `management.mandate_${decision}`,
        'management_mandate',
        id,
        {},
      );
      return { accepted: decision === 'accept' };
    });
  }

  revokeMandate(actor: RlsContext, id: string) {
    return this.write(async (c) => {
      const m = (
        await c.query<Mandate>(
          'SELECT * FROM property_management_mandates WHERE id=$1 FOR UPDATE',
          [id],
        )
      ).rows[0];
      if (!m) throw new NotFoundException('Mandate not found');
      await this.owner(c, actor, m.property_id);
      await c.query(
        "UPDATE property_management_mandates SET status='revoked',revoked_at=now() WHERE id=$1",
        [id],
      );
      await c.query(
        'UPDATE management_assignments SET revoked_at=now() WHERE mandate_id=$1 AND revoked_at IS NULL',
        [id],
      );
      await recordAccessAudit(c, actor, 'management.mandate_revoke', 'management_mandate', id, {});
      return { revoked: true };
    });
  }

  team(actor: RlsContext, propertyId: string) {
    return this.db.run(SERVICE_CTX, async (_db, c) => {
      await this.can(c, actor, propertyId, 'team.manage');
      const mandates = (
        await c.query(
          `SELECT m.id,ag.name AS "agencyName",m.agency_id AS "agencyId",
        (SELECT own.capabilities FROM management_assignments own WHERE own.mandate_id=m.id AND own.user_id=$1 AND own.revoked_at IS NULL) AS capabilities FROM property_management_mandates m
      JOIN management_agencies ag ON ag.id=m.agency_id WHERE m.property_id=$2 AND m.status='active' AND m.starts_at<=now() AND m.ends_at>now()
      AND EXISTS(SELECT 1 FROM management_assignments a WHERE a.mandate_id=m.id AND a.user_id=$1 AND a.revoked_at IS NULL AND 'team.manage'=ANY(a.capabilities))
      AND EXISTS(SELECT 1 FROM management_agency_members am WHERE am.agency_id=m.agency_id AND am.user_id=$1 AND am.revoked_at IS NULL)`,
          [actor.userId, propertyId],
        )
      ).rows;
      const members = (
        await c.query(
          `SELECT am.id,am.user_id AS "userId",u.name,u.email,am.agency_id AS "agencyId" FROM management_agency_members am
      JOIN users u ON u.id=am.user_id WHERE am.revoked_at IS NULL AND am.agency_id IN (SELECT agency_id FROM property_management_mandates WHERE id=ANY($1::uuid[]))`,
          [mandates.map((m) => m.id)],
        )
      ).rows;
      const assignments = (
        await c.query(
          `SELECT a.id,a.mandate_id AS "mandateId",a.user_id AS "userId",a.capabilities,u.name FROM management_assignments a
      JOIN users u ON u.id=a.user_id WHERE a.mandate_id=ANY($1::uuid[]) AND a.revoked_at IS NULL`,
          [mandates.map((m) => m.id)],
        )
      ).rows;
      return { mandates, members, assignments, actorUserId: actor.userId };
    });
  }

  assign(
    actor: RlsContext,
    mandateId: string,
    userId: string,
    capabilities: ManagementCapability[],
  ) {
    return this.write(async (c) => {
      const m = (
        await c.query<Mandate>(
          'SELECT * FROM property_management_mandates WHERE id=$1 FOR UPDATE',
          [mandateId],
        )
      ).rows[0];
      if (!m || !m.agency_id) throw new NotFoundException('Agency mandate not found');
      await this.can(c, actor, m.property_id, 'team.manage');
      const own = (
        await c.query<{ capabilities: ManagementCapability[] }>(
          `SELECT capabilities FROM management_assignments WHERE mandate_id=$1 AND user_id=$2
      AND revoked_at IS NULL AND 'team.manage'=ANY(capabilities)`,
          [mandateId, actor.userId],
        )
      ).rows[0];
      if (
        !own ||
        !capabilities.every((cap) => own.capabilities.includes(cap) && m.capabilities.includes(cap))
      )
        throw new ForbiddenException('You can only delegate permissions you hold on this mandate');
      if (userId === actor.userId)
        throw new ForbiddenException('You cannot change your own property assignment');
      const member = (
        await c.query(
          `SELECT id FROM management_agency_members WHERE agency_id=$1 AND user_id=$2 AND revoked_at IS NULL`,
          [m.agency_id, userId],
        )
      ).rows[0];
      if (!member) throw new ForbiddenException('Select an active member of this agency');
      await this.consumer(c, userId);
      // Require the member's explicit enrollment instead of granting a workspace
      // merely because an agency administrator added their email address.
      const enrolled = (
        await c.query(
          `SELECT a.id FROM user_role_assignments a JOIN roles r ON r.id=a.role_id WHERE a.user_id=$1
      AND r.key='property_manager' AND a.revoked_at IS NULL AND a.valid_from<=now() AND (a.valid_until IS NULL OR a.valid_until>now())`,
          [userId],
        )
      ).rows[0];
      if (!enrolled)
        throw new BadRequestException(
          'This member must first enable their property management workspace',
        );
      const row = (
        await c.query(
          `INSERT INTO management_assignments(mandate_id,user_id,capabilities,assigned_by) VALUES($1,$2,$3,$4)
      ON CONFLICT(mandate_id,user_id) WHERE revoked_at IS NULL DO UPDATE SET capabilities=EXCLUDED.capabilities,assigned_by=EXCLUDED.assigned_by RETURNING id`,
          [mandateId, userId, capabilities, actor.userId],
        )
      ).rows[0];
      await recordAccessAudit(c, actor, 'management.assign', 'management_mandate', mandateId, {
        userId,
        capabilities,
      });
      return row;
    });
  }

  revokeAssignment(actor: RlsContext, id: string) {
    return this.write(async (c) => {
      const row = (
        await c.query<{
          mandate_id: string;
          property_id: string;
          capabilities: string[];
          user_id: string;
        }>(
          `SELECT a.*,m.property_id FROM management_assignments a
      JOIN property_management_mandates m ON m.id=a.mandate_id WHERE a.id=$1 AND a.revoked_at IS NULL`,
          [id],
        )
      ).rows[0];
      if (!row) throw new NotFoundException('Assignment not found');
      const own = (
        await c.query(
          `SELECT id FROM management_assignments WHERE mandate_id=$1 AND user_id=$2 AND revoked_at IS NULL AND 'team.manage'=ANY(capabilities)`,
          [row.mandate_id, actor.userId],
        )
      ).rows[0];
      await this.can(c, actor, row.property_id, 'team.manage');
      if (!own || row.user_id === actor.userId)
        throw new ForbiddenException('You cannot revoke this assignment');
      await c.query('UPDATE management_assignments SET revoked_at=now() WHERE id=$1', [id]);
      await recordAccessAudit(
        c,
        actor,
        'management.assignment_revoke',
        'management_assignment',
        id,
        {},
      );
      return { revoked: true };
    });
  }

  property(actor: RlsContext, propertyId: string) {
    return this.db.run(SERVICE_CTX, async (_db, c) => {
      await this.can(c, actor, propertyId, 'property.read');
      const units = (
        await c.query(
          `SELECT u.id,u.label AS code,u.operational_status AS status FROM units u
      WHERE u.property_id=$2 AND app_management_access_for($1,u.property_id,'property.read') ORDER BY u.label`,
          [actor.userId, propertyId],
        )
      ).rows;
      const reservations = (
        await c.query(
          `SELECT r.id,r.status::text,u.label AS "unitCode",r.booked_at AS "bookedAt",r.reserved_at AS "reservedAt",
      su.name AS "studentName" FROM reservations r JOIN beds b ON b.id=r.bed_id JOIN units u ON u.id=b.unit_id
      JOIN users su ON su.id=r.student_id WHERE u.property_id=$2 AND app_management_access_for($1,u.property_id,'reservations.read')
      ORDER BY r.created_at DESC LIMIT 100`,
          [actor.userId, propertyId],
        )
      ).rows;
      const finance = (
        await c.query(
          `SELECT r.id,r.status::text,r.booking_fee_collected_ugx AS "bookingFeeCollectedUgx",
      r.deposit_collected_ugx AS "depositCollectedUgx",r.payment_recorded_at AS "recordedAt" FROM reservations r
      JOIN beds b ON b.id=r.bed_id JOIN units u ON u.id=b.unit_id WHERE u.property_id=$2
      AND app_management_access_for($1,u.property_id,'finance.read') ORDER BY r.created_at DESC LIMIT 100`,
          [actor.userId, propertyId],
        )
      ).rows;
      const notes = (
        await c.query(
          `SELECT n.id,n.kind,n.title,n.body,n.status,n.created_at AS "createdAt" FROM management_notes n
      WHERE n.property_id=$2 AND app_management_access_for($1,n.property_id,CASE n.kind
       WHEN 'maintenance' THEN 'maintenance.manage' WHEN 'incident' THEN 'maintenance.manage'
       WHEN 'notice' THEN 'notices.manage' ELSE 'reports.submit' END) ORDER BY n.created_at DESC LIMIT 100`,
          [actor.userId, propertyId],
        )
      ).rows;
      return { units, reservations, finance, notes };
    });
  }

  notices(actor: RlsContext) {
    return this.db.run(
      SERVICE_CTX,
      async (_db, c) =>
        (
          await c.query(
            `
    SELECT n.id,n.title,n.body,n.created_at AS "createdAt",p.name AS "propertyName" FROM management_notes n
    JOIN properties p ON p.id=n.property_id WHERE n.kind='notice' AND EXISTS (
     SELECT 1 FROM reservations r JOIN beds b ON b.id=r.bed_id JOIN units u ON u.id=b.unit_id
     WHERE r.student_id=$1 AND r.status IN ('booked','occupied') AND u.property_id=n.property_id)
    ORDER BY n.created_at DESC LIMIT 30`,
            [actor.userId],
          )
        ).rows,
    );
  }

  updateProperty(
    actor: RlsContext,
    propertyId: string,
    input: z.infer<typeof managedPropertyUpdateSchema>,
  ) {
    return this.write(async (c) => {
      await this.can(c, actor, propertyId, 'property.edit');
      await c.query(
        `UPDATE properties SET description=coalesce($2,description),contact_phone=coalesce($3,contact_phone),contact_email=coalesce($4,contact_email)
      WHERE id=$1`,
        [
          propertyId,
          input.description ?? null,
          input.contactPhone ?? null,
          input.contactEmail ?? null,
        ],
      );
      await recordAccessAudit(c, actor, 'management.property_update', 'property', propertyId, {
        fields: Object.keys(input),
      });
      return { updated: true };
    });
  }

  addNote(actor: RlsContext, propertyId: string, input: z.infer<typeof managementNoteSchema>) {
    return this.write(async (c) => {
      const capability =
        input.kind === 'notice'
          ? 'notices.manage'
          : input.kind === 'report'
            ? 'reports.submit'
            : 'maintenance.manage';
      await this.can(c, actor, propertyId, capability);
      const row = (
        await c.query(
          `INSERT INTO management_notes(property_id,kind,title,body,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id`,
          [propertyId, input.kind, input.title, input.body, actor.userId],
        )
      ).rows[0];
      await recordAccessAudit(c, actor, `management.${input.kind}_create`, 'property', propertyId, {
        noteId: row.id,
      });
      return row;
    });
  }

  updateNote(actor: RlsContext, noteId: string, status: string) {
    return this.write(async (c) => {
      const note = (
        await c.query<{ property_id: string; kind: string }>(
          'SELECT property_id,kind FROM management_notes WHERE id=$1',
          [noteId],
        )
      ).rows[0];
      if (!note) throw new NotFoundException('Record not found');
      if (!['maintenance', 'incident'].includes(note.kind))
        throw new BadRequestException('Published notices and submitted reports cannot be changed');
      await this.can(c, actor, note.property_id, 'maintenance.manage');
      await c.query('UPDATE management_notes SET status=$2,updated_at=now() WHERE id=$1', [
        noteId,
        status,
      ]);
      await recordAccessAudit(
        c,
        actor,
        'management.maintenance_update',
        'property',
        note.property_id,
        { noteId, status },
      );
      return { updated: true };
    });
  }
}
