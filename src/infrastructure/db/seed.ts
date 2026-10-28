import { eq, sql } from "drizzle-orm";
import { productRuleSchema, type ProductRule } from "@/domain/catalog";
import type { Db } from "./client";
import { eventDays, events, inventoryPools, organizations, products, promoCodes } from "./schema";

// Sharad Utsav 2026 seed data (SPEC §3.3, §5.5).
// Idempotent: re-running updates catalog fields but never resets remaining stock
// or promo redemption counts, so it is safe against a live database.

const ORG_NAME = "Radha Krishna Temple, Allen";

const EVENT = {
  slug: "sharad-utsav-2026",
  name: "Sharad Utsav 2026",
  timezone: "America/Chicago",
  currency: "USD",
} as const;

const FESTIVAL_DATES = ["2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14"];
const SAME_DAY_CUTOFF = "18:00:00"; // D9

interface ProductSeed {
  code: string;
  displayName: string;
  category: "entry" | "extra";
  priceCents: number;
  pricing: "per_person_per_day" | "flat" | "per_unit";
  rule: ProductRule;
  stock: number;
}

const PRODUCTS: ProductSeed[] = [
  {
    code: "DAY_ADULT",
    displayName: "Day Pass – Adult",
    category: "entry",
    priceCents: 1500,
    pricing: "per_person_per_day",
    rule: { type: "pass", dayScope: "chosen_days", eligibleAgeBand: "adult" },
    stock: 380,
  },
  {
    code: "DAY_CHILD",
    displayName: "Day Pass – Child",
    category: "entry",
    priceCents: 800,
    pricing: "per_person_per_day",
    rule: { type: "pass", dayScope: "chosen_days", eligibleAgeBand: "child" },
    stock: 260,
  },
  {
    code: "ALLDAY_ADULT",
    displayName: "All-Day Pass – Adult",
    category: "entry",
    priceCents: 6000,
    pricing: "flat",
    rule: { type: "pass", dayScope: "all_days", eligibleAgeBand: "adult" },
    stock: 0,
  },
  {
    code: "ALLDAY_CHILD",
    displayName: "All-Day Pass – Child",
    category: "entry",
    priceCents: 3000,
    pricing: "flat",
    rule: { type: "pass", dayScope: "all_days", eligibleAgeBand: "child" },
    stock: 140,
  },
  {
    code: "FAMILY",
    displayName: "Family Pass",
    category: "entry",
    priceCents: 4000,
    pricing: "flat",
    rule: { type: "pass", dayScope: "single_day", covers: { adult: 2, child: 2 } },
    stock: 95,
  },
  {
    code: "DANDIYA",
    displayName: "Dandiya Sticks (pair)",
    category: "extra",
    priceCents: 500,
    pricing: "per_unit",
    rule: { type: "extra", scope: "per_booking", requiresEntryOnDay: false, maxPerBooking: 20 },
    stock: 900,
  },
  {
    code: "DINNER",
    displayName: "Dinner Plate",
    category: "extra",
    priceCents: 1200,
    pricing: "per_person_per_day",
    rule: { type: "extra", scope: "per_attendee_per_day", requiresEntryOnDay: true },
    stock: 1700,
  },
  {
    code: "GARBA",
    displayName: "Garba Workshop",
    category: "extra",
    priceCents: 2000,
    pricing: "per_unit",
    rule: {
      type: "extra",
      scope: "per_attendee_per_session",
      availableDates: ["2026-11-11", "2026-11-13"],
      requiresEntryOnDay: true,
      minAgeBand: "child", // D14: not for under-5s
    },
    stock: 2,
  },
];

interface PromoSeed {
  code: string;
  kind: "percent" | "fixed" | "free_child_entry";
  value: number;
  validFrom: string | null;
  validTo: string | null;
  maxRedemptions: number | null;
  redemptions: number;
}

const PROMOS: PromoSeed[] = [
  { code: "SEVA10", kind: "percent", value: 10, validFrom: null, validTo: null, maxRedemptions: null, redemptions: 0 },
  { code: "FLAT20", kind: "fixed", value: 2000, validFrom: null, validTo: null, maxRedemptions: null, redemptions: 0 },
  { code: "KIDSFREE", kind: "free_child_entry", value: 0, validFrom: null, validTo: null, maxRedemptions: null, redemptions: 0 },
  // Brief: "a valid code that expired last month". Discount value is not given; 5% assumed from the name.
  { code: "EXPIRED5", kind: "percent", value: 5, validFrom: "2026-09-01", validTo: "2026-09-30", maxRedemptions: null, redemptions: 0 },
  // Brief: "already used its maximum number of times". Value and limit are not given; assumed.
  { code: "MAXEDOUT", kind: "percent", value: 10, validFrom: null, validTo: null, maxRedemptions: 50, redemptions: 50 },
];

export async function seed(db: Db): Promise<void> {
  // Fail before touching the database if any rule doesn't match the domain schema.
  for (const product of PRODUCTS) productRuleSchema.parse(product.rule);

  await db.transaction(async (tx) => {
    const existingOrg = await tx
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.name, ORG_NAME))
      .limit(1);
    const orgId =
      existingOrg[0]?.id ??
      (await tx.insert(organizations).values({ name: ORG_NAME }).returning({ id: organizations.id }))[0]
        ?.id;
    if (!orgId) throw new Error("Failed to create organization");

    const [event] = await tx
      .insert(events)
      .values({ ...EVENT, orgId })
      .onConflictDoUpdate({
        target: events.slug,
        set: { name: EVENT.name, timezone: EVENT.timezone, currency: EVENT.currency },
      })
      .returning({ id: events.id });
    if (!event) throw new Error("Failed to upsert event");

    await tx
      .insert(eventDays)
      .values(FESTIVAL_DATES.map((date) => ({ eventId: event.id, date, sameDayCutoffTime: SAME_DAY_CUTOFF })))
      .onConflictDoUpdate({
        target: [eventDays.eventId, eventDays.date],
        set: { sameDayCutoffTime: sql`excluded.same_day_cutoff_time` },
      });

    for (const { stock, ...product } of PRODUCTS) {
      const [row] = await tx
        .insert(products)
        .values({ ...product, eventId: event.id })
        .onConflictDoUpdate({
          target: [products.eventId, products.code],
          set: {
            displayName: product.displayName,
            category: product.category,
            priceCents: product.priceCents,
            pricing: product.pricing,
            rule: product.rule,
          },
        })
        .returning({ id: products.id });
      if (!row) throw new Error(`Failed to upsert product ${product.code}`);

      // One pool shared across days (D8, D13). Existing pools are left alone so sold stock survives.
      await tx
        .insert(inventoryPools)
        .values({ productId: row.id, eventDayId: null, capacity: stock, remaining: stock })
        .onConflictDoNothing({ target: [inventoryPools.productId, inventoryPools.eventDayId] });
    }

    // Existing promos are left alone so redemption counts survive.
    await tx
      .insert(promoCodes)
      .values(PROMOS.map((promo) => ({ ...promo, eventId: event.id })))
      .onConflictDoNothing({ target: [promoCodes.eventId, promoCodes.code] });
  });
}
