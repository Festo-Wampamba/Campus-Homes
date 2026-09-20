-- Public @handle collected at first-sign-in onboarding (the app-side profile
-- gate), distinct from the sign-in identity. Nullable so every existing row
-- and each freshly provisioned identity starts without one; the gate fills it
-- before the user reaches a portal. Case-insensitive uniqueness via a
-- functional index rather than a plain column UNIQUE (which would be
-- case-sensitive). Format is validated in the app (usernameSchema), not a DB
-- CHECK.
ALTER TABLE "users" ADD COLUMN "username" text;
--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_lower_uk" ON "users" (lower("username"));
