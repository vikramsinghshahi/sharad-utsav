import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { AGE_BANDS } from "@/domain/age";
import { BOOKING_STATUSES, ENTRY_KINDS } from "@/domain/booking";
import { PRODUCT_CATEGORIES, PRODUCT_PRICINGS, type ProductRule } from "@/domain/catalog";
import { PROMO_KINDS } from "@/domain/promo";

// Case-insensitive text (requires the citext extension; see the first migration).
const citext = customType<{ data: string }>({ dataType: () => "citext" });

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// ---------- enums (values owned by the domain; changing one needs a migration) ----------

export const productCategory = pgEnum("product_category", PRODUCT_CATEGORIES);
export const productPricing = pgEnum("product_pricing", PRODUCT_PRICINGS);
export const promoKind = pgEnum("promo_kind", PROMO_KINDS);
export const bookingStatus = pgEnum("booking_status", BOOKING_STATUSES);
export const ageBand = pgEnum("age_band", AGE_BANDS);
export const entryKind = pgEnum("entry_kind", ENTRY_KINDS);
export const paymentProvider = pgEnum("payment_provider", ["simulated", "stripe"]);
export const paymentStatus = pgEnum("payment_status", ["pending", "succeeded", "declined"]);

// ---------- catalog ----------

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  // Shown on the landing page and tickets, so nothing about the event is hard-coded in the UI.
  venue: text("venue"),
  tagline: text("tagline"),
  timezone: text("timezone").notNull(),
  currency: text("currency").notNull(),
  salesOpenAt: timestamp("sales_open_at", { withTimezone: true }),
  salesCloseAt: timestamp("sales_close_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const eventDays = pgTable(
  "event_days",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id),
    date: date("date").notNull(),
    // Local time (event timezone) after which the day can no longer be booked (D9).
    sameDayCutoffTime: time("same_day_cutoff_time").notNull(),
  },
  (t) => [unique("event_days_event_date_uq").on(t.eventId, t.date)],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id),
    code: text("code").notNull(),
    displayName: text("display_name").notNull(),
    category: productCategory("category").notNull(),
    priceCents: integer("price_cents").notNull(),
    pricing: productPricing("pricing").notNull(),
    // Validate with productRuleSchema when reading; never trust the stored JSON blindly.
    rule: jsonb("rule").$type<ProductRule>().notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    unique("products_event_code_uq").on(t.eventId, t.code),
    check("products_price_nonnegative", sql`${t.priceCents} >= 0`),
  ],
);

// ---------- inventory ----------

export const inventoryPools = pgTable(
  "inventory_pools",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    // NULL = one pool shared across all days.
    eventDayId: uuid("event_day_id").references(() => eventDays.id),
    capacity: integer("capacity").notNull(),
    remaining: integer("remaining").notNull(),
  },
  (t) => [
    unique("inventory_pools_product_day_uq").on(t.productId, t.eventDayId).nullsNotDistinct(),
    // Last line of defence against overselling.
    check("inventory_pools_remaining_nonnegative", sql`${t.remaining} >= 0`),
    check("inventory_pools_remaining_le_capacity", sql`${t.remaining} <= ${t.capacity}`),
  ],
);

// ---------- promos ----------

export const promoCodes = pgTable(
  "promo_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id),
    code: citext("code").notNull(),
    kind: promoKind("kind").notNull(),
    // percent: whole percent (10 = 10%); fixed: cents; free_child_entry: unused (0)
    value: integer("value").notNull(),
    appliesTo: jsonb("applies_to"),
    // Inclusive dates, interpreted in the event timezone (D21).
    validFrom: date("valid_from"),
    validTo: date("valid_to"),
    maxRedemptions: integer("max_redemptions"),
    redemptions: integer("redemptions").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    unique("promo_codes_event_code_uq").on(t.eventId, t.code),
    check("promo_codes_value_nonnegative", sql`${t.value} >= 0`),
    check(
      "promo_codes_redemptions_within_max",
      sql`${t.redemptions} >= 0 AND (${t.maxRedemptions} IS NULL OR ${t.redemptions} <= ${t.maxRedemptions})`,
    ),
  ],
);

// ---------- bookings ----------

