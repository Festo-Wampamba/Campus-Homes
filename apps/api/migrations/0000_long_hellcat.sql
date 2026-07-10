CREATE TYPE "public"."catchment" AS ENUM('MUK', 'MUBS', 'KIU', 'KYU', 'all');--> statement-breakpoint
CREATE TYPE "public"."doc_type" AS ENUM('title_deed', 'tenancy', 'authorization', 'other');--> statement-breakpoint
CREATE TYPE "public"."kyc_status" AS ENUM('pending', 'verified', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."listing_status" AS ENUM('draft', 'pending_verification', 'verified', 'expired', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."move_in_confirmer_role" AS ENUM('student', 'landlord', 'ops');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('sms', 'push', 'in_app');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('pending', 'sent', 'delivered', 'failed');--> statement-breakpoint
CREATE TYPE "public"."ops_team" AS ENUM('inspector', 'lead');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('mtn_momo', 'airtel_money', 'card', 'bank_transfer');--> statement-breakpoint
CREATE TYPE "public"."payment_provider" AS ENUM('flutterwave');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."property_status" AS ENUM('pending_kyc', 'active', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."property_type" AS ENUM('hostel');--> statement-breakpoint
CREATE TYPE "public"."refund_reason" AS ENUM('cooling_off', 'landlord_failure', 'ops_dispute', 'student_cancel');--> statement-breakpoint
CREATE TYPE "public"."refund_status" AS ENUM('pending', 'processed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."reputation_subject_type" AS ENUM('property', 'landlord');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('held', 'payment_pending', 'payment_failed', 'fulfilled', 'cancelled', 'refunded', 'expired');--> statement-breakpoint
CREATE TYPE "public"."strike_reason" AS ENUM('no_show', 'price_mismatch', 'amenity_fraud', 'abusive', 'other');--> statement-breakpoint
CREATE TYPE "public"."student_flag_reason" AS ENUM('no_show', 'abusive_chat', 'false_review', 'other');--> statement-breakpoint
CREATE TYPE "public"."token_type" AS ENUM('phone_otp', 'step_up_otp');--> statement-breakpoint
CREATE TYPE "public"."university" AS ENUM('MUK', 'MUBS', 'KIU', 'KYU', 'other');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('student', 'landlord', 'ops_inspector', 'ops_lead', 'admin');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'suspended', 'pending');--> statement-breakpoint
CREATE TYPE "public"."visit_result" AS ENUM('pending', 'passed', 'failed');--> statement-breakpoint
CREATE TABLE "landlords" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"legal_name" text NOT NULL,
	"kyc_status" "kyc_status" DEFAULT 'pending' NOT NULL,
	"id_doc_storage_key" text,
	"phone_verified_at" timestamp with time zone,
	"kyc_reviewed_by" uuid,
	"kyc_reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ops_staff" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"team" "ops_team" NOT NULL,
	"assigned_catchment" "catchment" DEFAULT 'MUK' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "students" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"university" "university" NOT NULL,
	"year_of_study" smallint,
	"national_id_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text,
	"email" text,
	"role" "user_role" NOT NULL,
	"status" "user_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_phone_unique" UNIQUE("phone"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"type" "token_type" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"landlord_id" uuid NOT NULL,
	"name" text NOT NULL,
	"street_address" text NOT NULL,
	"gps_lat" numeric(10, 7),
	"gps_lon" numeric(10, 7),
	"type" "property_type" DEFAULT 'hostel' NOT NULL,
	"status" "property_status" DEFAULT 'pending_kyc' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "property_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"doc_type" "doc_type" NOT NULL,
	"storage_key" text NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verified_by" uuid,
	"verified_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "semesters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"re_verification_window_starts_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"inspector_id" uuid NOT NULL,
	"scheduled_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"visit_gps_lat" numeric(10, 7),
	"visit_gps_lon" numeric(10, 7),
	"checklist" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"client_idempotency_key" text NOT NULL,
	"result" "visit_result" DEFAULT 'pending' NOT NULL,
	"failure_reason" text,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_version_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"captured_by" uuid NOT NULL,
	"gps_lat" numeric(10, 7) NOT NULL,
	"gps_lon" numeric(10, 7) NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "listing_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"price_per_term_ugx" integer NOT NULL,
	"amenities" jsonb NOT NULL,
	"description" text,
	"verified_at" timestamp with time zone NOT NULL,
	"verified_by" uuid NOT NULL,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"semester_id" uuid NOT NULL,
	"status" "listing_status" DEFAULT 'draft' NOT NULL,
	"current_version_id" uuid,
	"verified_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"label" text NOT NULL,
	"capacity" smallint DEFAULT 1 NOT NULL,
	"available_for_semester_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "move_ins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"confirmed_at" timestamp with time zone,
	"confirmed_by_role" "move_in_confirmer_role" NOT NULL,
	"no_show" boolean DEFAULT false NOT NULL,
	"landlord_failure_flag" boolean DEFAULT false NOT NULL,
	"landlord_failure_reason" text,
	"ops_verified_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"provider" "payment_provider" DEFAULT 'flutterwave' NOT NULL,
	"provider_txn_id" text,
	"provider_ref" text,
	"amount_ugx" integer NOT NULL,
	"currency" text DEFAULT 'UGX' NOT NULL,
	"payment_method" "payment_method" NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"webhook_verified" boolean DEFAULT false NOT NULL,
	"raw_webhook" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verified_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"reservation_id" uuid NOT NULL,
	"reason" "refund_reason" NOT NULL,
	"amount_ugx" integer NOT NULL,
	"status" "refund_status" DEFAULT 'pending' NOT NULL,
	"processed_by" uuid,
	"provider_refund_id" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"listing_version_id" uuid NOT NULL,
	"status" "reservation_status" DEFAULT 'held' NOT NULL,
	"fee_amount_ugx" integer DEFAULT 5000 NOT NULL,
	"hold_starts_at" timestamp with time zone,
	"hold_expires_at" timestamp with time zone,
	"cooling_off_expires_at" timestamp with time zone,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid NOT NULL,
	"actor_role" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"ip_address" text,
	"ts" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "landlord_strikes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"landlord_id" uuid NOT NULL,
	"reason" "strike_reason" NOT NULL,
	"reservation_id" uuid,
	"description" text NOT NULL,
	"issued_by" uuid NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"listing_version_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"amenity_match" jsonb NOT NULL,
	"overall_rating" smallint NOT NULL,
	"comment" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"reason" "student_flag_reason" NOT NULL,
	"reservation_id" uuid,
	"description" text NOT NULL,
	"issued_by" uuid NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"from_user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "chat_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"landlord_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_message_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notification_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"subject" text,
	"body_template" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"template_key" text NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "notification_status" DEFAULT 'pending' NOT NULL,
	"delivery_status" text,
	"provider_message_id" text,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth_key" text NOT NULL,
	"device_label" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "landlords" ADD CONSTRAINT "landlords_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landlords" ADD CONSTRAINT "landlords_kyc_reviewed_by_users_id_fk" FOREIGN KEY ("kyc_reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_staff" ADD CONSTRAINT "ops_staff_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_tokens" ADD CONSTRAINT "verification_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_landlord_id_landlords_user_id_fk" FOREIGN KEY ("landlord_id") REFERENCES "public"."landlords"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_documents" ADD CONSTRAINT "property_documents_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_documents" ADD CONSTRAINT "property_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_documents" ADD CONSTRAINT "property_documents_verified_by_ops_staff_user_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."ops_staff"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_visits" ADD CONSTRAINT "verification_visits_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_visits" ADD CONSTRAINT "verification_visits_inspector_id_ops_staff_user_id_fk" FOREIGN KEY ("inspector_id") REFERENCES "public"."ops_staff"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_visits" ADD CONSTRAINT "verification_visits_approved_by_ops_staff_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."ops_staff"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_photos" ADD CONSTRAINT "listing_photos_listing_version_id_listing_versions_id_fk" FOREIGN KEY ("listing_version_id") REFERENCES "public"."listing_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_photos" ADD CONSTRAINT "listing_photos_captured_by_ops_staff_user_id_fk" FOREIGN KEY ("captured_by") REFERENCES "public"."ops_staff"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_versions" ADD CONSTRAINT "listing_versions_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_versions" ADD CONSTRAINT "listing_versions_verified_by_ops_staff_user_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."ops_staff"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_semester_id_semesters_id_fk" FOREIGN KEY ("semester_id") REFERENCES "public"."semesters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_available_for_semester_id_semesters_id_fk" FOREIGN KEY ("available_for_semester_id") REFERENCES "public"."semesters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "move_ins" ADD CONSTRAINT "move_ins_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "move_ins" ADD CONSTRAINT "move_ins_ops_verified_by_ops_staff_user_id_fk" FOREIGN KEY ("ops_verified_by") REFERENCES "public"."ops_staff"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_processed_by_users_id_fk" FOREIGN KEY ("processed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_student_id_students_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_listing_version_id_listing_versions_id_fk" FOREIGN KEY ("listing_version_id") REFERENCES "public"."listing_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landlord_strikes" ADD CONSTRAINT "landlord_strikes_landlord_id_landlords_user_id_fk" FOREIGN KEY ("landlord_id") REFERENCES "public"."landlords"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landlord_strikes" ADD CONSTRAINT "landlord_strikes_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landlord_strikes" ADD CONSTRAINT "landlord_strikes_issued_by_ops_staff_user_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."ops_staff"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_listing_version_id_listing_versions_id_fk" FOREIGN KEY ("listing_version_id") REFERENCES "public"."listing_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_student_id_students_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_flags" ADD CONSTRAINT "student_flags_student_id_students_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_flags" ADD CONSTRAINT "student_flags_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_flags" ADD CONSTRAINT "student_flags_issued_by_ops_staff_user_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."ops_staff"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_thread_id_chat_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."chat_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_student_id_students_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_landlord_id_landlords_user_id_fk" FOREIGN KEY ("landlord_id") REFERENCES "public"."landlords"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "verification_visits_idempotency_uk" ON "verification_visits" USING btree ("client_idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "listing_versions_listing_version_uk" ON "listing_versions" USING btree ("listing_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "listings_property_semester_uk" ON "listings" USING btree ("property_id","semester_id");--> statement-breakpoint
CREATE UNIQUE INDEX "move_ins_reservation_uk" ON "move_ins" USING btree ("reservation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_txn_uk" ON "payments" USING btree ("provider_txn_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reservations_idempotency_uk" ON "reservations" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "reservations_one_live_hold_per_unit" ON "reservations" USING btree ("unit_id") WHERE status = 'held';--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_reservation_uk" ON "reviews" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "chat_messages_thread_sent_idx" ON "chat_messages" USING btree ("thread_id","sent_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "chat_threads_reservation_uk" ON "chat_threads" USING btree ("reservation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_templates_key_uk" ON "notification_templates" USING btree ("key");--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_user_endpoint_uk" ON "push_subscriptions" USING btree ("user_id","endpoint");