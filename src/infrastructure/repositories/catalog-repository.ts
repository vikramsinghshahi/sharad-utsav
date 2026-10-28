import { asc, eq, inArray } from "drizzle-orm";
import type { CatalogRepository } from "@/application/ports";
import { toIsoDate } from "@/domain/calendar";
import { productRuleSchema, toProductId, type Product } from "@/domain/catalog";
import { toCents } from "@/domain/money";
import type { Db } from "../db/client";
import { eventDays, events, inventoryPools, products } from "../db/schema";

export function catalogRepository(db: Db): CatalogRepository {
  return {
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
        event: {
          id: event.id,
          slug: event.slug,
          name: event.name,
          timezone: event.timezone,
          currency: event.currency,
        },
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
