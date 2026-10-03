-- 0013 seeded support_contact with a placeholder on a domain CampusHomes does
-- not use (campushomes.com), and it has been shown publicly in the footer,
-- support page and legal pages since. Replace it only while it still holds
-- that exact placeholder, so an address an admin has set is never touched.
UPDATE platform_settings
SET value = jsonb_set(value, '{email}', '"hello@campushomes.co.ug"')
WHERE key = 'support_contact' AND value->>'email' = 'support@campushomes.com';
