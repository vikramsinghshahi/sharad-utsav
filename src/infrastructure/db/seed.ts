import { eq, sql } from "drizzle-orm";
import { productRuleSchema } from "@/domain/catalog";
import type { Db } from "./client";
import { eventDays, events, inventoryPools, organizations, products, promoCodes } from "./schema";
import { EVENT, FESTIVAL_DATES, ORG_NAME, PRODUCTS, PROMOS, SAME_DAY_CUTOFF } from "./seed-data";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// Idempotent: re-running updates catalog fields but never resets remaining stock
// or promo redemption counts, so it is safe against a live database.
export async function seed(db: Db): Promise<void> {
  // Fail before touching the database if any rule doesn't match the domain schema.
  for (const product of PRODUCTS) productRuleSchema.parse(product.rule);

  await db.transaction(async (tx) => {
    const orgId = await upsertOrganization(tx);
    const eventId = await upsertEvent(tx, orgId);
    await upsertEventDays(tx, eventId);
    await upsertProductsAndPools(tx, eventId);
    await insertMissingPromos(tx, eventId);
  });
}

async function upsertOrganization(tx: Tx): Promise<string> {
  const [existing] = await tx
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.name, ORG_NAME))
    .limit(1);
  if (existing) return existing.id;

  const [created] = await tx
    .insert(organizations)
    .values({ name: ORG_NAME })
    .returning({ id: organizations.id });
  if (!created) throw new Error("Failed to create organization");
  return created.id;
}

async function upsertEvent(tx: Tx, orgId: string): Promise<string> {
  const [event] = await tx
    .insert(events)
    .values({ ...EVENT, orgId })
    .onConflictDoUpdate({
      target: events.slug,
      set: { name: EVENT.name, timezone: EVENT.timezone, currency: EVENT.currency },
    })
    .returning({ id: events.id });
  if (!event) throw new Error("Failed to upsert event");
  return event.id;
}

async function upsertEventDays(tx: Tx, eventId: string): Promise<void> {
  await tx
    .insert(eventDays)
    .values(FESTIVAL_DATES.map((date) => ({ eventId, date, sameDayCutoffTime: SAME_DAY_CUTOFF })))
    .onConflictDoUpdate({
      target: [eventDays.eventId, eventDays.date],
      set: { sameDayCutoffTime: sql`excluded.same_day_cutoff_time` },
    });
}

async function upsertProductsAndPools(tx: Tx, eventId: string): Promise<void> {
  for (const { stock, ...product } of PRODUCTS) {
    const [row] = await tx
      .insert(products)
      .values({ ...product, eventId })
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
}

// Existing promos are left alone so redemption counts survive.
async function insertMissingPromos(tx: Tx, eventId: string): Promise<void> {
  await tx
    .insert(promoCodes)
    .values(PROMOS.map((promo) => ({ ...promo, eventId })))
    .onConflictDoNothing({ target: [promoCodes.eventId, promoCodes.code] });
}
