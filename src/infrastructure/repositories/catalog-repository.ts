import { and, asc, eq, inArray, max, min, sql } from "drizzle-orm";
import type { CatalogRepository } from "@/application/ports";
import { toIsoDate } from "@/domain/calendar";
import { productRuleSchema, toProductId, type Product } from "@/domain/catalog";
import { toCents } from "@/domain/money";
import type { Db } from "../db/client";
import { eventDays, events, inventoryPools, products } from "../db/schema";

const toEventInfo = (event: typeof events.$inferSelect) => ({
  id: event.id,
  slug: event.slug,
  name: event.name,
  venue: event.venue,
  tagline: event.tagline,
  timezone: event.timezone,
  currency: event.currency,
});

export function catalogRepository(db: Db): CatalogRepository {
  return {
    async listEvents() {
      const lowestPrice = db
        .select({ eventId: products.eventId, cents: min(products.priceCents).as("cents") })
        .from(products)
        .where(and(eq(products.active, true), eq(products.category, "entry")))
        .groupBy(products.eventId)
        .as("lowest_price");
      const rows = await db
        .select({
          event: events,
          firstDay: min(eventDays.date),
          lastDay: max(eventDays.date),
          lowestEntryPriceCents: sql<number | null>`max(${lowestPrice.cents})`,
        })
        .from(events)
        .innerJoin(eventDays, eq(eventDays.eventId, events.id))
        .leftJoin(lowestPrice, eq(lowestPrice.eventId, events.id))
        .groupBy(events.id)
        .orderBy(asc(min(eventDays.date)));
      return rows.flatMap((row) =>
        row.firstDay && row.lastDay
          ? [
              {
                ...toEventInfo(row.event),
                firstDay: toIsoDate(row.firstDay),
                lastDay: toIsoDate(row.lastDay),
                lowestEntryPriceCents:
                  row.lowestEntryPriceCents === null ? null : Number(row.lowestEntryPriceCents),
              },
            ]
          : [],
      );
    },

    async findBySlug(slug) {
      const [event] = await db.select().from(events).where(eq(events.slug, slug)).limit(1);
      if (!event) return null;

      const [days, productRows] = await Promise.all([
        db
          .select()
          .from(eventDays)
          .where(eq(eventDays.eventId, event.id))
          .orderBy(asc(eventDays.date)),
        db
          .select()
          .from(products)
          .where(eq(products.eventId, event.id))
          .orderBy(asc(products.code)),
      ]);
      const pools =
        productRows.length === 0
          ? []
          : await db
              .select()
              .from(inventoryPools)
              .where(
                inArray(
                  inventoryPools.productId,
                  productRows.map((p) => p.id),
                ),
              );

      return {
        event: toEventInfo(event),
        catalog: {
          eventSlug: event.slug,
          timezone: event.timezone,
          days: days.map((day) => ({
            date: toIsoDate(day.date),
            cutoffTime: day.sameDayCutoffTime,
          })),
          products: productRows.map((row): Product => {
            const own = pools.filter((pool) => pool.productId === row.id);
            const shared = own.find((pool) => pool.eventDayId === null);
            return {
              id: toProductId(row.id),
              code: row.code,
              displayName: row.displayName,
              category: row.category,
              priceCents: toCents(row.priceCents),
              pricing: row.pricing,
              // jsonb is parsed, never cast: a bad rule fails loudly here.
              rule: productRuleSchema.parse(row.rule),
              active: row.active,
              // The shared pool when there is one; otherwise the sum of per-day pools.
              remaining: shared
                ? shared.remaining
                : own.reduce((sum, pool) => sum + pool.remaining, 0),
            };
          }),
        },
      };
    },
  };
}
