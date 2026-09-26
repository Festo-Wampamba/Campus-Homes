-- Self-service sign-in email change, ownership-proof gated. A code is mailed
-- to the NEW address; only after the user returns it do we PATCH Logto's
-- primaryEmail. Prevents the escalation where an unverified management PATCH
-- would let a user claim a pending staff invite's email (provisioning
-- consumes invitations by the Logto verified-email claim). svc_all-only RLS:
-- every access runs through MeController under service_role; there is no
-- self policy, so a non-service context matches zero rows.
CREATE TABLE "email_change_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"new_email" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_change_requests" ADD CONSTRAINT "email_change_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "email_change_requests_user_idx" ON "email_change_requests" USING btree ("user_id");
--> statement-breakpoint
ALTER TABLE email_change_requests ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE email_change_requests FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY svc_all ON email_change_requests FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON email_change_requests TO app_user;
