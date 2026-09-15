-- Hard-delete (users.delete / users.purge) runs its cascade as app_user with
-- the app.user_role GUC flipped to service_role (withRlsContext never SET ROLEs
-- to a real service role). The cascade tables are append-only for normal
-- operations, so DELETE was never granted to app_user — the cascade failed with
-- "permission denied for table chat_messages". Grant DELETE on exactly the
-- tables the cascade removes rows from. This does NOT let regular users delete:
-- every one of these tables already has a service_role-only (svc_all) RLS
-- policy, so a delete under a normal user's GUC still matches zero rows.
GRANT DELETE ON
  chat_messages, chat_threads, reviews, refunds, landlord_strikes, student_flags,
  reservation_releases, payments, move_ins, journal_entries, reservations,
  unit_photos, unit_semester_pricing, beds, units, listing_photos, saved_listings,
  listing_versions, listings, tenant_agreements, verification_visits, properties,
  inquiries, property_memberships, room_type_photos, room_type_versions,
  room_unit_changes, room_inventory_change_sets, room_types, unit_blocks
TO app_user;
