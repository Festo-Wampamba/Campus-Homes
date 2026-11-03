-- A distinct identity prevents delegated managers satisfying landlord guards.
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'property_manager';
