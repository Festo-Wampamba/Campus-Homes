-- Reservation hold drops from 72h to 24h. Only rewrites the untouched 0013
-- seed: a value an admin saved in Settings (updated_by set) is kept.
UPDATE platform_settings
SET value = '24'::jsonb, updated_at = now()
WHERE key = 'reservation_hold_hours'
  AND value = '72'::jsonb
  AND updated_by IS NULL;
