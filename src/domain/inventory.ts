import type { IsoDate } from "./calendar";
import type { Catalog, ProductId } from "./catalog";
import type { QuoteLine } from "./pricing/types";

// How much stock a quote needs, per product and day (S1). Day passes and dinner
// are person-days; everything else is units. `date` lets a per-day pool
// (e.g. "Nov 14 capped at 200 adults") take precedence over the shared pool.
export interface StockDemand {
  productId: ProductId;
  productCode: string;
  date: IsoDate | null;
  qty: number;
}

// Not enough left (S2): the whole booking is rejected, naming the item.
export interface StockShortage {
  code: "SOLD_OUT" | "INSUFFICIENT_STOCK";
  productCode: string;
  date: IsoDate | null;
  remaining: number;
}

export function stockDemand(lines: readonly QuoteLine[]): StockDemand[] {
  const byKey = new Map<string, StockDemand>();
  for (const line of lines) {
    const key = `${line.productId}|${line.date ?? ""}`;
    const existing = byKey.get(key);
    if (existing) existing.qty += line.qty;
    else {
      byKey.set(key, {
        productId: line.productId,
        productCode: line.productCode,
        date: line.date,
        qty: line.qty,
      });
    }
  }
  return [...byKey.values()];
}

// Advisory check against the catalog snapshot, so a sold-out item fails fast.
// The real guarantee is the atomic conditional UPDATE when the booking is created.
export function findShortage(
  demands: readonly StockDemand[],
  catalog: Catalog,
): StockShortage | null {
  const totals = new Map<ProductId, { code: string; qty: number }>();
  for (const demand of demands) {
    const total = totals.get(demand.productId) ?? { code: demand.productCode, qty: 0 };
    total.qty += demand.qty;
    totals.set(demand.productId, total);
  }

  for (const [productId, { code, qty }] of totals) {
    const remaining = catalog.products.find((p) => p.id === productId)?.remaining ?? 0;
    if (qty <= remaining) continue;
    return {
      code: remaining <= 0 ? "SOLD_OUT" : "INSUFFICIENT_STOCK",
      productCode: code,
      date: null,
      remaining: Math.max(remaining, 0),
    };
  }
  return null;
}
