-- Landlord & Property Registration Form parity — the platform's landlord/
-- property intake previously covered a fraction of the fields on the real
-- Google Form (business type, WhatsApp, emergency contact reuse aside,
-- authority-over-property, gender arrangement, room aggregates, security/
-- accessibility checklists, and the landlord's own 5-item consent were all
-- missing). This brings every remaining field onto structured columns so
-- both the landlord self-serve flow and the Ops concierge (admin console)
-- flow can capture the same data. Deliberately excludes the Google Form's
-- Identity Verification section (ID document type/number, and "does the
-- proof document match the property") — landlords are never asked to
-- submit an identity document (privacy decision, product call).
--
-- text + CHECK throughout, not pgEnum, matching the operational_status
-- precedent (0013) for post-hoc ALTER TABLE additions on a live table.

ALTER TABLE landlords ADD COLUMN IF NOT EXISTS whatsapp_number text;
--> statement-breakpoint
ALTER TABLE landlords ADD COLUMN IF NOT EXISTS business_type text NOT NULL DEFAULT 'individual_landlord';
--> statement-breakpoint
ALTER TABLE landlords ADD COLUMN IF NOT EXISTS business_type_other text;
--> statement-breakpoint
ALTER TABLE landlords DROP CONSTRAINT IF EXISTS landlords_business_type_check;
--> statement-breakpoint
ALTER TABLE landlords ADD CONSTRAINT landlords_business_type_check
  CHECK (business_type IN (
    'individual_landlord', 'joint_owners', 'family_business', 'registered_company',
    'partnership', 'hostel_management_company', 'property_agent', 'university',
    'religious_organisation', 'other'
  ));
--> statement-breakpoint

ALTER TABLE properties ADD COLUMN IF NOT EXISTS alternative_name text;
--> statement-breakpoint
ALTER TABLE properties ADD COLUMN IF NOT EXISTS gender_arrangement text;
--> statement-breakpoint
ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_gender_arrangement_check;
--> statement-breakpoint
ALTER TABLE properties ADD CONSTRAINT properties_gender_arrangement_check
  CHECK (gender_arrangement IS NULL OR gender_arrangement IN ('male_only', 'female_only', 'mixed'));
--> statement-breakpoint
ALTER TABLE properties ADD COLUMN IF NOT EXISTS other_catchments jsonb NOT NULL DEFAULT '[]';
--> statement-breakpoint
ALTER TABLE properties ADD COLUMN IF NOT EXISTS location_details text;
--> statement-breakpoint
ALTER TABLE properties ADD COLUMN IF NOT EXISTS authority_role text;
--> statement-breakpoint
ALTER TABLE properties ADD COLUMN IF NOT EXISTS authority_role_other text;
--> statement-breakpoint
ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_authority_role_check;
--> statement-breakpoint
ALTER TABLE properties ADD CONSTRAINT properties_authority_role_check
  CHECK (authority_role IS NULL OR authority_role IN (
    'owner', 'joint_owner', 'property_manager', 'caretaker', 'agent',
    'family_representative', 'tenant_allowed_to_sublet', 'other'
  ));
--> statement-breakpoint
ALTER TABLE properties ADD COLUMN IF NOT EXISTS transport_shuttle boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE properties ADD COLUMN IF NOT EXISTS advance_rent_required boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE properties ADD COLUMN IF NOT EXISTS booking_fee_percent smallint;
--> statement-breakpoint
ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_booking_fee_percent_check;
--> statement-breakpoint
ALTER TABLE properties ADD CONSTRAINT properties_booking_fee_percent_check
  CHECK (booking_fee_percent IS NULL OR booking_fee_percent BETWEEN 0 AND 100);
--> statement-breakpoint
ALTER TABLE properties ADD COLUMN IF NOT EXISTS rent_period text;
--> statement-breakpoint
ALTER TABLE properties ADD COLUMN IF NOT EXISTS rent_period_other text;
--> statement-breakpoint
ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_rent_period_check;
--> statement-breakpoint
ALTER TABLE properties ADD CONSTRAINT properties_rent_period_check
  CHECK (rent_period IS NULL OR rent_period IN ('monthly', 'per_semester', 'other'));
--> statement-breakpoint
-- Distinct from the pre-existing `utilities` column (water/electricity/
-- internet/waste-collection service status, admin-only today) — the Google
-- Form's "Utilities Included" question is actually about furnishing
-- (bathroom/kitchen/mattress/wardrobe/...), a different concept that
-- happens to share the word "utilities". Kept as its own column so a
-- landlord submission can never clobber the admin-set service statuses.
ALTER TABLE properties ADD COLUMN IF NOT EXISTS furnishing_items jsonb NOT NULL DEFAULT '{}';
--> statement-breakpoint
ALTER TABLE properties ADD COLUMN IF NOT EXISTS security_features jsonb NOT NULL DEFAULT '{}';
--> statement-breakpoint
ALTER TABLE properties ADD COLUMN IF NOT EXISTS accessibility_features jsonb NOT NULL DEFAULT '{}';
--> statement-breakpoint
ALTER TABLE properties ADD COLUMN IF NOT EXISTS photography_consent boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE properties ADD COLUMN IF NOT EXISTS self_contained_room_count smallint;
--> statement-breakpoint
ALTER TABLE properties ADD COLUMN IF NOT EXISTS non_self_contained_room_count smallint;
--> statement-breakpoint
ALTER TABLE properties ADD COLUMN IF NOT EXISTS declared_info_accurate boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE properties ADD COLUMN IF NOT EXISTS declared_authority_over_property boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE properties ADD COLUMN IF NOT EXISTS declared_will_keep_updated boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE properties ADD COLUMN IF NOT EXISTS declared_authorizes_publish boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE properties ADD COLUMN IF NOT EXISTS declared_consent_to_processing boolean NOT NULL DEFAULT false;
