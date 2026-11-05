import type { TeamCapability } from '@campushomes/shared';
import type { PoolClient } from 'pg';

export const TEAM_ROLES = ['custodian', 'property_worker'] as const;

export function isTeamRole(role: string): boolean {
  return (TEAM_ROLES as readonly string[]).includes(role);
}

/** Whether this custodian or worker holds a live assignment on the property
 * that the landlord granted `capability` on. Runs on the caller's open client. */
export async function hasTeamCapability(
  client: PoolClient, userId: string, propertyId: string, capability: TeamCapability,
): Promise<boolean> {
  const res = await client.query(
    `SELECT 1 FROM property_memberships
     WHERE property_id = $1 AND user_id = $2 AND role = ANY($3::text[])
       AND revoked_at IS NULL AND status = 'active'
       AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now())
       AND $4 = ANY(capabilities)
     LIMIT 1`,
    [propertyId, userId, TEAM_ROLES, capability],
  );
  return (res.rowCount ?? 0) > 0;
}
