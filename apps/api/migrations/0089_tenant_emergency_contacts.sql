-- NULL inherits the student's profile; an empty string explicitly clears it
-- for this booking. Landlord updates never mutate another person's profile.
ALTER TABLE reservations ADD COLUMN emergency_contact_name text;
ALTER TABLE reservations ADD COLUMN emergency_contact_phone text;
ALTER TABLE reservations ADD CONSTRAINT reservation_emergency_name_length CHECK (length(emergency_contact_name) <= 120);
ALTER TABLE reservations ADD CONSTRAINT reservation_emergency_phone_length CHECK (length(emergency_contact_phone) <= 32);
