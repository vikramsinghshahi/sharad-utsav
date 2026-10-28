import type { Catalog } from "../catalog";
import type { ValidatedBooking } from "../eligibility";
import { subtractCents, sumCents } from "../money";
import type { PromoEvaluation } from "../promo";
import type { SaleClock } from "../sales-window";
import { grossCents, netCents } from "./lines";
import { applyBookingPromo } from "./steps/apply-booking-promo";
import { applyChildEntryPromo } from "./steps/apply-child-entry-promo";
import { resolveEntries } from "./steps/resolve-entries";
import { resolveExtras } from "./steps/resolve-extras";
import { suggestAllDaysPass } from "./steps/suggest-all-days-pass";
import { suggestSeparateDayPasses } from "./steps/suggest-separate-day-passes";
import type { PricingState, PricingStep, PromoOutcome, Quote } from "./types";

// The single place money is calculated (SPEC §5.6). Order matters: lines first,
// then line-level promos, then booking-level promos, then hints on final prices.
// A new rule is a new step file added here (or, later, enabled per event, §12.2).
export const DEFAULT_PRICING_STEPS: readonly PricingStep[] = [
  resolveEntries,
  resolveExtras,
  applyChildEntryPromo,
  applyBookingPromo,
  suggestAllDaysPass,
  suggestSeparateDayPasses,
];

export interface PricingInput {
  booking: ValidatedBooking;
  catalog: Catalog;
  clock: SaleClock;
  promo: PromoEvaluation;
}

export function priceBooking(
  input: PricingInput,
  steps: readonly PricingStep[] = DEFAULT_PRICING_STEPS,
): Quote {
  const initial: PricingState = {
    ...input,
    lines: [],
    promoOutcome: null,
    suggestions: [],
    warnings: input.booking.warnings,
  };
  return toQuote(steps.reduce((state, step) => step(state), initial));
}

function toQuote(state: PricingState): Quote {
  const subtotalCents = sumCents(state.lines.map(grossCents));
  const discountCents = sumCents(state.lines.map((line) => line.discountCents));
  return {
    lines: state.lines.map((line) => ({
      productId: line.product.id,
      productCode: line.product.code,
      category: line.product.category,
      attendeeClientId: line.attendeeClientId,
      familyGroupId: line.familyGroupId,
      date: line.date,
      qty: line.qty,
      unitPriceCents: line.unitPriceCents,
      discountCents: line.discountCents,
      lineTotalCents: netCents(line),
    })),
    subtotalCents,
    discountCents,
    // Throws if a step ever pushed the total below zero: that is a bug, never a price.
    totalCents: subtractCents(subtotalCents, discountCents),
    promo: resolvePromoOutcome(state),
    suggestions: [...state.suggestions],
    warnings: [...state.warnings],
  };
}

// A valid code that no step used (e.g. a kind with no step yet) is reported, not hidden.
function resolvePromoOutcome(state: PricingState): PromoOutcome {
  if (state.promoOutcome) return state.promoOutcome;
  if (state.promo.status === "valid") {
    return {
      status: "not_applicable",
      code: state.promo.promo.code,
      reason: "nothing_to_discount",
    };
  }
  return state.promo;
}
