CREATE TABLE "saved_listings" (
	"student_id" uuid NOT NULL,
	"listing_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_listings_student_id_listing_id_pk" PRIMARY KEY("student_id","listing_id")
);
--> statement-breakpoint
ALTER TABLE "saved_listings" ADD CONSTRAINT "saved_listings_student_id_students_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_listings" ADD CONSTRAINT "saved_listings_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- RLS: 0001's blanket GRANT/ENABLE/svc_all predates this table (same pattern
-- as 0002/0004's post-hoc tables) — repeat it here. No UPDATE grant: a save
-- is either inserted or deleted, never modified in place.
GRANT SELECT, INSERT, DELETE ON saved_listings TO app_user;
--> statement-breakpoint
ALTER TABLE saved_listings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY svc_all ON saved_listings FOR ALL USING (app_is_service()) WITH CHECK (app_is_service());
--> statement-breakpoint

-- A student manages only their own favourites — no ops/landlord visibility,
-- nothing to moderate here.
CREATE POLICY saved_listings_self ON saved_listings FOR ALL
  USING (student_id = app_user_id() AND app_role() = 'student')
  WITH CHECK (student_id = app_user_id() AND app_role() = 'student');