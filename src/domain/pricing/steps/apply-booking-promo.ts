import { allocate, minCents, percentOf, sumCents, toCents, type Cents } from "../../money";
import type { Promo } from "../../promo";
import { netCents, withExtraDiscount } from "../lines";
import type { PricingStep } from "../types";

// Steps 5–6 (booking-level promos): SEVA10 / FLAT20 on what is left after
// line-level promos, capped so the total never goes below $0 (D10). The discount
// is rounded once, then split across lines by largest remainder so every line's
// share is known (for refunds later) and the lines add up exactly.
export const applyBookingPromo: PricingStep = (state) => {
  const { promo } = state;
  if (promo.status !== "valid") return state;
  const { kind, code } = promo.promo;
  if (kind !== "percent" && kind !== "fixed") return state;

  const weights = state.lines.map(netCents);
  const base = sumCents(weights);
  if (base === 0) {
    return {
      ...state,
      promoOutcome: { status: "not_applicable", code, reason: "nothing_to_discount" },
    };
  }

  const discount = bookingDiscount(promo.promo, base);
  const shares = allocate(discount, weights);
  const lines = state.lines.map((line, i) => withExtraDiscount(line, shares[i] ?? toCents(0)));
  return {
    ...state,
    lines,
    promoOutcome: { status: "applied", code, kind, discountCents: discount },
  };
};

function bookingDiscount(promo: Promo, base: Cents): Cents {
  return promo.kind === "percent"
    ? percentOf(base, promo.value)
    : minCents(toCents(promo.value), base);
}
