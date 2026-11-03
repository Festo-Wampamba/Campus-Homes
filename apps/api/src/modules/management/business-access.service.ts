import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { z } from 'zod';
import type {
  governanceRequestSchema,
  officeCaseSchema,
  officeCaseUpdateSchema,
} from '@campushomes/shared';
import { RlsDb } from '../../db/db.module';
import type { RlsContext } from '../../db/rls-context';
import { hasCoveringScope, loadPermissions, type RoleAssignment } from '../auth/permissions';
import { recordAccessAudit, SERVICE_CTX } from '../staff/role-assignment.service';

@Injectable()
export class BusinessAccessService {
  constructor(private readonly db: RlsDb) {}

  private catchments(scopes: RoleAssignment[]) {
    if (scopes.some((s) => s.scopeType === 'platform_wide' && s.scopeId === null))
      return ['MUK', 'MUBS', 'KIU', 'KYU', 'other'];
    return scopes
      .filter((s) => s.scopeType === 'catchment')
      .flatMap((s) =>
        s.scopeId === 'all' ? ['MUK', 'MUBS', 'KIU', 'KYU', 'other'] : s.scopeId ? [s.scopeId] : [],
      );
  }

  overview(scopes: RoleAssignment[]) {
    return this.db.run(SERVICE_CTX, async (_db, c) => {
      const catchments = this.catchments(scopes);
      const properties = (
        await c.query(
          `SELECT catchment::text,count(*)::int AS properties,
      count(*) FILTER(WHERE status='active')::int AS active FROM properties WHERE catchment::text=ANY($1::text[]) GROUP BY catchment ORDER BY catchment`,
          [catchments],
        )
      ).rows;
      const inventory = (
        await c.query(
          `SELECT count(*)::int AS beds FROM beds b JOIN units u ON u.id=b.unit_id
      JOIN properties p ON p.id=u.property_id WHERE p.catchment::text=ANY($1::text[]) AND u.archived_at IS NULL`,
          [catchments],
        )
      ).rows[0];
      const reservations = (
        await c.query(
          `SELECT count(*) FILTER(WHERE r.status='reserved')::int AS reserved,
      count(*) FILTER(WHERE r.status='booked')::int AS booked,count(*) FILTER(WHERE r.status='occupied')::int AS occupied,
      coalesce(sum(coalesce(r.booking_fee_collected_ugx,0)::bigint+coalesce(r.deposit_collected_ugx,0)::bigint)
       FILTER(WHERE r.payment_recorded_at>=now()-interval '30 days'),0)::text AS "recordedCollectionsUgx"
      FROM reservations r JOIN beds b ON b.id=r.bed_id JOIN units u ON u.id=b.unit_id JOIN properties p ON p.id=u.property_id
      WHERE p.catchment::text=ANY($1::text[])`,
          [catchments],
        )
      ).rows[0];
      const office = (
        await c.query(
          `SELECT count(*) FILTER(WHERE status<>'closed')::int AS open,
      count(*) FILTER(WHERE status='escalated')::int AS escalated FROM office_cases WHERE catchment=ANY($1::text[])`,
          [catchments],
        )
      ).rows[0];
      return {
        properties,
        beds: Number(inventory?.beds ?? 0),
        ...reservations,
        recordedCollectionsUgx: Number(reservations?.recordedCollectionsUgx ?? 0),
        office,
        catchments,
        asOf: new Date().toISOString(),
      };
    });
  }

  governance(actor: RlsContext, canDecide: boolean) {
    return this.db.run(
      SERVICE_CTX,
      async (_db, c) =>
        (
          await c.query(
            `
    SELECT ar.id,ar.request_type AS type,ar.payload,ar.status,ar.requested_by AS "requestedBy",u.name AS "requesterName",
     ar.decided_by AS "decidedBy",ar.decided_at AS "decidedAt",ar.reason FROM approval_requests ar
    JOIN users u ON u.id=ar.requested_by WHERE ar.target_type='business_decision' AND ($2::boolean OR ar.requested_by=$1)
    ORDER BY ar.created_at DESC LIMIT 100`,
            [actor.userId, canDecide],
          )
        ).rows,
    );
  }

  request(actor: RlsContext, input: z.infer<typeof governanceRequestSchema>) {
    return this.db.run(SERVICE_CTX, async (_db, c) => {
      const row = (
        await c.query(
          `INSERT INTO approval_requests(request_type,requested_by,target_type,payload)
      VALUES($1,$2,'business_decision',$3::jsonb) RETURNING id`,
          [input.type, actor.userId, JSON.stringify(input)],
        )
      ).rows[0];
      await recordAccessAudit(c, actor, 'governance.request', 'approval_request', row.id, {
        type: input.type,
      });
      return row;
    });
  }

  decide(actor: RlsContext, id: string, decision: string, reason: string) {
    return this.db.run(SERVICE_CTX, async (_db, c) => {
      const row = (
        await c.query<{ requested_by: string; status: string }>(
          "SELECT requested_by,status FROM approval_requests WHERE id=$1 AND target_type='business_decision' FOR UPDATE",
          [id],
        )
      ).rows[0];
      if (!row) throw new NotFoundException('Decision request not found');
      if (row.requested_by === actor.userId)
        throw new ForbiddenException('Another authorised person must decide your request');
      if (row.status !== 'pending')
        throw new BadRequestException('This request has already been decided');
      await c.query(
        'UPDATE approval_requests SET status=$2,decided_by=$3,decided_at=now(),reason=$4 WHERE id=$1',
        [id, decision, actor.userId, reason],
      );
      await recordAccessAudit(c, actor, 'governance.decide', 'approval_request', id, {
        decision,
        reason,
      });
      // This records business authority only. It never calls a payment provider,
      // assigns an account role, or changes a platform setting.
      return { id, status: decision };
    });
  }

