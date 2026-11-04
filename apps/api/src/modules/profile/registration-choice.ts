import { ForbiddenException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { assignRoleInTransaction } from '../staff/role-assignment.service';

/** Only an untouched initial consumer registration can change its initial
 * workspace. Existing accounts add landlord access via the enrollment flow. */
export async function chooseInitialConsumerRole(client: PoolClient, userId: string) {
  const user = (await client.query<{ role: string; username: string | null }>(
    "SELECT role::text, username FROM users WHERE id=$1 AND deleted_at IS NULL AND status='active' FOR UPDATE", [userId])).rows[0];
  if (user?.role === 'landlord') return; // Already explicitly registered as landlord.
  if (!user || user.role !== 'student' || user.username) throw new ForbiddenException('Use landlord enrollment to add a landlord workspace to an existing account');
  const grants = (await client.query<{ id: string; initial: boolean }>(`SELECT a.id,
    (r.key='student' AND a.scope_type='own' AND a.scope_id IS NULL AND a.revoked_at IS NULL
      AND a.valid_from<=now() AND a.valid_until IS NULL
      AND a.reason='Initial role assigned during verified identity provisioning') AS initial
    FROM user_role_assignments a JOIN roles r ON r.id=a.role_id WHERE a.user_id=$1 FOR UPDATE OF a`, [userId])).rows;
  const profiles = (await client.query(`SELECT 1 FROM students WHERE user_id=$1 UNION ALL SELECT 1 FROM landlords WHERE user_id=$1`, [userId])).rows;
  if (grants.length !== 1 || !grants[0]?.initial || profiles.length) throw new ForbiddenException('Use landlord enrollment to add a landlord workspace to an existing account');
  await client.query(`UPDATE user_role_assignments SET revoked_at=now(), revoked_by=$1 WHERE id=$2`, [userId,grants[0].id]);
  await client.query(`UPDATE users SET role='landlord',updated_at=now() WHERE id=$1`, [userId]);
  await assignRoleInTransaction(client, { userId, role: 'service_role' }, userId,
    { roleKey: 'landlord', scopeType: 'own', reason: 'Landlord account selected during first profile setup' });
}
