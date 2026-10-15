-- The support page's Contact tab shows a WhatsApp card from
-- support_contact.phone, which has been empty everywhere. Fill it only while
-- it is still empty, so a number an admin has set is never touched.
UPDATE platform_settings
SET value = jsonb_set(value, '{phone}', '"+256768561023"')
WHERE key = 'support_contact' AND COALESCE(value->>'phone', '') = '';
