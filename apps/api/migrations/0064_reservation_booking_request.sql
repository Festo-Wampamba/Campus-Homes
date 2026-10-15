-- A student asks the landlord to confirm (book) a room they hold. Set once by
-- ReservationsService.requestBooking (service path, like every reservations
-- write); the landlord still books through the existing Book action.
ALTER TABLE reservations ADD COLUMN booking_requested_at timestamp with time zone;
