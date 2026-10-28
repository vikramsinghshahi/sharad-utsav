import { newLine } from "../lines";
import type { PricedLine, PricingStep } from "../types";

// Step 2: per-booking extras as one line with a quantity; per-person extras as
// one line per person per day (Dinner) or session (Garba).
export const resolveExtras: PricingStep = (state) => {
  const lines: PricedLine[] = state.booking.extras.flatMap((extra) =>
    extra.scope === "per_booking"
      ? [newLine(extra.product, { qty: extra.quantity })]
      : extra.dates.map((date) =>
          newLine(extra.product, { attendeeClientId: extra.attendeeClientId, date }),
        ),
  );
  return { ...state, lines: [...state.lines, ...lines] };
};