export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id),
    status: bookingStatus("status").notNull(),
    bookerFirstName: text("booker_first_name").notNull(),
    bookerLastName: text("booker_last_name").notNull(),
    bookerEmail: text("booker_email").notNull(),
    bookerPhone: text("booker_phone").notNull(),
    bookerDateOfBirth: date("booker_date_of_birth").notNull(),
    bookerIsAttending: boolean("booker_is_attending").notNull(),
    subtotalCents: integer("subtotal_cents").notNull(),
    discountCents: integer("discount_cents").notNull(),
    totalCents: integer("total_cents").notNull(),
    promoCodeId: uuid("promo_code_id").references(() => promoCodes.id),
    confirmationCode: text("confirmation_code").unique(),
    // Hash of the confirmation-link secret; the raw token is never stored.
    accessTokenHash: text("access_token_hash").notNull(),
    holdExpiresAt: timestamp("hold_expires_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("bookings_status_hold_expires_idx").on(t.status, t.holdExpiresAt),
    check(
      "bookings_amounts_valid",
      sql`${t.subtotalCents} >= 0 AND ${t.discountCents} >= 0 AND ${t.totalCents} = ${t.subtotalCents} - ${t.discountCents} AND ${t.totalCents} >= 0`,
    ),
  ],
);

export const bookingAttendees = pgTable("booking_attendees", {
  id: uuid("id").primaryKey().defaultRandom(),
  bookingId: uuid("booking_id")
    .notNull()
    .references(() => bookings.id),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  dateOfBirth: date("date_of_birth").notNull(),
  ageBand: ageBand("age_band").notNull(),
  entryKind: entryKind("entry_kind").notNull(),
  // Optional for adults only (SPEC §4).
  email: text("email"),
  phone: text("phone"),
});

// One family pass for one day (D20), and who it covers.
export const bookingFamilyGroups = pgTable("booking_family_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  bookingId: uuid("booking_id")
    .notNull()
    .references(() => bookings.id),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id),
  eventDayId: uuid("event_day_id")
    .notNull()
    .references(() => eventDays.id),
});

export const bookingFamilyGroupMembers = pgTable(
  "booking_family_group_members",
  {
    familyGroupId: uuid("family_group_id")
      .notNull()
      .references(() => bookingFamilyGroups.id),
    attendeeId: uuid("attendee_id")
      .notNull()
      .references(() => bookingAttendees.id),
  },
  (t) => [primaryKey({ columns: [t.familyGroupId, t.attendeeId] })],
);

// Price snapshot: later catalog changes never rewrite a booking's history.
export const bookingLines = pgTable(
  "booking_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    attendeeId: uuid("attendee_id").references(() => bookingAttendees.id),
    familyGroupId: uuid("family_group_id").references(() => bookingFamilyGroups.id),
    eventDayId: uuid("event_day_id").references(() => eventDays.id),
    qty: integer("qty").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    discountCents: integer("discount_cents").notNull().default(0),
    lineTotalCents: integer("line_total_cents").notNull(),
  },
  (t) => [
    check(
      "booking_lines_amounts_valid",
      sql`${t.qty} > 0 AND ${t.unitPriceCents} >= 0 AND ${t.discountCents} >= 0 AND ${t.lineTotalCents} = ${t.qty} * ${t.unitPriceCents} - ${t.discountCents} AND ${t.lineTotalCents} >= 0`,
    ),
  ],
);

export const inventoryHolds = pgTable(
  "inventory_holds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id),
    poolId: uuid("pool_id")
      .notNull()
      .references(() => inventoryPools.id),
    qty: integer("qty").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    // Stock went back to the pool (booking expired).
    releasedAt: timestamp("released_at", { withTimezone: true }),
    // Stock was kept for good (booking paid). A hold ends in exactly one of the two.
    committedAt: timestamp("committed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("inventory_holds_active_expires_idx")
      .on(t.expiresAt)
      .where(sql`${t.releasedAt} IS NULL AND ${t.committedAt} IS NULL`),
    check(
      "inventory_holds_single_outcome",
      sql`${t.releasedAt} IS NULL OR ${t.committedAt} IS NULL`,
    ),
    check("inventory_holds_qty_positive", sql`${t.qty} > 0`),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id),
    provider: paymentProvider("provider").notNull(),
    providerRef: text("provider_ref"),
    amountCents: integer("amount_cents").notNull(),
    status: paymentStatus("status").notNull(),
    createdAt: createdAt(),
  },
  (t) => [check("payments_amount_nonnegative", sql`${t.amountCents} >= 0`)],
);

// ---------- infrastructure ----------

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    key: text("key").notNull(),
    // Which endpoint the key was used on, so the same UUID can't collide across routes.
    scope: text("scope").notNull(),
    requestHash: text("request_hash").notNull(),
    // NULL while the first request is still running; a concurrent retry sees
    // the row and waits instead of creating a second booking.
    responseStatus: integer("response_status"),
    responseJson: jsonb("response_json"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.scope, t.key] }),
    index("idempotency_keys_created_idx").on(t.createdAt),
  ],
);

export const outbox = pgTable(
  "outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("outbox_unprocessed_idx")
      .on(t.createdAt)
      .where(sql`${t.processedAt} IS NULL`),
  ],
);
