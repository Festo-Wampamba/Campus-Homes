import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import type { UpdateRolePermissionsInput } from '@campushomes/shared';

import { loadEnv } from '../../config/env';
import { RlsDb } from '../../db/db.module';
import type { RlsContext } from '../../db/rls-context';
import { runtimeRedisUrl } from '../../db/redis.module';
import { loadPermissions } from '../auth/permissions';
import { AuditService } from '../ops/audit.service';

const SERVICE_CTX: RlsContext = {
  userId: '00000000-0000-0000-0000-000000000000',
  role: 'service_role',
};

type CountRow = { value: string };

function number(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

@Injectable()
export class AdminDashboardService {
  constructor(
    private readonly rlsDb: RlsDb,
    private readonly audit: AuditService,
  ) {}

  async access(userId: string) {
    const loaded = await loadPermissions(this.rlsDb, userId);
    const assignments = await this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      const result = await client.query<{
        id: string;
        roleKey: string;
        roleName: string;
        scopeType: string;
        scopeId: string | null;
        validUntil: Date | null;
      }>(`
        SELECT ura.id, r.key AS "roleKey", r.name AS "roleName",
               ura.scope_type AS "scopeType", ura.scope_id AS "scopeId",
               ura.valid_until AS "validUntil"
        FROM user_role_assignments ura
        JOIN roles r ON r.id = ura.role_id
        WHERE ura.user_id = $1
          AND ura.revoked_at IS NULL
          AND ura.valid_from <= now()
          AND (ura.valid_until IS NULL OR ura.valid_until > now())
        ORDER BY r.name, ura.scope_type, ura.scope_id NULLS FIRST
      `, [userId]);
      return result.rows;
    });

    return {
      permissions: [...loaded.permissions].sort(),
      stepUpPermissions: [...loaded.stepUpRequired].sort(),
      assignments,
      freshSignInWindowMinutes: 15,
    };
  }

  overview() {
    return this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      const summary = await client.query<{
        totalUsers: string;
        activeUsers: string;
        newUsers30d: string;
        priorUsers30d: string;
        properties: string;
        verifiedListings: string;
        reservations: string;
        reservations30d: string;
        priorReservations30d: string;
        revenueUgx: string;
        revenue30dUgx: string;
        priorRevenue30dUgx: string;
        pendingKyc: string;
        pendingVisits: string;
        pendingRefunds: string;
        failedNotifications: string;
      }>(`
        SELECT
          (SELECT count(*) FROM users)::text AS "totalUsers",
          (SELECT count(*) FROM users WHERE status = 'active')::text AS "activeUsers",
          (SELECT count(*) FROM users WHERE created_at >= now() - interval '30 days')::text AS "newUsers30d",
          (SELECT count(*) FROM users WHERE created_at >= now() - interval '60 days' AND created_at < now() - interval '30 days')::text AS "priorUsers30d",
          (SELECT count(*) FROM properties)::text AS properties,
          (SELECT count(*) FROM listings WHERE status = 'verified')::text AS "verifiedListings",
          (SELECT count(*) FROM reservations)::text AS reservations,
          (SELECT count(*) FROM reservations WHERE created_at >= now() - interval '30 days')::text AS "reservations30d",
          (SELECT count(*) FROM reservations WHERE created_at >= now() - interval '60 days' AND created_at < now() - interval '30 days')::text AS "priorReservations30d",
          (SELECT coalesce(sum(amount_ugx), 0) FROM payments WHERE status = 'succeeded')::text AS "revenueUgx",
          (SELECT coalesce(sum(amount_ugx), 0) FROM payments WHERE status = 'succeeded' AND created_at >= now() - interval '30 days')::text AS "revenue30dUgx",
          (SELECT coalesce(sum(amount_ugx), 0) FROM payments WHERE status = 'succeeded' AND created_at >= now() - interval '60 days' AND created_at < now() - interval '30 days')::text AS "priorRevenue30dUgx",
          (SELECT count(*) FROM landlords WHERE kyc_status = 'pending')::text AS "pendingKyc",
          (SELECT count(*) FROM verification_visits
            WHERE result = 'pending' OR result = 'failed' OR (result = 'passed' AND approved_at IS NULL))::text AS "pendingVisits",
          (SELECT count(*) FROM refunds WHERE status = 'pending')::text AS "pendingRefunds",
          (SELECT count(*) FROM notifications WHERE status = 'failed')::text AS "failedNotifications"
      `);

      const growth = await client.query<{ month: string; users: string; reservations: string }>(`
        WITH months AS (
          SELECT generate_series(
            date_trunc('month', now()) - interval '5 months',
            date_trunc('month', now()), interval '1 month'
          ) AS month
        )
        SELECT to_char(m.month, 'Mon') AS month,
          (SELECT count(*) FROM users u WHERE u.created_at >= m.month AND u.created_at < m.month + interval '1 month')::text AS users,
          (SELECT count(*) FROM reservations r WHERE r.created_at >= m.month AND r.created_at < m.month + interval '1 month')::text AS reservations
        FROM months m ORDER BY m.month
      `);

      const reservationStatus = await client.query<{ status: string; count: string }>(`
        SELECT status::text, count(*)::text AS count
        FROM reservations GROUP BY status ORDER BY count(*) DESC, status
      `);

      const recentActivity = await client.query<{
        id: string;
        actorName: string;
        action: string;
        targetType: string;
        targetId: string;
        ts: Date;
      }>(`
        SELECT a.id, coalesce(nullif(u.name, ''), u.email, 'System') AS "actorName",
               a.action, a.target_type AS "targetType", a.target_id AS "targetId", a.ts
        FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
        ORDER BY a.ts DESC LIMIT 8
      `);

      const s = summary.rows[0]!;
      return {
        summary: Object.fromEntries(Object.entries(s).map(([key, value]) => [key, number(value)])),
        growth: growth.rows.map((row) => ({ ...row, users: number(row.users), reservations: number(row.reservations) })),
        reservationStatus: reservationStatus.rows.map((row) => ({ status: row.status, count: number(row.count) })),
        recentActivity: recentActivity.rows,
        meta: {
          asOf: new Date().toISOString(),
          source: 'CampusHomes operational PostgreSQL',
          grain: 'Current totals; 30-day comparisons; monthly cohorts in UTC',
        },
      };
    });
  }

  users(granted: Set<string>) {
    return this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      const result = await client.query(`
        SELECT u.id, u.name, u.email, u.phone, u.role::text, u.status::text,
               u.email_verified AS "emailVerified", u.phone_verified AS "phoneVerified",
               coalesce(array_agg(DISTINCT a.provider_id) FILTER (WHERE a.provider_id IS NOT NULL), '{}') AS "authProviders",
               u.created_at AS "createdAt", s.university::text,
               l.kyc_status::text AS "kycStatus",
               coalesce(jsonb_agg(DISTINCT jsonb_build_object(
                 'id', ura.id, 'key', r.key, 'name', r.name,
                 'scopeType', ura.scope_type, 'scopeId', ura.scope_id,
                 'validUntil', ura.valid_until
               )) FILTER (WHERE ura.id IS NOT NULL), '[]'::jsonb) AS assignments
        FROM users u
        LEFT JOIN students s ON s.user_id = u.id
        LEFT JOIN landlords l ON l.user_id = u.id
        LEFT JOIN accounts a ON a.user_id = u.id
        LEFT JOIN user_role_assignments ura ON ura.user_id = u.id AND ura.revoked_at IS NULL
          AND ura.valid_from <= now() AND (ura.valid_until IS NULL OR ura.valid_until > now())
        LEFT JOIN roles r ON r.id = ura.role_id
        WHERE u.deleted_at IS NULL AND ((u.role = 'student' AND $1::boolean)
           OR (u.role = 'landlord' AND $2::boolean)
           OR (u.role IN ('admin', 'ops_lead', 'ops_inspector', 'custodian', 'property_worker') AND $3::boolean))
        GROUP BY u.id, s.university, l.kyc_status
        ORDER BY u.created_at DESC LIMIT 250
      `, [granted.has('students.read'), granted.has('landlords.read'), granted.has('staff.read')]);
      return { rows: result.rows, asOf: new Date().toISOString(), limit: 250 };
    });
  }

  properties() {
    return this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      const result = await client.query(`
        SELECT p.id, p.name, p.street_address AS "streetAddress", p.catchment::text,
               p.type::text, p.status::text, p.operational_status AS "operationalStatus",
               p.amenities, p.utilities, p.cover_photo_key AS "coverPhotoKey",
               p.created_at AS "createdAt",
               coalesce(nullif(u.name, ''), l.legal_name) AS "landlordName",
               l.kyc_status::text AS "landlordKycStatus",
               li.id AS "listingId", li.status::text AS "listingStatus", li.verified_at AS "verifiedAt",
               (SELECT count(*)::int FROM units un WHERE un.listing_id = li.id) AS "unitCount",
               (SELECT count(*)::int FROM property_media pm WHERE pm.property_id = p.id) AS "imageCount",
               (SELECT count(*)::int FROM units un JOIN listings ux ON ux.id = un.listing_id
                 WHERE ux.property_id = p.id AND un.operational_status IN ('available', 'vacant')) AS "availableUnits",
               vv.result::text AS "latestVisitResult", vv.scheduled_at AS "visitScheduledAt"
        FROM properties p
        JOIN landlords l ON l.user_id = p.landlord_id
        JOIN users u ON u.id = p.landlord_id AND u.deleted_at IS NULL
        LEFT JOIN LATERAL (SELECT * FROM listings x WHERE x.property_id = p.id ORDER BY x.created_at DESC LIMIT 1) li ON true
        LEFT JOIN LATERAL (SELECT * FROM verification_visits x WHERE x.property_id = p.id ORDER BY x.created_at DESC LIMIT 1) vv ON true
        ORDER BY p.created_at DESC LIMIT 250
      `);
      return { rows: result.rows, asOf: new Date().toISOString(), limit: 250 };
    });
  }

  verifications(granted: Set<string>) {
    return this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      const visits = granted.has('visits.read') ? await client.query(`
        SELECT v.id, p.name AS "propertyName", p.catchment::text,
               coalesce(nullif(i.name, ''), i.email) AS "inspectorName",
               v.result::text, v.scheduled_at AS "scheduledAt", v.started_at AS "startedAt",
               v.completed_at AS "completedAt", v.failure_reason AS "failureReason",
               (SELECT count(*)::int FROM jsonb_each(v.checklist)) AS "checklistItems"
        FROM verification_visits v
        JOIN properties p ON p.id = v.property_id
        JOIN users i ON i.id = v.inspector_id
        ORDER BY coalesce(v.scheduled_at, v.created_at) DESC LIMIT 200
      `) : { rows: [] };
      const kyc = granted.has('landlords.read') ? await client.query(`
        SELECT u.id, coalesce(nullif(u.name, ''), l.legal_name) AS name, u.email, u.phone,
               l.kyc_status::text AS status, l.created_at AS "submittedAt",
               l.kyc_reviewed_at AS "reviewedAt"
        FROM landlords l JOIN users u ON u.id = l.user_id
        ORDER BY CASE l.kyc_status WHEN 'pending' THEN 0 ELSE 1 END, l.created_at DESC LIMIT 200
      `) : { rows: [] };
      return { visits: visits.rows, landlordKyc: kyc.rows, asOf: new Date().toISOString() };
    });
  }

  reservations() {
    return this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      const result = await client.query(`
        SELECT r.id, r.status::text, r.fee_amount_ugx AS "feeAmountUgx",
               r.hold_expires_at AS "holdExpiresAt", r.cooling_off_expires_at AS "coolingOffExpiresAt",
               r.created_at AS "createdAt", coalesce(nullif(su.name, ''), su.email, su.phone) AS student,
               p.name AS property, un.label AS unit,
               pay.status::text AS "paymentStatus", pay.payment_method::text AS "paymentMethod"
        FROM reservations r
        JOIN users su ON su.id = r.student_id
        JOIN units un ON un.id = r.unit_id
        JOIN listings li ON li.id = un.listing_id
        JOIN properties p ON p.id = li.property_id
        LEFT JOIN LATERAL (SELECT * FROM payments x WHERE x.reservation_id = r.id ORDER BY x.created_at DESC LIMIT 1) pay ON true
        ORDER BY r.created_at DESC LIMIT 250
      `);
      return { rows: result.rows, asOf: new Date().toISOString(), limit: 250 };
    });
  }

  payments() {
    return this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      const payments = await client.query(`
        SELECT pay.id, pay.status::text, pay.amount_ugx AS "amountUgx", pay.currency,
               pay.payment_method::text AS "paymentMethod", pay.provider::text,
               pay.provider_txn_id AS "providerTxnId", pay.webhook_verified AS "webhookVerified",
               pay.created_at AS "createdAt", r.id AS "reservationId",
               coalesce(nullif(u.name, ''), u.email, u.phone) AS customer
        FROM payments pay JOIN reservations r ON r.id = pay.reservation_id
        JOIN users u ON u.id = r.student_id
        ORDER BY pay.created_at DESC LIMIT 250
      `);
      const refunds = await client.query(`
        SELECT rf.id, rf.status::text, rf.reason::text, rf.amount_ugx AS "amountUgx",
               rf.provider_refund_id AS "providerRefundId", rf.created_at AS "createdAt",
               rf.processed_at AS "processedAt", rf.reservation_id AS "reservationId"
        FROM refunds rf ORDER BY rf.created_at DESC LIMIT 200
      `);
      return { payments: payments.rows, refunds: refunds.rows, asOf: new Date().toISOString() };
    });
  }

  cases(granted: Set<string>) {
    return this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      const refunds = granted.has('refunds.read') || granted.has('disputes.read') ? await client.query(`
        SELECT rf.id, 'refund' AS type, rf.status::text, rf.reason::text,
               rf.notes AS description, rf.amount_ugx AS "amountUgx", rf.created_at AS "createdAt",
               rf.reservation_id AS "reservationId"
        FROM refunds rf ORDER BY rf.created_at DESC LIMIT 100
      `) : { rows: [] };
      const strikes = granted.has('strikes.read') ? await client.query(`
        SELECT ls.id, 'landlord_strike' AS type, 'issued' AS status, ls.reason::text,
               ls.description, null::int AS "amountUgx", ls.issued_at AS "createdAt",
               ls.reservation_id AS "reservationId", coalesce(nullif(u.name, ''), u.email, u.phone) AS subject
        FROM landlord_strikes ls JOIN users u ON u.id = ls.landlord_id
        ORDER BY ls.issued_at DESC LIMIT 100
      `) : { rows: [] };
      const flags = granted.has('students.read') ? await client.query(`
        SELECT sf.id, 'student_flag' AS type, 'issued' AS status, sf.reason::text,
               sf.description, null::int AS "amountUgx", sf.issued_at AS "createdAt",
               sf.reservation_id AS "reservationId", coalesce(nullif(u.name, ''), u.email, u.phone) AS subject
        FROM student_flags sf JOIN users u ON u.id = sf.student_id
        ORDER BY sf.issued_at DESC LIMIT 100
      `) : { rows: [] };
      return {
        rows: [...refunds.rows, ...strikes.rows, ...flags.rows].sort(
          (a, b) => new Date(String(b.createdAt)).getTime() - new Date(String(a.createdAt)).getTime(),
        ),
        asOf: new Date().toISOString(),
        modelNote: 'MVP dispute work is represented by refund, landlord-strike, and student-flag records.',
      };
    });
  }

  reports() {
    return this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      const catchments = await client.query(`
        SELECT p.catchment::text,
               count(DISTINCT p.id)::int AS properties,
               count(DISTINCT li.id) FILTER (WHERE li.status = 'verified')::int AS "verifiedListings",
               count(DISTINCT r.id)::int AS reservations,
               coalesce(sum(pay.amount_ugx) FILTER (WHERE pay.status = 'succeeded'), 0)::bigint AS "revenueUgx"
        FROM properties p
        LEFT JOIN listings li ON li.property_id = p.id
        LEFT JOIN units un ON un.listing_id = li.id
        LEFT JOIN reservations r ON r.unit_id = un.id
        LEFT JOIN payments pay ON pay.reservation_id = r.id
        GROUP BY p.catchment ORDER BY p.catchment
      `);
      const usersByRole = await client.query(`SELECT role::text, count(*)::int AS count FROM users GROUP BY role ORDER BY role`);
      // Pilot-funnel backstop (0032, workbook §10.2 daily huddle / Form 11):
      // searches/listingViews come from product_events (the only two funnel
      // steps with no existing table); enquiries/viewingRequests/
      // landlordResponses/safetyReports all derive from `inquiries` (0031) —
      // no separate event needed for those. "viewingRequests" is a
      // best-effort subject-prefix match (AskLandlordDialog's only signal
      // for the checkbox today, see ask-landlord-dialog.tsx) rather than a
      // dedicated column.
      const pilotFunnel = await client.query(`
        WITH days AS (
          SELECT generate_series(date_trunc('day', now()) - interval '13 days', date_trunc('day', now()), interval '1 day') AS day
        )
        SELECT to_char(d.day, 'Mon DD') AS date,
          (SELECT count(*) FROM product_events e WHERE e.event_type = 'search' AND e.created_at >= d.day AND e.created_at < d.day + interval '1 day')::int AS searches,
          (SELECT count(*) FROM product_events e WHERE e.event_type = 'listing_view' AND e.created_at >= d.day AND e.created_at < d.day + interval '1 day')::int AS "listingViews",
          (SELECT count(*) FROM inquiries i WHERE i.created_at >= d.day AND i.created_at < d.day + interval '1 day')::int AS enquiries,
          (SELECT count(*) FROM inquiries i WHERE i.subject ILIKE 'Viewing request%' AND i.created_at >= d.day AND i.created_at < d.day + interval '1 day')::int AS "viewingRequests",
          (SELECT count(*) FROM inquiries i WHERE i.landlord_responded_at >= d.day AND i.landlord_responded_at < d.day + interval '1 day')::int AS "landlordResponses",
          (SELECT count(*) FROM inquiries i WHERE i.category = 'safety' AND i.created_at >= d.day AND i.created_at < d.day + interval '1 day')::int AS "safetyReports"
        FROM days d ORDER BY d.day
      `);
      return {
        catchments: catchments.rows,
        usersByRole: usersByRole.rows,
        pilotFunnel: pilotFunnel.rows,
        asOf: new Date().toISOString(),
      };
    });
  }

  settings() {
    return this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      const semesters = await client.query(`
        SELECT id, name, university::text, semester_type AS "semesterType",
               academic_year AS "academicYear", custom_name AS "customName",
               starts_on::text AS "startsOn", ends_on::text AS "endsOn",
               re_verification_window_starts_on::text AS "reVerificationWindowStartsOn"
        FROM semesters
        WHERE archived_at IS NULL
        ORDER BY academic_year DESC NULLS LAST, university NULLS LAST, starts_on DESC
      `);
      const settings = await client.query<{ key: string; value: unknown; description: string; updatedAt: Date }>(`
        SELECT key, value, description, updated_at AS "updatedAt"
        FROM platform_settings ORDER BY key
      `);
      const values = Object.fromEntries(settings.rows.map((row) => [row.key, row.value]));
      return {
        semesters: semesters.rows,
        universities: ['MUK', 'MUBS', 'KIU', 'KYU', 'other'],
        reservationPolicy: {
          holdHours: number(values.reservation_hold_hours ?? 72),
          feeUgx: number(values.reservation_fee_ugx ?? 5000),
        },
        settings: {
          verificationValidMonths: number(values.verification_valid_months ?? 12),
          registrationsOpen: Boolean(values.registrations_open ?? true),
          maintenanceMode: Boolean(values.maintenance_mode ?? false),
          reportRetentionDays: number(values.report_retention_days ?? 365),
          supportContact: values.support_contact ?? { email: 'support@campushomes.com', phone: '' },
        },
        settingRecords: settings.rows,
        asOf: new Date().toISOString(),
      };
    });
  }

  integrations() {
    const env = loadEnv();
    return this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      const catalog = await client.query(`
        SELECT id, key, name, purpose, category, audience, base_url AS "baseUrl",
               enabled, is_system AS "isSystem", config, updated_at AS "updatedAt"
        FROM platform_integrations ORDER BY is_system DESC, name
      `);
      const environmentRows = [
        { key: 'database', name: 'PostgreSQL / PostGIS', configured: Boolean(env.DATABASE_URL), purpose: 'Operational system of record' },
        { key: 'redis', name: 'Redis / BullMQ', configured: Boolean(runtimeRedisUrl(env)), purpose: 'Locks, queues, and delayed jobs' },
        { key: 'flutterwave', name: 'Flutterwave', configured: Boolean(env.FLUTTERWAVE_SECRET_KEY && env.FLUTTERWAVE_WEBHOOK_HASH), purpose: 'Reservation payments and refunds' },
        { key: 'africas-talking', name: "Africa's Talking", configured: Boolean(env.AFRICASTALKING_API_KEY), purpose: 'SMS and phone verification' },
        { key: 'cloudinary', name: 'Cloudinary', configured: Boolean(env.CLOUDINARY_URL), purpose: 'Property and verification media' },
        { key: 'soketi', name: 'Soketi / Pusher', configured: Boolean(env.SOKETI_HOST && env.SOKETI_KEY && env.SOKETI_SECRET), purpose: 'Realtime chat delivery' },
        { key: 'sentry', name: 'Sentry', configured: Boolean(env.SENTRY_DSN), purpose: 'Error monitoring' },
      ].map((row) => ({ ...row, id: null, category: 'operations', audience: 'internal', enabled: row.configured, isSystem: true, baseUrl: null, config: {} }));
      const rows = catalog.rows.map((row) => ({
        ...row,
        configured: row.key === 'power-bi'
          ? Boolean(env.POWER_BI_PUSH_URL && env.POWER_BI_API_TOKEN)
          : Boolean(row.baseUrl || (row.config && Object.keys(row.config as object).length)),
      }));
      return { asOf: new Date().toISOString(), rows: [...environmentRows, ...rows] };
    });
  }

  roles() {
    return this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      const roles = await client.query(`
        SELECT r.id, r.key, r.name, r.description, r.is_system AS "isSystem",
               count(DISTINCT rp.permission_id)::int AS "permissionCount",
               count(DISTINCT ura.user_id) FILTER (WHERE ura.revoked_at IS NULL AND (ura.valid_until IS NULL OR ura.valid_until > now()))::int AS "userCount"
        FROM roles r
        LEFT JOIN role_permissions rp ON rp.role_id = r.id
        LEFT JOIN user_role_assignments ura ON ura.role_id = r.id
        GROUP BY r.id ORDER BY CASE r.key WHEN 'super_admin' THEN 0 WHEN 'platform_admin' THEN 1 ELSE 2 END, r.name
      `);
      const permissions = await client.query(`SELECT id, key, description, requires_step_up AS "requiresStepUp" FROM permissions ORDER BY key`);
      const grants = await client.query(`
        SELECT r.key AS "roleKey", p.key AS "permissionKey"
        FROM role_permissions rp JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id
        ORDER BY r.key, p.key
      `);
      return { roles: roles.rows, permissions: permissions.rows, grants: grants.rows, asOf: new Date().toISOString() };
    });
  }

  role(key: string) {
    return this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      const role = await client.query(`SELECT id, key, name, description, is_system AS "isSystem" FROM roles WHERE key = $1`, [key]);
      if (!role.rows[0]) throw new NotFoundException('Role not found');
      const assignedUsers = await client.query(`
        SELECT ura.id AS "assignmentId", u.id, u.name, u.email, u.status::text,
               ura.scope_type AS "scopeType", ura.scope_id AS "scopeId", ura.valid_until AS "validUntil"
        FROM user_role_assignments ura JOIN users u ON u.id = ura.user_id
        WHERE ura.role_id = $1 AND ura.revoked_at IS NULL AND (ura.valid_until IS NULL OR ura.valid_until > now())
        ORDER BY u.name
      `, [role.rows[0].id]);
      const permissionKeys = await client.query<{ key: string }>(`
        SELECT p.key FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
        WHERE rp.role_id = $1 ORDER BY p.key
      `, [role.rows[0].id]);
      return { ...role.rows[0], permissionKeys: permissionKeys.rows.map((row) => row.key), assignedUsers: assignedUsers.rows };
    });
  }

  async updateRolePermissions(actor: RlsContext, key: string, input: UpdateRolePermissionsInput) {
    if (key === 'super_admin') {
      throw new ForbiddenException('The Super Admin permission set is locked');
    }
    const uniqueKeys = [...new Set(input.permissionKeys)];
    const result = await this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      const role = await client.query<{ id: string }>('SELECT id FROM roles WHERE key = $1', [key]);
      if (!role.rows[0]) throw new NotFoundException('Role not found');
      const known = await client.query<{ id: string; key: string }>('SELECT id, key FROM permissions WHERE key = ANY($1::text[])', [uniqueKeys]);
      if (known.rowCount !== uniqueKeys.length) {
        throw new BadRequestException('One or more permission keys are unknown');
      }
      await client.query('DELETE FROM role_permissions WHERE role_id = $1', [role.rows[0].id]);
      if (known.rows.length > 0) {
        await client.query(
          'INSERT INTO role_permissions (role_id, permission_id) SELECT $1, unnest($2::uuid[])',
          [role.rows[0].id, known.rows.map((permission) => permission.id)],
        );
      }
      return { roleId: role.rows[0].id, permissionKeys: uniqueKeys.sort() };
    });
    await this.audit.record(actor, 'roles.permissions_update', 'role', result.roleId, {
      roleKey: key,
      permissionKeys: result.permissionKeys,
    });
    return result;
  }

  auditLog() {
    return this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      const rows = await client.query(`
        SELECT a.id, a.actor_id AS "actorId", coalesce(nullif(u.name, ''), u.email, 'System') AS "actorName",
               a.actor_role AS "actorRole", a.action, a.target_type AS "targetType", a.target_id AS "targetId",
               a.payload, a.ip_address AS "ipAddress", a.ts
        FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id ORDER BY a.ts DESC LIMIT 250
      `);
      const total = (await client.query<CountRow>('SELECT count(*)::text AS value FROM audit_log')).rows[0];
      return { rows: rows.rows, total: number(total?.value), asOf: new Date().toISOString(), limit: 250 };
    });
  }
}
