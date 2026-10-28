CREATE TABLE "booking_family_group_members" (
	"family_group_id" uuid NOT NULL,
	"attendee_id" uuid NOT NULL,
	CONSTRAINT "booking_family_group_members_family_group_id_attendee_id_pk" PRIMARY KEY("family_group_id","attendee_id")
);
--> statement-breakpoint
CREATE TABLE "booking_family_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"event_day_id" uuid NOT NULL
);
--> statement-breakpoint
DROP INDEX "inventory_holds_active_expires_idx";--> statement-breakpoint
ALTER TABLE "idempotency_keys" ALTER COLUMN "response_status" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ALTER COLUMN "response_json" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_lines" ADD COLUMN "family_group_id" uuid;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "inventory_holds" ADD COLUMN "committed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "booking_family_group_members" ADD CONSTRAINT "booking_family_group_members_family_group_id_booking_family_groups_id_fk" FOREIGN KEY ("family_group_id") REFERENCES "public"."booking_family_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_family_group_members" ADD CONSTRAINT "booking_family_group_members_attendee_id_booking_attendees_id_fk" FOREIGN KEY ("attendee_id") REFERENCES "public"."booking_attendees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_family_groups" ADD CONSTRAINT "booking_family_groups_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_family_groups" ADD CONSTRAINT "booking_family_groups_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_family_groups" ADD CONSTRAINT "booking_family_groups_event_day_id_event_days_id_fk" FOREIGN KEY ("event_day_id") REFERENCES "public"."event_days"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_lines" ADD CONSTRAINT "booking_lines_family_group_id_booking_family_groups_id_fk" FOREIGN KEY ("family_group_id") REFERENCES "public"."booking_family_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventory_holds_active_expires_idx" ON "inventory_holds" USING btree ("expires_at") WHERE "inventory_holds"."released_at" IS NULL AND "inventory_holds"."committed_at" IS NULL;--> statement-breakpoint
ALTER TABLE "inventory_holds" ADD CONSTRAINT "inventory_holds_single_outcome" CHECK ("inventory_holds"."released_at" IS NULL OR "inventory_holds"."committed_at" IS NULL);