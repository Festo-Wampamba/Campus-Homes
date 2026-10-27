-- Adds "Property manager" to the landlord onboarding question
-- "How do you operate this accommodation?" (LANDLORD_BUSINESS_TYPES in shared).
ALTER TABLE landlords DROP CONSTRAINT IF EXISTS landlords_business_type_check;
--> statement-breakpoint
ALTER TABLE landlords ADD CONSTRAINT landlords_business_type_check
  CHECK (business_type IN (
    'individual_landlord', 'joint_owners', 'family_business', 'registered_company',
    'partnership', 'hostel_management_company', 'property_manager', 'property_agent',
    'university', 'religious_organisation', 'other'
  ));
