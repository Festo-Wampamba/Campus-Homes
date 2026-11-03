-- Preserve the existing user-purge contract. Actor references are retained as
-- anonymous history; records belonging to purged properties/people cascade.
ALTER TABLE management_agencies ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE management_assignments ALTER COLUMN assigned_by DROP NOT NULL;
ALTER TABLE management_notes ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE office_cases ALTER COLUMN assigned_to DROP NOT NULL;
ALTER TABLE office_cases ALTER COLUMN created_by DROP NOT NULL;
DO $$ DECLARE spec text[]; BEGIN
 FOREACH spec SLICE 1 IN ARRAY ARRAY[
  ['management_agencies','created_by','users','SET NULL'],
  ['management_agency_members','agency_id','management_agencies','CASCADE'],
  ['management_agency_members','user_id','users','CASCADE'],
  ['property_management_mandates','property_id','properties','CASCADE'],
  ['property_management_mandates','landlord_id','users','CASCADE'],
  ['property_management_mandates','manager_id','users','CASCADE'],
  ['property_management_mandates','agency_id','management_agencies','CASCADE'],
  ['property_management_mandates','accepted_by','users','SET NULL'],
  ['management_assignments','mandate_id','property_management_mandates','CASCADE'],
  ['management_assignments','user_id','users','CASCADE'],
  ['management_assignments','assigned_by','users','SET NULL'],
  ['management_notes','property_id','properties','CASCADE'],
  ['management_notes','created_by','users','SET NULL'],
  ['office_cases','assigned_to','users','SET NULL'],
  ['office_cases','created_by','users','SET NULL']
 ] LOOP
  EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I',spec[1],spec[1]||'_'||spec[2]||'_fkey');
  EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY(%I) REFERENCES %I(id) ON DELETE %s',spec[1],spec[1]||'_'||spec[2]||'_fkey',spec[2],spec[3],spec[4]);
 END LOOP;
END $$;
