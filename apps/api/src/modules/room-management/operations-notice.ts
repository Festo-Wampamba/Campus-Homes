import type { PoolClient } from 'pg';

export interface OperationChange { label: string; before: string; after: string }

/** Use only in a service-context transaction. Select recipients with the same
 * assignment/scope policy as the review queue, retaining an admin copy. */
export async function recordOperationsNotice(
  client: PoolClient,
  propertyId: string,
  template: string,
  message: string,
  details: { changeSetId?: string; changes?: OperationChange[]; opsPath?: string } = {},
): Promise<{ userId: string; roleKey: string }[]> {
  const { rows } = await client.query<{ userId: string; roleKey: string }>(
    `INSERT INTO notifications(user_id, template_key, channel, payload)
     SELECT recipient.id, $2, 'in_app',
       jsonb_build_object('message', $3::text, 'propertyId', p.id, 'propertyName', p.name,
         'landlordName', coalesce(nullif(owner.name,''), nullif(landlord.legal_name,''), 'Landlord'),
         'href', CASE WHEN recipient.role_key='ops_lead' THEN $5::text ELSE CASE WHEN $5::text='/ops' THEN '/admin/verifications' ELSE '/admin/room-changes' END END)
         || $4::jsonb
     FROM properties p JOIN users owner ON owner.id=p.landlord_id
     LEFT JOIN landlords landlord ON landlord.user_id=p.landlord_id
     CROSS JOIN LATERAL (
       SELECT DISTINCT ON (u.id) u.id, r.key role_key
       FROM users u JOIN user_role_assignments a ON a.user_id=u.id JOIN roles r ON r.id=a.role_id
       WHERE r.key IN ('ops_lead','super_admin','platform_admin')
         AND a.revoked_at IS NULL AND a.valid_from<=now()
         AND (a.valid_until IS NULL OR a.valid_until>now())
         AND public.app_staff_scope_for(u.id,
           CASE WHEN r.key='ops_lead' THEN 'ops_lead' ELSE 'admin' END, true, p.id, true)
       ORDER BY u.id, CASE WHEN r.key='ops_lead' THEN 0 ELSE 1 END
     ) recipient
     WHERE p.id=$1
     RETURNING user_id AS "userId",
       CASE WHEN payload->>'href'='/ops' OR payload->>'href' LIKE '/ops/%' THEN 'ops_lead' ELSE 'admin' END AS "roleKey"`,
    [propertyId, template, message, JSON.stringify({ changeSetId: details.changeSetId, changes: details.changes }), details.opsPath ?? '/ops/room-changes'],
  );
  return rows;
}
