-- 0065 filled support_contact.phone with an UPDATE, which does nothing where the
-- row is missing. Production lost the row in its 2026-09 reset, so the support
-- page there shows no WhatsApp card and the admin Save failed. Create the row
-- only where it is missing; an existing row is never touched.
INSERT INTO platform_settings (key, value, description)
VALUES (
  'support_contact',
  '{"email":"hello@campushomes.co.ug","phone":"+256768561023"}'::jsonb,
  'Public support contact details'
)
ON CONFLICT (key) DO NOTHING;
