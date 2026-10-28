CREATE TYPE "public"."age_band" AS ENUM('infant', 'child', 'adult');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('pending_payment', 'confirmed', 'expired', 'cancelled', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."entry_kind" AS ENUM('none', 'day_pass', 'all_days', 'family_pass');--> statement-breakpoint
CREATE TYPE "public"."payment_provider" AS ENUM('simulated', 'stripe');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'succeeded', 'declined');--> statement-breakpoint
CREATE TYPE "public"."product_category" AS ENUM('entry', 'extra');--> statement-breakpoint
CREATE TYPE "public"."product_pricing" AS ENUM('per_person_per_day', 'flat', 'per_unit');--> statement-breakpoint
CREATE TYPE "public"."promo_kind" AS ENUM('percent', 'fixed', 'free_child_entry');--> statement-breakpoint
CREATE TABLE "booking_attendees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"date_of_birth" date NOT NULL,
	"age_band" "age_band" NOT NULL,
	"entry_kind" "entry_kind" NOT NULL,
	"email" text,
	"phone" text
);
--> statement-breakpoint
CREATE TABLE "booking_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"attendee_id" uuid,
	"event_day_id" uuid,
	"qty" integer NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"line_total_cents" integer NOT NULL,
	CONSTRAINT "booking_lines_amounts_valid" CHECK ("booking_lines"."qty" > 0 AND "booking_lines"."unit_price_cents" >= 0 AND "booking_lines"."discount_cents" >= 0 AND "booking_lines"."line_total_cents" = "booking_lines"."qty" * "booking_lines"."unit_price_cents" - "booking_lines"."discount_cents" AND "booking_lines"."line_total_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"status" "booking_status" NOT NULL,
	"booker_first_name" text NOT NULL,
	"booker_last_name" text NOT NULL,
	"booker_email" text NOT NULL,
	"booker_phone" text NOT NULL,
	"booker_date_of_birth" date NOT NULL,
	"booker_is_attending" boolean NOT NULL,
	"subtotal_cents" integer NOT NULL,
	"discount_cents" integer NOT NULL,
	"total_cents" integer NOT NULL,
	"promo_code_id" uuid,
	"confirmation_code" text,
	"access_token_hash" text NOT NULL,
	"hold_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_confirmation_code_unique" UNIQUE("confirmation_code"),
	CONSTRAINT "bookings_amounts_valid" CHECK ("bookings"."subtotal_cents" >= 0 AND "bookings"."discount_cents" >= 0 AND "bookings"."total_cents" = "bookings"."subtotal_cents" - "bookings"."discount_cents" AND "bookings"."total_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "event_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"date" date NOT NULL,
	"same_day_cutoff_time" time NOT NULL,
	CONSTRAINT "event_days_event_date_uq" UNIQUE("event_id","date")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"timezone" text NOT NULL,
	"currency" text NOT NULL,
	"sales_open_at" timestamp with time zone,
	"sales_close_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"key" text NOT NULL,
	"scope" text NOT NULL,
	"request_hash" text NOT NULL,
	"response_status" integer NOT NULL,
	"response_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_keys_scope_key_pk" PRIMARY KEY("scope","key")
);
--> statement-breakpoint
CREATE TABLE "inventory_holds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"pool_id" uuid NOT NULL,
	"qty" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_holds_qty_positive" CHECK ("inventory_holds"."qty" > 0)
);
--> statement-breakpoint
CREATE TABLE "inventory_pools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"event_day_id" uuid,
	"capacity" integer NOT NULL,
	"remaining" integer NOT NULL,
	CONSTRAINT "inventory_pools_product_day_uq" UNIQUE NULLS NOT DISTINCT("product_id","event_day_id"),
	CONSTRAINT "inventory_pools_remaining_nonnegative" CHECK ("inventory_pools"."remaining" >= 0),
	CONSTRAINT "inventory_pools_remaining_le_capacity" CHECK ("inventory_pools"."remaining" <= "inventory_pools"."capacity")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"provider_ref" text,
	"amount_cents" integer NOT NULL,
	"status" "payment_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_amount_nonnegative" CHECK ("payments"."amount_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"code" text NOT NULL,
	"display_name" text NOT NULL,
	"category" "product_category" NOT NULL,
	"price_cents" integer NOT NULL,
	"pricing" "product_pricing" NOT NULL,
	"rule" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_event_code_uq" UNIQUE("event_id","code"),
	CONSTRAINT "products_price_nonnegative" CHECK ("products"."price_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "promo_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"code" "citext" NOT NULL,
	"kind" "promo_kind" NOT NULL,
	"value" integer NOT NULL,
	"applies_to" jsonb,
	"valid_from" date,
	"valid_to" date,
	"max_redemptions" integer,
	"redemptions" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promo_codes_event_code_uq" UNIQUE("event_id","code"),
	CONSTRAINT "promo_codes_value_nonnegative" CHECK ("promo_codes"."value" >= 0),
	CONSTRAINT "promo_codes_redemptions_within_max" CHECK ("promo_codes"."redemptions" >= 0 AND ("promo_codes"."max_redemptions" IS NULL OR "promo_codes"."redemptions" <= "promo_codes"."max_redemptions"))
);
--> statement-breakpoint
ALTER TABLE "booking_attendees" ADD CONSTRAINT "booking_attendees_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_lines" ADD CONSTRAINT "booking_lines_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_lines" ADD CONSTRAINT "booking_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_lines" ADD CONSTRAINT "booking_lines_attendee_id_booking_attendees_id_fk" FOREIGN KEY ("attendee_id") REFERENCES "public"."booking_attendees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_lines" ADD CONSTRAINT "booking_lines_event_day_id_event_days_id_fk" FOREIGN KEY ("event_day_id") REFERENCES "public"."event_days"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_promo_code_id_promo_codes_id_fk" FOREIGN KEY ("promo_code_id") REFERENCES "public"."promo_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_days" ADD CONSTRAINT "event_days_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_holds" ADD CONSTRAINT "inventory_holds_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_holds" ADD CONSTRAINT "inventory_holds_pool_id_inventory_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."inventory_pools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_pools" ADD CONSTRAINT "inventory_pools_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_pools" ADD CONSTRAINT "inventory_pools_event_day_id_event_days_id_fk" FOREIGN KEY ("event_day_id") REFERENCES "public"."event_days"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bookings_status_hold_expires_idx" ON "bookings" USING btree ("status","hold_expires_at");--> statement-breakpoint
CREATE INDEX "idempotency_keys_created_idx" ON "idempotency_keys" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "inventory_holds_active_expires_idx" ON "inventory_holds" USING btree ("expires_at") WHERE "inventory_holds"."released_at" IS NULL;--> statement-breakpoint
CREATE INDEX "outbox_unprocessed_idx" ON "outbox" USING btree ("created_at") WHERE "outbox"."processed_at" IS NULL;