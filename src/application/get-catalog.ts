import type { CatalogResponse } from "@/contracts/responses";
import { isAllDaysOnSale, isDayOnSale, saleClock } from "@/domain/sales-window";
import { publicEventInfo } from "./event-info";
import type { Dependencies } from "./ports";
import { failure, success, type UseCaseResult } from "./result";

export async function getCatalog(
  deps: Pick<Dependencies, "clock" | "catalogs" | "bookings">,
  slug: string,
): Promise<UseCaseResult<CatalogResponse>> {
  const now = deps.clock.now();
  // D16: lazy cleanup is the primary mechanism, so abandoned holds don't show as sold out.
  await deps.bookings.releaseExpiredHolds(now);

  const found = await deps.catalogs.findBySlug(slug);
  if (!found) return failure({ kind: "not_found", resource: "event" });

  const { event, catalog } = found;
  const clock = saleClock(event.timezone, now);
  return success({
    event: publicEventInfo(event),
    days: catalog.days.map((day) => ({ ...day, onSale: isDayOnSale(day, clock) })),
    allDaysOnSale: isAllDaysOnSale(catalog, clock),
    products: catalog.products
      .filter((product) => product.active)
      .map((product) => ({
        id: product.id,
        code: product.code,
        displayName: product.displayName,
        category: product.category,
        priceCents: product.priceCents,
        pricing: product.pricing,
        rule: product.rule,
        remaining: product.remaining,
        soldOut: product.remaining <= 0, // S4
      })),
  });
}
