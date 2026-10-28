import { newLine } from "../lines";
import type { PricedLine, PricingStep } from "../types";

// Step 1: one line per person per day for day passes (stock is person-days, D8),
// one line per all-day pass, and one line per family pass (one day each, D20).
export const resolveEntries: PricingStep = (state) => {
  const lines: PricedLine[] = [];

  for (const attendee of state.booking.attendees) {
    const { entry, clientId } = attendee;
    if (entry.kind === "day_pass") {
      for (const date of entry.dates) {
        lines.push(newLine(entry.product, { attendeeClientId: clientId, date }));
      }
    } else if (entry.kind === "all_days") {
      lines.push(newLine(entry.product, { attendeeClientId: clientId }));
    }
  }

  for (const group of state.booking.familyGroups) {
    lines.push(newLine(group.product, { familyGroupId: group.id, date: group.date }));
  }

  return { ...state, lines: [...state.lines, ...lines] };
};
