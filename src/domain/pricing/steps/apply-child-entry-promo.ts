import { sumCents } from "../../money";
import { grossCents, isFreedByLinePromo, withExtraDiscount } from "../lines";
import type { PricingStep } from "../types";

// Step 4 (line-level promos): KIDSFREE makes child day / all-day pass lines $0.
// Adults, family passes and extras are unaffected (D11).
export const applyChildEntryPromo: PricingStep = (state) => {
  const { promo } = state;
  if (promo.status !== "valid" || promo.promo.kind !== "free_child_entry") return state;

  const freed = state.lines.filter((line) => isFreedByLinePromo(line.product, promo));
  if (freed.length === 0) {
    return {
      ...state,
      promoOutcome: {
        status: "not_applicable",
        code: promo.promo.code,
        reason: "no_child_tickets",
      },
    };
  }

  const lines = state.lines.map((line) =>
    isFreedByLinePromo(line.product, promo) ? withExtraDiscount(line, grossCents(line)) : line,
  );
  return {
    ...state,
    lines,
    promoOutcome: {
      status: "applied",
      code: promo.promo.code,
      kind: promo.promo.kind,
      discountCents: sumCents(freed.map(grossCents)),
    },
  };
};
