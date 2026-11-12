import type { PoolClient } from 'pg';

/** Same child-before-parent ordering as account purge, scoped to one owned property.
 * Registered student/landlord accounts are never selected for deletion. */
export async function purgeProperty(client: PoolClient, propertyId: string) {
  await client.query('CREATE TEMP TABLE _pg_g(id uuid PRIMARY KEY) ON COMMIT DROP');
  await client.query('CREATE TEMP TABLE _pg_props(id uuid PRIMARY KEY) ON COMMIT DROP');
  await client.query('INSERT INTO _pg_props VALUES($1)',[propertyId]);
  await client.query(`
        CREATE TEMP TABLE _pg_lists ON COMMIT DROP AS SELECT id FROM listings WHERE property_id IN (SELECT id FROM _pg_props);
        CREATE TEMP TABLE _pg_vers ON COMMIT DROP AS SELECT id FROM listing_versions WHERE listing_id IN (SELECT id FROM _pg_lists);
        CREATE TEMP TABLE _pg_unts ON COMMIT DROP AS SELECT id FROM units WHERE property_id IN (SELECT id FROM _pg_props);
        CREATE TEMP TABLE _pg_bds ON COMMIT DROP AS SELECT id FROM beds WHERE unit_id IN (SELECT id FROM _pg_unts);
        CREATE TEMP TABLE _pg_res ON COMMIT DROP AS SELECT id FROM reservations WHERE student_id IN (SELECT id FROM _pg_g) OR bed_id IN (SELECT id FROM _pg_bds);
        CREATE TEMP TABLE _pg_thr ON COMMIT DROP AS
          SELECT id FROM chat_threads
          WHERE reservation_id IN (SELECT id FROM _pg_res)
             OR student_id IN (SELECT id FROM _pg_g)
             OR landlord_id IN (SELECT id FROM _pg_g);

        DELETE FROM chat_messages WHERE thread_id IN (SELECT id FROM _pg_thr) OR from_user_id IN (SELECT id FROM _pg_g);
        DELETE FROM chat_threads WHERE id IN (SELECT id FROM _pg_thr);
        DELETE FROM reviews WHERE reservation_id IN (SELECT id FROM _pg_res) OR listing_version_id IN (SELECT id FROM _pg_vers);
        DELETE FROM refunds WHERE reservation_id IN (SELECT id FROM _pg_res);
        DELETE FROM landlord_strikes WHERE reservation_id IN (SELECT id FROM _pg_res);
        DELETE FROM student_flags WHERE reservation_id IN (SELECT id FROM _pg_res);
        DELETE FROM payment_receipts WHERE reservation_id IN (SELECT id FROM _pg_res) OR student_id IN (SELECT id FROM _pg_g) OR landlord_id IN (SELECT id FROM _pg_g);
        DELETE FROM payments WHERE reservation_id IN (SELECT id FROM _pg_res);
        DELETE FROM move_ins WHERE reservation_id IN (SELECT id FROM _pg_res);
        DELETE FROM reservations WHERE id IN (SELECT id FROM _pg_res);

        DELETE FROM room_unit_changes WHERE change_set_id IN (SELECT id FROM room_inventory_change_sets WHERE property_id IN (SELECT id FROM _pg_props)) OR unit_id IN (SELECT id FROM _pg_unts) OR room_type_id IN (SELECT id FROM room_types WHERE property_id IN (SELECT id FROM _pg_props));
        DELETE FROM unit_blocks WHERE unit_id IN (SELECT id FROM _pg_unts);
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
        UPDATE room_types SET current_version_id = NULL WHERE property_id IN (SELECT id FROM _pg_props);
        DELETE FROM room_type_photos WHERE room_type_version_id IN (SELECT id FROM room_type_versions WHERE room_type_id IN (SELECT id FROM room_types WHERE property_id IN (SELECT id FROM _pg_props)));
        DELETE FROM room_type_versions WHERE room_type_id IN (SELECT id FROM room_types WHERE property_id IN (SELECT id FROM _pg_props));
        DELETE FROM room_inventory_change_sets WHERE property_id IN (SELECT id FROM _pg_props);
        DELETE FROM room_types WHERE property_id IN (SELECT id FROM _pg_props);
        DELETE FROM properties WHERE id IN (SELECT id FROM _pg_props);

  `);
  await client.query(`UPDATE user_role_assignments SET revoked_at=now() WHERE scope_type='property' AND scope_id=$1 AND revoked_at IS NULL`,[propertyId]);
}
