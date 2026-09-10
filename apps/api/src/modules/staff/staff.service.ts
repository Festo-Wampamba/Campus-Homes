import { Injectable } from '@nestjs/common';

import type { GrantRoleInput, InviteStaffInput } from '@campushomes/shared';

import { RlsDb } from '../../db/db.module';
import type { RlsContext } from '../../db/rls-context';
import { LogtoManagementClient } from '../auth/logto-management.client';
import type { RoleAssignment } from '../auth/permissions';
import { AuditService } from '../ops/audit.service';
import {
  InvitationDeliveryService,
  InvitationsService,
} from './invitations.service';
import { RoleAssignmentService, STAFF_ROLE_KEYS } from './role-assignment.service';

const SERVICE_CTX: RlsContext = {
  userId: '00000000-0000-0000-0000-000000000000',
  role: 'service_role',
};

/** Compatibility facade for the existing staff routes. All access mutations
 * flow through the same assignment and invitation services. */
@Injectable()
export class StaffService {
  constructor(
    private readonly rlsDb: RlsDb,
    _audit: AuditService,
    _logtoManagement: LogtoManagementClient,
    private readonly roleAssignments: RoleAssignmentService = new RoleAssignmentService(rlsDb),
    private readonly invitations: InvitationsService =
      new InvitationsService(rlsDb, new InvitationDeliveryService(_logtoManagement)),
  ) {}

  invite(
    actor: RlsContext,
    permissions: Set<string>,
    scopes: RoleAssignment[],
    input: InviteStaffInput,
  ) {
    return this.invitations.invite(actor, permissions, scopes, input);
  }

  list() {
    return this.rlsDb.run(SERVICE_CTX, async (_db, client) => (
      await client.query(`
        SELECT DISTINCT u.id, u.name, u.email, u.phone, u.role::text, u.status::text
        FROM users u
        JOIN user_role_assignments a ON a.user_id = u.id
        JOIN roles r ON r.id = a.role_id
        WHERE r.key = ANY($1::text[])
          AND a.revoked_at IS NULL AND a.valid_from <= now()
          AND (a.valid_until IS NULL OR a.valid_until > now())
          AND u.deleted_at IS NULL
        ORDER BY u.name, u.id
      `, [STAFF_ROLE_KEYS])
    ).rows);
  }

  deactivate(
    actor: RlsContext,
    permissions: Set<string>,
    scopes: RoleAssignment[],
    userId: string,
  ) {
    return this.roleAssignments.deactivateStaff(actor, permissions, scopes, userId);
  }

  grantRole(
    actor: RlsContext,
    permissions: Set<string>,
    scopes: RoleAssignment[],
    userId: string,
    input: GrantRoleInput | InviteStaffInput,
  ) {
    return this.roleAssignments.grant(actor, permissions, scopes, userId, input);
  }

  revokeRole(
    actor: RlsContext,
    permissions: Set<string>,
    scopes: RoleAssignment[],
    assignmentId: string,
  ) {
    return this.roleAssignments.revoke(actor, permissions, scopes, assignmentId);
  }

  listInvitations(scopes: RoleAssignment[]) {
    return this.invitations.list(scopes);
  }

  retryInvitation(
    actor: RlsContext,
    permissions: Set<string>,
    scopes: RoleAssignment[],
    invitationId: string,
  ) {
    return this.invitations.retry(actor, permissions, scopes, invitationId);
  }

  cancelInvitation(
    actor: RlsContext,
    permissions: Set<string>,
    scopes: RoleAssignment[],
    invitationId: string,
  ) {
    return this.invitations.cancel(actor, permissions, scopes, invitationId);
  }
}