  async office(actor: RlsContext, scopes: RoleAssignment[], supervise: boolean) {
    const access = await loadPermissions(this.db, actor.userId, 'office.manage');
    const manageCatchments = this.catchments(access.assignments).filter((x) => x !== 'other');
    return this.db.run(SERVICE_CTX, async (_db, c) => {
      const rows = (
        await c.query(
          `SELECT oc.id,oc.kind,oc.subject,oc.customer_name AS "customerName",oc.contact,oc.notes,oc.catchment,oc.status,
      oc.assigned_to AS "assignedTo",oc.scheduled_at AS "scheduledAt",oc.created_at AS "createdAt",oc.reservation_id AS "reservationId",
      r.status::text AS "reservationStatus",p.name AS "propertyName",
      CASE WHEN r.id IS NULL THEN NULL WHEN r.payment_recorded_at IS NOT NULL THEN 'recorded' ELSE 'not_recorded' END AS "paymentStatus"
      FROM office_cases oc LEFT JOIN reservations r ON r.id=oc.reservation_id LEFT JOIN beds b ON b.id=r.bed_id
      LEFT JOIN units u ON u.id=b.unit_id LEFT JOIN properties p ON p.id=u.property_id
      WHERE oc.catchment=ANY($2::text[]) AND ($3::boolean OR oc.assigned_to=$1 OR oc.created_by=$1)
      ORDER BY CASE oc.status WHEN 'escalated' THEN 0 WHEN 'open' THEN 1 WHEN 'in_progress' THEN 2 ELSE 3 END,
       oc.scheduled_at NULLS LAST,oc.created_at DESC LIMIT 200`,
          [actor.userId, this.catchments(scopes), supervise],
        )
      ).rows;
      return {
        rows,
        manageCatchments,
        catchments: this.catchments(scopes).filter((x) => x !== 'other'),
        supervise,
        asOf: new Date().toISOString(),
      };
    });
  }

  createCase(
    actor: RlsContext,
    scopes: RoleAssignment[],
    supervise: boolean,
    input: z.infer<typeof officeCaseSchema>,
  ) {
    return this.db.run(SERVICE_CTX, async (_db, c) => {
      if (!hasCoveringScope(scopes, 'catchment', input.catchment))
        throw new ForbiddenException('This case is outside your catchment');
      if (input.reservationId) {
        const reservation = (
          await c.query(
            `SELECT r.id FROM reservations r JOIN beds b ON b.id=r.bed_id
       JOIN units u ON u.id=b.unit_id JOIN properties p ON p.id=u.property_id
       WHERE r.id=$1 AND p.catchment::text=$2`,
            [input.reservationId, input.catchment],
          )
        ).rows[0];
        if (!reservation)
          throw new BadRequestException('Reservation not found in this case catchment');
      }
      const assignedTo = input.assignedTo ?? actor.userId;
      if (assignedTo !== actor.userId && !supervise)
        throw new ForbiddenException('Only an office supervisor can assign another staff member');
      const eligible = (
        await c.query(
          `SELECT u.id FROM users u JOIN user_role_assignments a ON a.user_id=u.id
      JOIN role_permissions rp ON rp.role_id=a.role_id JOIN permissions p ON p.id=rp.permission_id
      WHERE u.id=$1 AND u.status='active' AND u.deleted_at IS NULL AND a.revoked_at IS NULL AND a.valid_from<=now()
       AND (a.valid_until IS NULL OR a.valid_until>now()) AND p.key='office.manage'
       AND ((a.scope_type='platform_wide' AND a.scope_id IS NULL) OR (a.scope_type='catchment' AND a.scope_id IN ('all',$2))) LIMIT 1`,
          [assignedTo, input.catchment],
        )
      ).rows[0];
      if (!eligible)
        throw new BadRequestException(
          'Choose an active office staff member with access to this catchment',
        );
      const row = (
        await c.query(
          `INSERT INTO office_cases(kind,subject,customer_name,contact,notes,catchment,assigned_to,created_by,scheduled_at,reservation_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
          [
            input.kind,
            input.subject,
            input.customerName,
            input.contact,
            input.notes,
            input.catchment,
            assignedTo,
            actor.userId,
            input.scheduledAt ?? null,
            input.reservationId ?? null,
          ],
        )
      ).rows[0];
      await recordAccessAudit(c, actor, 'office.case_create', 'office_case', row.id, {
        kind: input.kind,
        catchment: input.catchment,
      });
      return row;
    });
  }

  updateCase(
    actor: RlsContext,
    scopes: RoleAssignment[],
    supervise: boolean,
    id: string,
    input: z.infer<typeof officeCaseUpdateSchema>,
  ) {
    return this.db.run(SERVICE_CTX, async (_db, c) => {
      const row = (
        await c.query<{ catchment: string; assigned_to: string; created_by: string }>(
          'SELECT catchment,assigned_to,created_by FROM office_cases WHERE id=$1 FOR UPDATE',
          [id],
        )
      ).rows[0];
      if (!row) throw new NotFoundException('Case not found');
      if (
        !hasCoveringScope(scopes, 'catchment', row.catchment) ||
        (!supervise && row.assigned_to !== actor.userId && row.created_by !== actor.userId)
      )
        throw new ForbiddenException('This case is outside your office assignment');
      await c.query(
        'UPDATE office_cases SET status=$2,notes=coalesce($3,notes),updated_at=now() WHERE id=$1',
        [id, input.status, input.notes ?? null],
      );
      await recordAccessAudit(c, actor, 'office.case_update', 'office_case', id, {
        status: input.status,
      });
      return { updated: true };
    });
  }
}
