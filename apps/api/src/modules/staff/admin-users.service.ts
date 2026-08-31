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
    private readonly logtoManagement: LogtoManagementClient,
  ) {}

  async create(actor: RlsContext, input: CreateAdminUserInput) {
    const result = await this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      await client.query('BEGIN');
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
          Boolean(input.email && input.temporaryPassword),
          Boolean(input.phone),
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

        await client.query('COMMIT');
        return user;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        return conflict(error);
      }
    });
    if (input.temporaryPassword && result.email) {
      await this.logtoManagement.createUser({
        primaryEmail: result.email,
        name: result.name,
        password: input.temporaryPassword,
      });
    }
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
    if (actor.userId === userId && (input.status || input.accountType)) {
      throw new ForbiddenException('You cannot change your own account type or status');
    }
    const result = await this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      await client.query('BEGIN');
      try {
        const current = (await client.query<{ id: string; accountType: string }>(
          `SELECT id, role::text AS "accountType" FROM users WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
          [userId],
        )).rows[0];
        if (!current) throw new NotFoundException('User not found');

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
        await client.query('COMMIT');
        return user;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
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
      await client.query('BEGIN');
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
        await client.query('COMMIT');
        return { id: userId, deleted: true };
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      }
    });
    await this.audit.record(actor, 'users.delete', 'user', userId, { reason });
    return result;
  }

  async assignRole(
    actor: RlsContext,
    actorPermissions: Set<string>,
    actorAssignments: RoleAssignment[],
    userId: string,
    input: AdminRoleAssignmentInput,
  ) {
    if (actor.userId === userId) {
      throw new ForbiddenException('Cannot assign yourself a role');
    }
    if (input.roleKey === 'super_admin' && !actorPermissions.has('roles.manage_super_admin')) {
      throw new ForbiddenException('Only a Super Admin can grant the Super Admin role');
    }
    if (!hasCoveringScope(actorAssignments, input.scopeType, input.scopeId ?? null)) {
      throw new ForbiddenException('Cannot assign a role outside your own scope');
    }
    const result = await this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      await client.query('BEGIN');
      try {
        const target = (await client.query('SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL', [userId])).rows[0];
        if (!target) throw new NotFoundException('User not found');
        const role = (await client.query<{ id: string }>('SELECT id FROM roles WHERE key = $1', [input.roleKey])).rows[0];
        if (!role) throw new NotFoundException('Role not found');
        if (input.scopeType === 'property') {
          const property = (await client.query('SELECT id FROM properties WHERE id = $1', [input.scopeId])).rows[0];
          if (!property) throw new NotFoundException('Property scope not found');
        }
        const assignment = (await client.query(`
          INSERT INTO user_role_assignments (
            user_id, role_id, scope_type, scope_id, valid_until, assigned_by, reason
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id, user_id AS "userId", scope_type AS "scopeType", scope_id AS "scopeId", valid_until AS "validUntil"
        `, [userId, role.id, input.scopeType, input.scopeId ?? null, input.validUntil ?? null, actor.userId, input.reason])).rows[0]!;

        if (
          input.scopeType === 'property' &&
          ['landlord', 'custodian', 'property_worker', 'student'].includes(input.roleKey)
        ) {
          const membershipRole = input.roleKey === 'student' ? 'resident_student' : input.roleKey;
          await client.query(`
            INSERT INTO property_memberships (
              user_id, property_id, role, worker_type, assigned_by, ends_at
            ) VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (user_id, property_id, role) WHERE revoked_at IS NULL
            DO UPDATE SET status = 'active', worker_type = EXCLUDED.worker_type,
              ends_at = EXCLUDED.ends_at, assigned_by = EXCLUDED.assigned_by
          `, [userId, input.scopeId, membershipRole, input.workerType ?? null, actor.userId, input.validUntil ?? null]);
        }
        await client.query('COMMIT');
        return { ...assignment, roleKey: input.roleKey };
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        return conflict(error);
      }
    });
    await this.audit.record(actor, 'roles.assign', 'user_role_assignment', result.id, {
      targetUserId: userId,
      roleKey: input.roleKey,
      scopeType: input.scopeType,
      scopeId: input.scopeId ?? null,
    });
    return result;
  }

  async revokeRole(
    actor: RlsContext,
    actorPermissions: Set<string>,
    actorAssignments: RoleAssignment[],
    userId: string,
    assignmentId: string,
  ) {
    const result = await this.rlsDb.run(SERVICE_CTX, async (_db, client) => {
      await client.query('BEGIN');
      try {
        const assignment = (await client.query<{ roleKey: string; scopeType: string; scopeId: string | null }>(`
          SELECT r.key AS "roleKey", ura.scope_type AS "scopeType", ura.scope_id AS "scopeId"
          FROM user_role_assignments ura JOIN roles r ON r.id = ura.role_id
          WHERE ura.id = $1 AND ura.user_id = $2 AND ura.revoked_at IS NULL FOR UPDATE
        `, [assignmentId, userId])).rows[0];
        if (!assignment) throw new NotFoundException('Active role assignment not found');
        if (assignment.roleKey === 'super_admin') {
          if (!actorPermissions.has('roles.manage_super_admin')) {
            throw new ForbiddenException('Only a Super Admin can revoke this role');
          }
          if (actor.userId === userId) throw new ForbiddenException('You cannot revoke your own Super Admin role');
        }
        if (!hasCoveringScope(actorAssignments, assignment.scopeType, assignment.scopeId)) {
          throw new ForbiddenException('Cannot revoke a role assignment outside your own scope');
        }
        await client.query('UPDATE user_role_assignments SET revoked_at = now(), revoked_by = $2 WHERE id = $1', [assignmentId, actor.userId]);
        if (assignment.scopeType === 'property' && assignment.scopeId) {
          const membershipRole = assignment.roleKey === 'student' ? 'resident_student' : assignment.roleKey;
          await client.query(`
            UPDATE property_memberships SET status = 'revoked', revoked_at = now(), revoked_by = $4,
              revocation_reason = 'Role assignment revoked'
            WHERE user_id = $1 AND property_id = $2 AND role = $3 AND revoked_at IS NULL
          `, [userId, assignment.scopeId, membershipRole, actor.userId]);
        }
        await client.query('COMMIT');
        return { id: assignmentId, revoked: true };
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      }
    });
    await this.audit.record(actor, 'roles.revoke', 'user_role_assignment', assignmentId, { targetUserId: userId });
    return result;
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
      await client.query('BEGIN');
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
        await client.query('COMMIT');
        return grants;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
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
      await client.query('BEGIN');
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
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      }
      return { id: grantId, revoked: true };
    });
    await this.audit.record(actor, 'users.permissions_revoke', 'user_permission_grant', grantId, { targetUserId: userId });
    return result;
  }
}
