import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AdminPermissionGrantInput,
  AdminRoleAssignmentInput,
  CreateAdminUserInput,
  UpdateAdminUserInput,
} from '@campushomes/shared';

import { RlsDb } from '../../db/db.module';
import type { RlsContext } from '../../db/rls-context';
import { LogtoManagementClient } from '../auth/logto-management.client';
import { hasCoveringScope, type RoleAssignment } from '../auth/permissions';
import { AuditService } from '../ops/audit.service';
import { RoleAssignmentService } from './role-assignment.service';

const SERVICE_CTX: RlsContext = {
  userId: '00000000-0000-0000-0000-000000000000',
  role: 'service_role',
};

type PgError = { code?: string; constraint?: string };

function conflict(error: unknown): never {
  const pg = error as PgError;
  if (pg.code === '23505') {
    throw new ConflictException(
      pg.constraint?.includes('email') ? 'That email address is already in use' :
      pg.constraint?.includes('phone') ? 'That phone number is already in use' :
      'An active assignment with the same scope already exists',
    );
  }
  throw error;
}

function nullable(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  return value === '' ? null : value;
}

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly rlsDb: RlsDb,
    private readonly audit: AuditService,
    _logtoManagement: LogtoManagementClient,
    private readonly roleAssignments: RoleAssignmentService = new RoleAssignmentService(rlsDb),
  ) {}

  async create(actor: RlsContext, input: CreateAdminUserInput) {
    if (input.temporaryPassword) {
      throw new BadRequestException('Credentials are created and verified only through hosted Logto sign-in');
    }
    if (['admin', 'ops_lead', 'ops_inspector'].includes(input.accountType)) {
      throw new BadRequestException('Staff accounts must be created through the audited invitation workflow');
    }
    const result = await this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      try {
        const user = (await client.query<{
          id: string; name: string; email: string | null; phone: string | null; role: string; status: string;
        }>(`
          INSERT INTO users (
            name, email, phone, role, status, email_verified, phone_verified,
            date_of_birth, gender, nationality, address,
            emergency_contact_name, emergency_contact_phone, notes
          ) VALUES (
            $1, $2, $3, $4::user_role, $5::user_status, $6, $7,
            $8, $9, $10, $11, $12, $13, $14
          ) RETURNING id, name, email, phone, role::text, status::text
        `, [
          input.name,
          nullable(input.email),
          nullable(input.phone),
          input.accountType,
          input.status,
          false,
          false,
          input.dateOfBirth ?? null,
          nullable(input.gender),
          nullable(input.nationality),
          nullable(input.address),
          nullable(input.emergencyContactName),
          nullable(input.emergencyContactPhone),
          nullable(input.notes),
        ])).rows[0]!;

        if (input.accountType === 'student') {
          await client.query(
            `INSERT INTO students (user_id, university, year_of_study) VALUES ($1, $2::university, $3)`,
            [user.id, input.university, input.yearOfStudy ?? null],
          );
        }
        if (input.accountType === 'landlord') {
          await client.query(
            `INSERT INTO landlords
               (user_id, legal_name, whatsapp_number, business_type, business_type_other)
             VALUES ($1, $2, $3, COALESCE($4, 'individual_landlord'), $5)`,
            [
              user.id,
              input.legalName,
              nullable(input.whatsappNumber),
              nullable(input.businessType),
              nullable(input.businessTypeOther),
            ],
          );
        }
        if (input.accountType === 'ops_inspector' || input.accountType === 'ops_lead') {
          // Without this row the user has the right `users.role` but is
          // invisible to every ops_staff-joined query — OpsService.listInspectors
          // (the schedule-visit dropdown), queue(), and myVisits() all silently
          // show nothing for them until someone notices and backfills this by hand.
          await client.query(
            `INSERT INTO ops_staff (user_id, team) VALUES ($1, $2::ops_team)`,
            [user.id, input.accountType === 'ops_lead' ? 'lead' : 'inspector'],
          );
        }

        // Student and landlord baseline roles are self-scoped. Ops staff are
        // platform-wide operational roles (matching the "assign role" UI's own
        // default for these two role keys), not owners of a self-scoped
        // resource. Custodians and property workers receive no implicit role
        // here: their access must be assigned against a specific property by
        // assignRole().
        const baselineScope: Record<string, string> = {
          student: 'own',
          landlord: 'own',
          ops_inspector: 'platform_wide',
          ops_lead: 'platform_wide',
        };
        if (input.accountType in baselineScope) {
          await client.query(`
            INSERT INTO user_role_assignments (user_id, role_id, scope_type, assigned_by, reason)
            SELECT $1, id, $2, $3, 'Initial account role assigned by Super Admin'
            FROM roles WHERE key = $4
          `, [
            user.id,
            baselineScope[input.accountType],
            actor.userId,
            input.accountType,
          ]);
        }

        return user;
      } catch (error) {
        return conflict(error);
      }
    });
    await this.audit.record(actor, 'users.create', 'user', result.id, {
      accountType: input.accountType,
      status: input.status,
    });
    return result;
  }

  detail(userId: string) {
    return this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      const user = (await client.query(`
        SELECT u.id, u.name, u.email, u.phone, u.role::text AS "accountType",
               u.status::text, u.image, u.email_verified AS "emailVerified",
               u.phone_verified AS "phoneVerified", u.date_of_birth::text AS "dateOfBirth",
               u.gender, u.nationality, u.address,
               u.emergency_contact_name AS "emergencyContactName",
               u.emergency_contact_phone AS "emergencyContactPhone", u.notes,
               u.created_at AS "createdAt", u.updated_at AS "updatedAt",
               s.university::text, s.year_of_study AS "yearOfStudy",
               l.legal_name AS "legalName", l.kyc_status::text AS "kycStatus",
               l.whatsapp_number AS "whatsappNumber", l.business_type AS "businessType",
               l.business_type_other AS "businessTypeOther",
               -- Which providers a user signed in with lived in Better Auth's
               -- accounts table; Logto owns that now and it isn't locally
               -- queryable per-user without a Management API round trip, so
               -- this is deliberately empty until that's built.
               '{}'::text[] AS "authProviders"
        FROM users u
        LEFT JOIN students s ON s.user_id = u.id
        LEFT JOIN landlords l ON l.user_id = u.id
        WHERE u.id = $1 AND u.deleted_at IS NULL
      `, [userId])).rows[0];
      if (!user) throw new NotFoundException('User not found');

      const assignments = await client.query(`
          SELECT ura.id, r.key AS "roleKey", r.name AS "roleName",
                 ura.scope_type AS "scopeType", ura.scope_id AS "scopeId",
                 ura.valid_from AS "validFrom", ura.valid_until AS "validUntil",
                 ura.reason
          FROM user_role_assignments ura JOIN roles r ON r.id = ura.role_id
          WHERE ura.user_id = $1 AND ura.revoked_at IS NULL
          ORDER BY r.name, ura.scope_type
        `, [userId]);
      const directPermissions = await client.query(`
          SELECT upg.id, p.key AS "permissionKey", p.description,
                 upg.scope_type AS "scopeType", upg.scope_id AS "scopeId",
                 upg.valid_until AS "validUntil", upg.reason
          FROM user_permission_grants upg JOIN permissions p ON p.id = upg.permission_id
          WHERE upg.user_id = $1 AND upg.revoked_at IS NULL
          ORDER BY p.key
        `, [userId]);
      const memberships = await client.query(`
          SELECT pm.id, pm.property_id AS "propertyId", p.name AS "propertyName",
                 pm.role, pm.worker_type AS "workerType", pm.status,
                 pm.starts_at AS "startsAt", pm.ends_at AS "endsAt"
          FROM property_memberships pm JOIN properties p ON p.id = pm.property_id
          WHERE pm.user_id = $1 AND pm.revoked_at IS NULL
          ORDER BY p.name, pm.role
        `, [userId]);
      return { user, assignments: assignments.rows, directPermissions: directPermissions.rows, memberships: memberships.rows };
    });
  }

  async revokeSessions(actor: RlsContext, userId: string) {
    const revoked = await this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      const result = await client.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
      return result.rowCount ?? 0;
    });
    await this.audit.record(actor, 'users.sessions_revoke', 'user', userId, { revoked });
    return { revoked };
  }

  async update(actor: RlsContext, userId: string, input: UpdateAdminUserInput) {
    if (input.accountType !== undefined) {
      throw new BadRequestException('Use role assignments to change access; account type is compatibility data');
    }
    const result = await this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      try {
        const current = (await client.query<{ id: string; accountType: string; status: string }>(
          `SELECT id, role::text AS "accountType", status::text AS status FROM users WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
          [userId],
        )).rows[0];
        if (!current) throw new NotFoundException('User not found');
        // Editing your own identity/particulars is fine; only a real change to
        // your own status is blocked (self-lockout guard). The edit form
        // re-submits the unchanged status field, so compare rather than reject
        // its mere presence.
        if (actor.userId === userId && input.status !== undefined && input.status !== current.status) {
          throw new ForbiddenException('You cannot change your own status');
        }

        const columnMap: Record<string, string> = {
          name: 'name', email: 'email', phone: 'phone', accountType: 'role', status: 'status', image: 'image',
          dateOfBirth: 'date_of_birth', gender: 'gender', nationality: 'nationality', address: 'address',
          emergencyContactName: 'emergency_contact_name', emergencyContactPhone: 'emergency_contact_phone', notes: 'notes',
        };
        const values: unknown[] = [];
        const sets: string[] = [];
        for (const [key, column] of Object.entries(columnMap)) {
          const value = input[key as keyof UpdateAdminUserInput];
          if (value === undefined) continue;
          values.push(typeof value === 'string' ? nullable(value) : value);
          const cast = key === 'accountType' ? '::user_role' : key === 'status' ? '::user_status' : '';
          sets.push(`${column} = $${values.length + 1}${cast}`);
        }
        let user;
        if (sets.length) {
          user = (await client.query(
            `UPDATE users SET ${sets.join(', ')}, updated_at = now() WHERE id = $1
             RETURNING id, name, email, phone, role::text AS "accountType", status::text`,
            [userId, ...values],
          )).rows[0];
        } else {
          user = (await client.query(
            `SELECT id, name, email, phone, role::text AS "accountType", status::text FROM users WHERE id = $1`,
            [userId],
          )).rows[0];
        }

        const nextType = input.accountType ?? current.accountType;
        if (input.accountType !== undefined) {
          if (nextType === 'ops_inspector' || nextType === 'ops_lead') {
            await client.query(
              `INSERT INTO ops_staff (user_id, team, active) VALUES ($1, $2::ops_team, true)
               ON CONFLICT (user_id) DO UPDATE SET team = EXCLUDED.team, active = true`,
              [userId, nextType === 'ops_lead' ? 'lead' : 'inspector'],
            );
          } else {
            // Keep historical staff rows for existing visits and audit records,
            // but never leave a former Ops account assignable as an inspector.
            await client.query('UPDATE ops_staff SET active = false WHERE user_id = $1', [userId]);
          }
        }
        if (nextType === 'student') {
          if (current.accountType !== 'student' && (!input.university || !input.yearOfStudy)) {
            throw new BadRequestException('University and year of study are required when changing to a student account');
          }
          await client.query(`
            INSERT INTO students (user_id, university, year_of_study)
            VALUES (
              $1,
              coalesce($2::university, (SELECT university FROM students WHERE user_id = $1)),
              $3
            )
            ON CONFLICT (user_id) DO UPDATE SET
              university = coalesce(EXCLUDED.university, students.university),
              year_of_study = coalesce(EXCLUDED.year_of_study, students.year_of_study)
          `, [userId, input.university ?? null, input.yearOfStudy ?? null]);
        } else if (input.university !== undefined || input.yearOfStudy !== undefined) {
          await client.query(`
            UPDATE students SET university = coalesce($2::university, university),
              year_of_study = $3 WHERE user_id = $1
          `, [userId, input.university ?? null, input.yearOfStudy ?? null]);
        }
        const landlordFieldsGiven =
          input.whatsappNumber !== undefined ||
          input.businessType !== undefined ||
          input.businessTypeOther !== undefined;
        if (nextType === 'landlord') {
          const legalName = input.legalName ?? (user?.name as string | undefined);
          if (!legalName) throw new BadRequestException('Legal name is required for landlord accounts');
          await client.query(`
            INSERT INTO landlords
              (user_id, legal_name, whatsapp_number, business_type, business_type_other)
            VALUES ($1, $2, $3, COALESCE($4, 'individual_landlord'), $5)
            ON CONFLICT (user_id) DO UPDATE SET
              legal_name = EXCLUDED.legal_name,
              whatsapp_number = coalesce(EXCLUDED.whatsapp_number, landlords.whatsapp_number),
              business_type = coalesce($4, landlords.business_type),
              business_type_other = coalesce(EXCLUDED.business_type_other, landlords.business_type_other)
          `, [
            userId,
            legalName,
            nullable(input.whatsappNumber),
            nullable(input.businessType),
            nullable(input.businessTypeOther),
          ]);
        } else if (input.legalName !== undefined || landlordFieldsGiven) {
          await client.query(`
            UPDATE landlords SET
              legal_name = coalesce($2, legal_name),
              whatsapp_number = coalesce($3, whatsapp_number),
              business_type = coalesce($4, business_type),
              business_type_other = coalesce($5, business_type_other)
            WHERE user_id = $1
          `, [
            userId,
            nullable(input.legalName),
            nullable(input.whatsappNumber),
            nullable(input.businessType),
            nullable(input.businessTypeOther),
          ]);
        }

        if (input.status && input.status !== 'active') {
          await client.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
        }
        return user;
      } catch (error) {
        return conflict(error);
      }
    });
    await this.audit.record(actor, 'users.update', 'user', userId, {
      fields: Object.keys(input),
    });
    return result;
  }

  async softDelete(actor: RlsContext, actorPermissions: Set<string>, userId: string, reason: string) {
    if (actor.userId === userId) throw new ForbiddenException('You cannot delete your own account');
    const result = await this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      try {
        const target = (await client.query<{ id: string; isSuperAdmin: boolean }>(`
          SELECT u.id, EXISTS (
            SELECT 1 FROM user_role_assignments ura JOIN roles r ON r.id = ura.role_id
            WHERE ura.user_id = u.id AND r.key = 'super_admin' AND ura.revoked_at IS NULL
          ) AS "isSuperAdmin"
          FROM users u WHERE u.id = $1 AND u.deleted_at IS NULL FOR UPDATE
        `, [userId])).rows[0];
        if (!target) throw new NotFoundException('User not found');
        if (target.isSuperAdmin) {
          if (!actorPermissions.has('roles.manage_super_admin')) {
            throw new ForbiddenException('Only a Super Admin can delete a Super Admin');
          }
          const count = Number((await client.query(`
            SELECT count(DISTINCT ura.user_id) AS count
            FROM user_role_assignments ura JOIN roles r ON r.id = ura.role_id JOIN users u ON u.id = ura.user_id
            WHERE r.key = 'super_admin' AND ura.revoked_at IS NULL AND u.deleted_at IS NULL AND u.status = 'active'
          `)).rows[0]?.count ?? 0);
          if (count <= 1) throw new ForbiddenException('The last active Super Admin cannot be deleted');
        }

        // email/phone keep their plain UNIQUE constraints (not partial on
        // deleted_at), and Better Auth's own sign-up lookup has no idea about
        // our deleted_at convention anyway — leaving them intact permanently
        // blocks the same person from ever signing up again. Mangle both to a
        // deterministic, guaranteed-unique value derived from the row's own
        // id so they're freed for reuse immediately; the row (and its id)
        // stays intact for audit_log/FK history.
        await client.query(
          `UPDATE users SET status = 'suspended', deleted_at = now(), deletion_reason = $2, updated_at = now(),
                  email = 'deleted-' || id || '@deleted.campushomes.internal', phone = NULL
           WHERE id = $1`,
          [userId, reason],
        );
        await client.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
        await client.query('UPDATE user_role_assignments SET revoked_at = now(), revoked_by = $2 WHERE user_id = $1 AND revoked_at IS NULL', [userId, actor.userId]);
        await client.query('UPDATE user_permission_grants SET revoked_at = now(), revoked_by = $2 WHERE user_id = $1 AND revoked_at IS NULL', [userId, actor.userId]);
        await client.query(`UPDATE property_memberships SET status = 'revoked', revoked_at = now(), revoked_by = $2, revocation_reason = $3 WHERE user_id = $1 AND revoked_at IS NULL`, [userId, actor.userId, reason]);
        // Mirrors enforce_strike_suspension() (0001_rls_hardening.sql): a
        // deleted landlord's previously-verified listings must stop being
        // publicly searchable immediately, not just vanish from admin lists.
        await client.query(
          `UPDATE listings SET status = 'suspended'
           WHERE status = 'verified' AND property_id IN (SELECT id FROM properties WHERE landlord_id = $1)`,
          [userId],
        );
        return { id: userId, deleted: true };
      } catch (error) {
        throw error;
      }
    });
    await this.audit.record(actor, 'users.delete', 'user', userId, { reason });
    return result;
  }

  /** Hard-deletes a soft-deleted user and everything they own (properties and
   * their whole subtree, reservations, the student/landlord profile, RBAC
   * rows, chat). Historical records that merely reference the person as an
   * actor (audit_log, who-reviewed/uploaded/assigned) are anonymized to NULL
   * so the event survives without the identity. Requires the account to be
   * soft-deleted first (two-step safety); super-admin targets need the
   * super-admin tier permission, same as softDelete. */
  async purgeUser(actor: RlsContext, actorPermissions: Set<string>, userId: string) {
    if (actor.userId === userId) throw new ForbiddenException('You cannot purge your own account');
    await this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      const target = (await client.query<{ id: string; deletedAt: Date | null; isSuperAdmin: boolean }>(`
        SELECT u.id, u.deleted_at AS "deletedAt", EXISTS (
          SELECT 1 FROM user_role_assignments ura JOIN roles r ON r.id = ura.role_id
          WHERE ura.user_id = u.id AND r.key = 'super_admin' AND ura.revoked_at IS NULL
        ) AS "isSuperAdmin"
        FROM users u WHERE u.id = $1 FOR UPDATE
      `, [userId])).rows[0];
      if (!target) throw new NotFoundException('User not found');
      if (!target.deletedAt) throw new BadRequestException('Soft-delete the account first, then purge it');
      if (target.isSuperAdmin && !actorPermissions.has('roles.manage_super_admin')) {
        throw new ForbiddenException('Only a Super Admin can purge a Super Admin');
      }
      // Seed the target set, then derive and remove its whole footprint. The
      // derived block references only _pg_g (no external input), so it runs as
      // one statement. Order is strict child-before-parent: the schema's
      // RESTRICT/NO-ACTION FKs would otherwise block the delete.
      await client.query(`CREATE TEMP TABLE _pg_g(id uuid PRIMARY KEY) ON COMMIT DROP`);
      await client.query(`INSERT INTO _pg_g VALUES ($1)`, [userId]);
      await client.query(`
        CREATE TEMP TABLE _pg_props ON COMMIT DROP AS SELECT id FROM properties WHERE landlord_id IN (SELECT id FROM _pg_g);
        CREATE TEMP TABLE _pg_lists ON COMMIT DROP AS SELECT id FROM listings WHERE property_id IN (SELECT id FROM _pg_props);
        CREATE TEMP TABLE _pg_vers ON COMMIT DROP AS SELECT id FROM listing_versions WHERE listing_id IN (SELECT id FROM _pg_lists);
        CREATE TEMP TABLE _pg_unts ON COMMIT DROP AS SELECT id FROM units WHERE property_id IN (SELECT id FROM _pg_props);
        CREATE TEMP TABLE _pg_bds ON COMMIT DROP AS SELECT id FROM beds WHERE unit_id IN (SELECT id FROM _pg_unts);
        CREATE TEMP TABLE _pg_res ON COMMIT DROP AS SELECT id FROM reservations WHERE student_id IN (SELECT id FROM _pg_g) OR bed_id IN (SELECT id FROM _pg_bds);
        CREATE TEMP TABLE _pg_thr ON COMMIT DROP AS SELECT id FROM chat_threads WHERE reservation_id IN (SELECT id FROM _pg_res);

        DELETE FROM chat_messages WHERE thread_id IN (SELECT id FROM _pg_thr) OR from_user_id IN (SELECT id FROM _pg_g);
        DELETE FROM chat_threads WHERE id IN (SELECT id FROM _pg_thr);
        DELETE FROM reviews WHERE reservation_id IN (SELECT id FROM _pg_res) OR listing_version_id IN (SELECT id FROM _pg_vers);
        DELETE FROM refunds WHERE reservation_id IN (SELECT id FROM _pg_res);
        DELETE FROM landlord_strikes WHERE reservation_id IN (SELECT id FROM _pg_res);
        DELETE FROM student_flags WHERE reservation_id IN (SELECT id FROM _pg_res);
        DELETE FROM reservation_releases WHERE reservation_id IN (SELECT id FROM _pg_res);
        DELETE FROM payments WHERE reservation_id IN (SELECT id FROM _pg_res);
        DELETE FROM move_ins WHERE reservation_id IN (SELECT id FROM _pg_res);
        DELETE FROM journal_entries WHERE reservation_id IN (SELECT id FROM _pg_res);
        DELETE FROM reservations WHERE id IN (SELECT id FROM _pg_res);

        DELETE FROM unit_photos WHERE unit_id IN (SELECT id FROM _pg_unts);
        DELETE FROM unit_semester_pricing WHERE unit_id IN (SELECT id FROM _pg_unts);
        DELETE FROM beds WHERE id IN (SELECT id FROM _pg_bds);
        DELETE FROM units WHERE id IN (SELECT id FROM _pg_unts);
        DELETE FROM listing_photos WHERE listing_version_id IN (SELECT id FROM _pg_vers);
        DELETE FROM saved_listings WHERE listing_id IN (SELECT id FROM _pg_lists);
        UPDATE inquiries SET listing_id = NULL WHERE listing_id IN (SELECT id FROM _pg_lists);
        UPDATE listings SET current_version_id = NULL WHERE id IN (SELECT id FROM _pg_lists);
        DELETE FROM listing_versions WHERE id IN (SELECT id FROM _pg_vers);
        DELETE FROM listings WHERE id IN (SELECT id FROM _pg_lists);
        DELETE FROM tenant_agreements WHERE property_id IN (SELECT id FROM _pg_props);
        DELETE FROM verification_visits WHERE property_id IN (SELECT id FROM _pg_props);
        DELETE FROM properties WHERE id IN (SELECT id FROM _pg_props);

        DELETE FROM inquiries WHERE student_id IN (SELECT id FROM _pg_g);
        UPDATE inquiries SET landlord_id = NULL WHERE landlord_id IN (SELECT id FROM _pg_g);
        DELETE FROM property_memberships WHERE user_id IN (SELECT id FROM _pg_g);

        UPDATE audit_log SET actor_id = NULL WHERE actor_id IN (SELECT id FROM _pg_g);
        UPDATE landlords SET kyc_reviewed_by = NULL WHERE kyc_reviewed_by IN (SELECT id FROM _pg_g);
        UPDATE reservations SET booked_by = NULL WHERE booked_by IN (SELECT id FROM _pg_g);
        UPDATE refunds SET processed_by = NULL WHERE processed_by IN (SELECT id FROM _pg_g);
        UPDATE approval_requests SET requested_by = NULL WHERE requested_by IN (SELECT id FROM _pg_g);
        UPDATE approval_requests SET decided_by = NULL WHERE decided_by IN (SELECT id FROM _pg_g);
        UPDATE auth_invitations SET invited_by = NULL WHERE invited_by IN (SELECT id FROM _pg_g);
        UPDATE auth_invitations SET cancelled_by = NULL WHERE cancelled_by IN (SELECT id FROM _pg_g);
        UPDATE auth_invitations SET accepted_by = NULL WHERE accepted_by IN (SELECT id FROM _pg_g);
        UPDATE auth_invitations SET target_user_id = NULL WHERE target_user_id IN (SELECT id FROM _pg_g);
        UPDATE campus_photos SET uploaded_by = NULL WHERE uploaded_by IN (SELECT id FROM _pg_g);
        UPDATE onboarding_leads SET contacted_by = NULL WHERE contacted_by IN (SELECT id FROM _pg_g);
        UPDATE platform_integrations SET created_by = NULL WHERE created_by IN (SELECT id FROM _pg_g);
        UPDATE platform_integrations SET updated_by = NULL WHERE updated_by IN (SELECT id FROM _pg_g);
        UPDATE platform_settings SET updated_by = NULL WHERE updated_by IN (SELECT id FROM _pg_g);
        UPDATE property_documents SET uploaded_by = NULL WHERE uploaded_by IN (SELECT id FROM _pg_g);
        UPDATE property_media SET uploaded_by = NULL WHERE uploaded_by IN (SELECT id FROM _pg_g);
        UPDATE property_memberships SET assigned_by = NULL WHERE assigned_by IN (SELECT id FROM _pg_g);
        UPDATE property_memberships SET revoked_by = NULL WHERE revoked_by IN (SELECT id FROM _pg_g);
        UPDATE report_exports SET created_by = NULL WHERE created_by IN (SELECT id FROM _pg_g);
        UPDATE reservation_releases SET released_by = NULL WHERE released_by IN (SELECT id FROM _pg_g);
        UPDATE tenant_agreement_templates SET created_by = NULL WHERE created_by IN (SELECT id FROM _pg_g);
        UPDATE unit_photos SET uploaded_by = NULL WHERE uploaded_by IN (SELECT id FROM _pg_g);
        UPDATE user_permission_grants SET granted_by = NULL WHERE granted_by IN (SELECT id FROM _pg_g);
        UPDATE user_permission_grants SET revoked_by = NULL WHERE revoked_by IN (SELECT id FROM _pg_g);
        UPDATE user_role_assignments SET assigned_by = NULL WHERE assigned_by IN (SELECT id FROM _pg_g);
        UPDATE user_role_assignments SET revoked_by = NULL WHERE revoked_by IN (SELECT id FROM _pg_g);

        DELETE FROM users WHERE id IN (SELECT id FROM _pg_g);
      `);
    });
    await this.audit.record(actor, 'users.purge', 'user', userId, {});
    return { id: userId, purged: true };
  }

  async assignRole(
    actor: RlsContext,
    actorPermissions: Set<string>,
    actorAssignments: RoleAssignment[],
    userId: string,
    input: AdminRoleAssignmentInput,
  ) {
    return this.roleAssignments.grant(actor, actorPermissions, actorAssignments, userId, input);
  }

  async revokeRole(
    actor: RlsContext,
    actorPermissions: Set<string>,
    actorAssignments: RoleAssignment[],
    userId: string,
    assignmentId: string,
  ) {
    return this.roleAssignments.revoke(
      actor,
      actorPermissions,
      actorAssignments,
      assignmentId,
      userId,
    );
  }

  async grantPermissions(
    actor: RlsContext,
    actorPermissions: Set<string>,
    actorAssignments: RoleAssignment[],
    userId: string,
    input: AdminPermissionGrantInput,
  ) {
    if (actor.userId === userId) {
      throw new ForbiddenException('Cannot grant yourself a permission');
    }
    if (input.permissionKeys.includes('roles.manage_super_admin') && !actorPermissions.has('roles.manage_super_admin')) {
      throw new ForbiddenException('Only a Super Admin can grant Super Admin management');
    }
    if (!hasCoveringScope(actorAssignments, input.scopeType, input.scopeId ?? null)) {
      throw new ForbiddenException('Cannot grant a permission outside your own scope');
    }
    const result = await this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      try {
        const user = (await client.query('SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL', [userId])).rows[0];
        if (!user) throw new NotFoundException('User not found');
        if (input.scopeType === 'property') {
          const property = (await client.query('SELECT id FROM properties WHERE id = $1', [input.scopeId])).rows[0];
          if (!property) throw new NotFoundException('Property scope not found');
        }
        const known = await client.query<{ id: string; key: string }>(
          'SELECT id, key FROM permissions WHERE key = ANY($1::text[])',
          [[...new Set(input.permissionKeys)]],
        );
        if (known.rowCount !== new Set(input.permissionKeys).size) {
          throw new BadRequestException('One or more permission keys are unknown');
        }
        const grants = [];
        for (const permission of known.rows) {
          const grant = (await client.query(`
            INSERT INTO user_permission_grants (
              user_id, permission_id, scope_type, scope_id, valid_until, granted_by, reason
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id, user_id AS "userId", scope_type AS "scopeType", scope_id AS "scopeId"
          `, [userId, permission.id, input.scopeType, input.scopeId ?? null, input.validUntil ?? null, actor.userId, input.reason])).rows[0];
          grants.push({ ...grant, permissionKey: permission.key });
        }
        return grants;
      } catch (error) {
        return conflict(error);
      }
    });
    await this.audit.record(actor, 'users.permissions_grant', 'user', userId, {
      permissionKeys: input.permissionKeys,
      scopeType: input.scopeType,
      scopeId: input.scopeId ?? null,
    });
    return { grants: result };
  }

  async revokePermission(
    actor: RlsContext,
    actorPermissions: Set<string>,
    actorAssignments: RoleAssignment[],
    userId: string,
    grantId: string,
  ) {
    const result = await this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      try {
        const grant = (await client.query<{ permissionKey: string; scopeType: string; scopeId: string | null }>(`
          SELECT p.key AS "permissionKey", upg.scope_type AS "scopeType", upg.scope_id AS "scopeId"
          FROM user_permission_grants upg JOIN permissions p ON p.id = upg.permission_id
          WHERE upg.id = $1 AND upg.user_id = $2 AND upg.revoked_at IS NULL FOR UPDATE
        `, [grantId, userId])).rows[0];
        if (!grant) throw new NotFoundException('Active permission grant not found');
        if (grant.permissionKey === 'roles.manage_super_admin' && !actorPermissions.has('roles.manage_super_admin')) {
          throw new ForbiddenException('Only a Super Admin can revoke Super Admin management');
        }
        if (!hasCoveringScope(actorAssignments, grant.scopeType, grant.scopeId)) {
          throw new ForbiddenException('Cannot revoke a permission grant outside your own scope');
        }
        await client.query(
          'UPDATE user_permission_grants SET revoked_at = now(), revoked_by = $2 WHERE id = $1',
          [grantId, actor.userId],
        );
      } catch (error) {
        throw error;
      }
      return { id: grantId, revoked: true };
    });
    await this.audit.record(actor, 'users.permissions_revoke', 'user_permission_grant', grantId, { targetUserId: userId });
    return result;
  }
}
