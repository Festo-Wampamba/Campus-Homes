import type { AccountAccess, AuthenticationAssurance, UserRole, Workspace } from '@campushomes/shared';

import type { RlsDb } from '../../db/db.module';

export const STAFF_ROLE_TO_DB_ROLE: Readonly<Record<string, UserRole>> = {
  super_admin: 'admin', platform_admin: 'admin', finance_admin: 'admin',
  support_admin: 'admin', auditor: 'admin', ops_lead: 'ops_lead', ops_inspector: 'ops_inspector',
};

export function effectiveRoles(roleKeys: readonly string[]): UserRole[] {
  return [...new Set(roleKeys.flatMap((key): UserRole[] => {
    const staff = Object.hasOwn(STAFF_ROLE_TO_DB_ROLE, key) ? STAFF_ROLE_TO_DB_ROLE[key] : undefined;
    if (staff) return [staff];
    return ['student', 'landlord', 'custodian', 'property_worker'].includes(key) ? [key as UserRole] : [];
  }))];
}

/** Missing/invalid provider evidence never becomes application-created assurance. */
export function normalizeAssurance(assurance?: AuthenticationAssurance): AuthenticationAssurance {
  const time = assurance?.authenticatedAt ? Date.parse(assurance.authenticatedAt) : NaN;
  const authenticatedAt = Number.isFinite(time) && time <= Date.now()
    ? new Date(time).toISOString() : null;
  return { authenticatedAt, mfaVerified: authenticatedAt !== null && assurance?.mfaVerified === true };
}

export interface AccessIdentity {
  role: string;
  hasStudent: boolean;
  hasLandlord: boolean;
  activeRoles: string[];
  historicalRoles: string[];
}

export function accountAccess(identity: AccessIdentity, assurance?: AuthenticationAssurance): AccountAccess {
  const roles = new Set(identity.activeRoles);
  // Legacy consumer rows remain usable, but any assignment history is authoritative
  // for that workspace: an expired/revoked grant must never be resurrected.
  for (const key of ['student', 'landlord'] as const) {
    const profile = key === 'student' ? identity.hasStudent : identity.hasLandlord;
    if (!identity.historicalRoles.includes(key) && (identity.role === key || profile)) roles.add(key);
  }
  const mapped = effectiveRoles([...roles]);
  const workspaces: Workspace[] = [];
  if (mapped.includes('student')) workspaces.push('student');
  if (mapped.some((r) => ['landlord', 'custodian', 'property_worker'].includes(r))) workspaces.push('landlord');
  if (mapped.some((r) => ['ops_lead', 'ops_inspector', 'admin'].includes(r))) workspaces.push('ops');
  if (mapped.includes('admin')) workspaces.push('admin');
  return {
    roles: [...roles].sort(), workspaces,
    onboarding: {
      student: mapped.includes('student') && !identity.hasStudent,
      landlord: mapped.includes('landlord') && !identity.hasLandlord,
    },
    assurance: normalizeAssurance(assurance),
  };
}

/** Re-resolved on every session lookup: session lifetime never extends a grant. */
export async function resolveAccountAccess(
  rlsDb: RlsDb, userId: string, assurance?: AuthenticationAssurance,
): Promise<AccountAccess | null> {
  const identity = await rlsDb.run({ userId, role: 'service_role' }, async (_db, client) => {
    const result = await client.query<AccessIdentity>(`
      SELECT u.role::text AS role,
        EXISTS (SELECT 1 FROM students s WHERE s.user_id = u.id) AS "hasStudent",
        EXISTS (SELECT 1 FROM landlords l WHERE l.user_id = u.id) AS "hasLandlord",
        ARRAY(SELECT r.key FROM user_role_assignments a JOIN roles r ON r.id = a.role_id
          WHERE a.user_id = u.id AND a.revoked_at IS NULL AND a.valid_from <= now()
            AND (a.valid_until IS NULL OR a.valid_until > now())
            AND ((a.scope_type = 'platform_wide' AND a.scope_id IS NULL)
              OR (a.scope_type = 'property' AND EXISTS (SELECT 1 FROM properties p WHERE p.id::text = a.scope_id))
              OR (a.scope_type = 'catchment' AND a.scope_id IN ('MUK','MUBS','KIU','KYU','all')))
        ) AS "activeRoles",
        ARRAY(SELECT r.key FROM user_role_assignments a JOIN roles r ON r.id = a.role_id
          WHERE a.user_id = u.id) AS "historicalRoles"
      FROM users u WHERE u.id = $1 AND u.status = 'active' AND u.deleted_at IS NULL
    `, [userId]);
    return result.rows[0];
  });
  return identity ? accountAccess(identity, assurance) : null;
}
