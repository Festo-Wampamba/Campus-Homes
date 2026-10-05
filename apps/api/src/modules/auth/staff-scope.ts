import { ForbiddenException } from '@nestjs/common';
import type { PoolClient } from 'pg';

import type { RlsContext } from '../../db/rls-context';

/** Check the original actor before crossing into a service-role write.
 * Reuse RLS's active assignment/MFA/property/catchment policy.
 * A null target requires platform-wide authority, not any scoped role.
 */
export async function assertStaffScope(client: PoolClient, actor: RlsContext, propertyId: string | null = null): Promise<void> {
  const result = await client.query<{ allowed: boolean }>(
    'SELECT public.app_staff_scope_for($1::uuid, $2::text, $3::boolean, $4::uuid, true) AS allowed',
    [actor.userId, actor.role, actor.mfaVerified === true, propertyId],
  );
  if (result.rows[0]?.allowed !== true) throw new ForbiddenException('This action is outside your staff scope');
}
