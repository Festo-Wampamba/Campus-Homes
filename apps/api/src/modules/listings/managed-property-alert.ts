import type { PoolClient } from 'pg';

import { escapeHtml, sendNotificationEmail } from '../../adapters/notification-email';
import type { Env } from '../../config/env';

/** Active Ops leads and inspectors whose scope covers this property: platform
 * wide, its catchment (or every catchment), or the property itself. */
export async function managedPropertyReviewers(
  client: PoolClient,
  propertyId: string,
): Promise<{ userId: string; email: string | null }[]> {
  const result = await client.query<{ userId: string; email: string | null }>(
    `SELECT DISTINCT u.id AS "userId", u.email
     FROM user_role_assignments a
     JOIN roles r ON r.id = a.role_id
     JOIN users u ON u.id = a.user_id
     JOIN properties p ON p.id = $1
     WHERE r.key IN ('ops_lead', 'ops_inspector')
       AND a.revoked_at IS NULL AND a.valid_from <= now()
       AND (a.valid_until IS NULL OR a.valid_until > now())
       AND u.status = 'active' AND u.deleted_at IS NULL
       AND ((a.scope_type = 'platform_wide' AND a.scope_id IS NULL)
         OR (a.scope_type = 'catchment' AND a.scope_id IN (p.catchment::text, 'all'))
         OR (a.scope_type = 'property' AND a.scope_id = p.id::text))`,
    [propertyId],
  );
  return result.rows;
}

// Same posture as room-change-email.ts: best-effort, the in-app notice is
// already stored.
export async function sendManagedPropertyEmail(env: Env, to: string[], propertyName: string): Promise<void> {
  if (to.length === 0) return;
  const html = `
    <p>A landlord registered ${escapeHtml(propertyName)} to manage on CampusHomes (not listed to students).
    Check the basics, such as its location, then approve or send it back.</p>
    <p><a href="${env.AUTH_APP_URL}/ops/managed-properties">Open managed properties</a></p>
  `;
  await sendNotificationEmail(env, {
    to,
    subject: 'A managed property is waiting for approval',
    html,
    kind: 'managed-property',
  });
}
