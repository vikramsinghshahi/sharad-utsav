import { findIndividualPass } from "../../catalog";
import { multiplyCents, subtractCents } from "../../money";
import { isAllDaysOnSale } from "../../sales-window";
import { unitPriceAfterLinePromos } from "../lines";
import type { PricingStep, QuoteWarning, Suggestion } from "../types";

// D4: day passes that cost more than the all-day pass get a "save $X" hint.
// D2: if the all-day pass is sold out, say so when someone picks every day.
export const suggestAllDaysPass: PricingStep = (state) => {
  const { catalog, promo, clock } = state;
  const suggestions: Suggestion[] = [];
  const warnings: QuoteWarning[] = [];

  for (const attendee of state.booking.attendees) {
    const { entry } = attendee;
    if (entry.kind !== "day_pass") continue;
    const band = entry.product.rule.eligibleAgeBand;
    const allDays = band && findIndividualPass(catalog, "all_days", band);
    if (!allDays || !isAllDaysOnSale(catalog, clock)) continue;

    const current = multiplyCents(
      unitPriceAfterLinePromos(entry.product, promo),
      entry.dates.length,
    );
    const alternative = unitPriceAfterLinePromos(allDays, promo);

    if (allDays.remaining <= 0) {
      if (entry.dates.length === catalog.days.length) {
        warnings.push({
          code: "ALL_DAYS_SOLD_OUT",
          path: ["attendees", attendee.index, "entry"],
          params: {
            productCode: allDays.code,
            dayPassTotalCents: current,
            allDaysPriceCents: allDays.priceCents,
          },
        });
      }
      continue;
    }

    if (alternative < current) {
      suggestions.push({
        code: "SWITCH_TO_ALL_DAYS",
        attendeeClientId: attendee.clientId,
        fromProductId: entry.product.id,
        toProductId: allDays.id,
        savingsCents: subtractCents(current, alternative),
      });
    }
  }

  return {
    ...state,
    suggestions: [...state.suggestions, ...suggestions],
    warnings: [...state.warnings, ...warnings],
  };
};
