-- Reservation hold drops from 24h to 6h (Festo, 2026-10-23). Rewrites 24
-- whether it came from 0061 or was saved in Settings; any other value an admin
-- chose deliberately is kept. Holds already running keep their own expiry.
UPDATE platform_settings
SET value = '6'::jsonb, updated_at = now()
WHERE key = 'reservation_hold_hours'
  AND value = '24'::jsonb;
