import type { PoolClient } from 'pg';

/** A manage-only property's room changes are reviewed without a site visit
 * (0076). Changes already waiting for a visit when the property switches to
 * manage-only move to plain Ops review. Call inside the switch's transaction. */
export async function dropVisitRequirement(client: PoolClient, propertyId: string): Promise<void> {
  await client.query(
    `UPDATE room_type_versions SET status = 'pending_review'
     WHERE status = 'visit_required'
       AND change_set_id IN (
         SELECT id FROM room_inventory_change_sets WHERE property_id = $1 AND status = 'visit_required'
       )`,
    [propertyId],
  );
  await client.query(
    `UPDATE room_inventory_change_sets SET status = 'pending_review', updated_at = now()
     WHERE property_id = $1 AND status = 'visit_required'`,
    [propertyId],
  );
}
