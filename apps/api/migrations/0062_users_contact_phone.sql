-- Contact number every account gives at onboarding. Deliberately separate
-- from users.phone: that column is a sign-in identity (UNIQUE, matched by
-- provisioning), so an unverified typed number there could lock another
-- person out of their account. Not unique, never used to match identities.
ALTER TABLE users ADD COLUMN contact_phone text;
--> statement-breakpoint
-- Phone sign-ups (and staff-entered numbers) already have one; don't re-ask.
UPDATE users SET contact_phone = phone WHERE phone IS NOT NULL;
