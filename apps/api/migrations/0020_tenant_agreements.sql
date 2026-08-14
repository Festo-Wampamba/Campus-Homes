-- Digital tenant registration via per-property QR code: scanning a
-- property's QR takes a student to /agreement/:propertyId to fill and sign
-- a tenant agreement the LANDLORD (or an assigned custodian) designs
-- themselves, Google-Forms-style — text blocks, fill-in blanks, multiple
-- choice, checkboxes, in whatever order they like. Standalone from
-- reservations/payments (Phase 1 has no live payment rails). Self-serve
-- submission, no landlord/ops approval step.
--
-- tenant_agreement_templates/_fields are svc_all-only RLS: reads span
-- landlord-own-property, custodian-assigned-property, ops, AND an
-- unauthenticated-until-sign-in student filling the form — no single RLS
-- policy shape covers all of that, so authorization is an explicit in-code
-- check in the service layer (same posture as `roles`/`activities`).
-- tenant_agreements (the actual signed responses) keeps fine-grained RLS —
-- that write is always the submitting student's own row.
-- Gap found while wiring the custodian_read policy below: property_memberships
-- (0013) only ever had svc_all RLS — nobody could read their own membership
-- row, so a nested EXISTS against it from another table's policy silently
-- saw zero rows even for a genuinely-assigned custodian (RLS applies to the
-- subquery's access to property_memberships too, not just the outer query).
-- Self-read is a safe, standard addition — same pattern as students_read.
CREATE POLICY property_memberships_self_read ON property_memberships FOR SELECT
  USING (user_id = app_user_id());
--> statement-breakpoint
GRANT SELECT ON property_memberships TO app_user;
--> statement-breakpoint

CREATE TABLE "tenant_agreement_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"title" text DEFAULT 'Tenant Agreement' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenant_agreement_templates" ADD CONSTRAINT "tenant_agreement_templates_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tenant_agreement_templates" ADD CONSTRAINT "tenant_agreement_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_agreement_templates_property_uk" ON "tenant_agreement_templates" USING btree ("property_id");
--> statement-breakpoint

CREATE TABLE "tenant_agreement_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	-- 'heading'/'paragraph' = static content (not fillable) — a section title
	-- vs. body text/terms, same distinction as a real document. 'fill_in' = a
	-- blank the student types into; 'multiple_choice' = single-select bullets;
	-- 'checkboxes' = multi-select. Signature is NOT a field type here — every
	-- submission always ends with one, drawn or typed (see tenant_agreements
	-- below), so it isn't something the landlord configures per template.
	"field_type" text NOT NULL,
	"label" text NOT NULL,
	"options" jsonb,
	"required" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_agreement_fields_type_check" CHECK ("field_type" IN ('heading', 'paragraph', 'fill_in', 'multiple_choice', 'checkboxes'))
);
--> statement-breakpoint
ALTER TABLE "tenant_agreement_fields" ADD CONSTRAINT "tenant_agreement_fields_template_id_tenant_agreement_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."tenant_agreement_templates"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "tenant_agreement_fields_template_position_idx" ON "tenant_agreement_fields" USING btree ("template_id","position");
--> statement-breakpoint

ALTER TABLE tenant_agreement_templates ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY svc_all ON tenant_agreement_templates FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_agreement_templates TO app_user;
--> statement-breakpoint

ALTER TABLE tenant_agreement_fields ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY svc_all ON tenant_agreement_fields FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_agreement_fields TO app_user;
--> statement-breakpoint

-- The signed responses. A snapshot of the template's fields is stored in
-- `responses` (fieldId/label/type carried along, not just fieldId) so
-- editing the template later never corrupts how an old submission displays.
CREATE TABLE "tenant_agreements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"responses" jsonb NOT NULL,
	"signature_type" text NOT NULL,
	"signed_name" text,
	"signature_storage_key" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_agreements_signature_type_check" CHECK ("signature_type" IN ('typed', 'drawn')),
	CONSTRAINT "tenant_agreements_signature_value_check" CHECK (
		("signature_type" = 'typed' AND "signed_name" IS NOT NULL) OR
		("signature_type" = 'drawn' AND "signature_storage_key" IS NOT NULL)
	)
);
--> statement-breakpoint
ALTER TABLE "tenant_agreements" ADD CONSTRAINT "tenant_agreements_template_id_tenant_agreement_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."tenant_agreement_templates"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tenant_agreements" ADD CONSTRAINT "tenant_agreements_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tenant_agreements" ADD CONSTRAINT "tenant_agreements_student_id_students_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("user_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_agreements_property_student_uk" ON "tenant_agreements" USING btree ("property_id","student_id");
--> statement-breakpoint
ALTER TABLE tenant_agreements ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY svc_all ON tenant_agreements FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint
-- Student: submit and read their own signed agreements. No update/delete —
-- a signed submission is a record, not an editable draft.
CREATE POLICY tenant_agreements_self_insert ON tenant_agreements FOR INSERT
  WITH CHECK (student_id = app_user_id() AND app_role() = 'student');
--> statement-breakpoint
CREATE POLICY tenant_agreements_self_read ON tenant_agreements FOR SELECT
  USING (student_id = app_user_id());
--> statement-breakpoint
-- Landlord: read-only, scoped to agreements on their own properties.
CREATE POLICY tenant_agreements_landlord_read ON tenant_agreements FOR SELECT
  USING (EXISTS (SELECT 1 FROM properties p WHERE p.id = property_id AND p.landlord_id = app_user_id()));
--> statement-breakpoint
-- Custodian: read-only, scoped to properties they're actively assigned to.
CREATE POLICY tenant_agreements_custodian_read ON tenant_agreements FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM property_memberships pm
    WHERE pm.property_id = tenant_agreements.property_id
      AND pm.user_id = app_user_id()
      AND pm.role = 'custodian'
      AND pm.revoked_at IS NULL
  ));
--> statement-breakpoint
-- Ops: read-only across all properties, same oversight posture as other
-- property-adjacent tables.
CREATE POLICY tenant_agreements_ops_read ON tenant_agreements FOR SELECT
  USING (app_is_ops());
--> statement-breakpoint
GRANT SELECT, INSERT ON tenant_agreements TO app_user;
