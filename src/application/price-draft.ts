import type { BookingDraft } from "@/domain/booking";
import { validateBooking, type ValidatedBooking } from "@/domain/eligibility";
import type { DomainIssue } from "@/domain/errors";
import {
  findShortage,
  stockDemand,
  type StockDemand,
  type StockShortage,
} from "@/domain/inventory";
import { priceBooking } from "@/domain/pricing/pipeline";
import type { Quote } from "@/domain/pricing/types";
import { evaluatePromo, normalizePromoCode, type PromoEvaluation } from "@/domain/promo";
import type { SaleClock } from "@/domain/sales-window";
import type { Dependencies, EventCatalog, PromoRecord } from "./ports";

export interface PricedDraft {
  booking: ValidatedBooking;
  quote: Quote;
  demand: StockDemand[];
  // Set only when the promo actually changed the price, so only then is a use reserved.
  appliedPromo: PromoRecord | null;
}

export type PriceDraftResult =
  | { ok: true; value: PricedDraft }
  | { ok: false; kind: "validation"; issues: DomainIssue[] }
  | { ok: false; kind: "stock"; shortage: StockShortage };

// Shared by quote and create, so both always compute the same price from the
// server's own data. `promoOverride` lets create re-price when a promo ran out.
export async function priceDraft(
  deps: Pick<Dependencies, "promos">,
  draft: BookingDraft,
  { event, catalog }: EventCatalog,
  clock: SaleClock,
  promoOverride?: PromoEvaluation,
): Promise<PriceDraftResult> {
  const validated = validateBooking(draft, catalog, clock);
  if (!validated.ok) return { ok: false, kind: "validation", issues: validated.issues };

  const code = normalizePromoCode(draft.promoCode ?? "");
  const promoRow = code === "" ? null : await deps.promos.findByCode(event.id, code);
  const promo = promoOverride ?? evaluatePromo(draft.promoCode, promoRow, clock.today);
  const quote = priceBooking({ booking: validated.value, catalog, clock, promo });

  const demand = stockDemand(quote.lines);
  const shortage = findShortage(demand, catalog);
  if (shortage) return { ok: false, kind: "stock", shortage };

  return {
    ok: true,
    value: {
      booking: validated.value,
      quote,
      demand,
      appliedPromo: quote.promo.status === "applied" ? promoRow : null,
    },
  };
}
