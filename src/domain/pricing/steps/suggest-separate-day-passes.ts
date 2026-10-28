import { findIndividualPass } from "../../catalog";
import { addCents, multiplyCents, subtractCents, ZERO_CENTS } from "../../money";
import { unitPriceAfterLinePromos } from "../lines";
import type { PricingStep, Suggestion } from "../types";

// D3: a family pass for fewer than 2+2 (e.g. 2 adults + 1 child = $38 on day
// passes vs $40) gets a hint. Never switched silently.
export const suggestSeparateDayPasses: PricingStep = (state) => {
  const { catalog, promo } = state;
  const bandOf = new Map(state.booking.attendees.map((a) => [a.clientId, a.ageBand]));
  const adultDay = findIndividualPass(catalog, "chosen_days", "adult");
  const childDay = findIndividualPass(catalog, "chosen_days", "child");
  const suggestions: Suggestion[] = [];

  for (const group of state.booking.familyGroups) {
    const bands = group.memberClientIds.map((id) => bandOf.get(id));
    const adults = bands.filter((band) => band === "adult").length;
    const children = bands.filter((band) => band === "child").length;
    if (!adultDay || adultDay.remaining < adults) continue;
    if (children > 0 && (!childDay || childDay.remaining < children)) continue;

    const separate = addCents(
      multiplyCents(unitPriceAfterLinePromos(adultDay, promo), adults),
      childDay ? multiplyCents(unitPriceAfterLinePromos(childDay, promo), children) : ZERO_CENTS,
    );
    const family = unitPriceAfterLinePromos(group.product, promo);
    if (separate < family) {
      suggestions.push({
        code: "USE_SEPARATE_DAY_PASSES",
        familyGroupId: group.id,
        savingsCents: subtractCents(family, separate),
      });
    }
  }

  return { ...state, suggestions: [...state.suggestions, ...suggestions] };
};
