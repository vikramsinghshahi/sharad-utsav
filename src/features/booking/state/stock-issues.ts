import { fieldIds, STEP_HEADING_ID } from "./field-targets";
import { attendeeName, firstNameOf, shortProducts, type CatalogProduct } from "./selectors";
import type { StepIssue } from "./step-checks";
import type { Action, BookingState } from "./types";

// A 409 SOLD_OUT / INSUFFICIENT_STOCK names no product (its path is empty), so the
// draft is compared with fresh stock to say what ran out, where to change it, and,
// when there is an obvious change, offer it as one click. Used for quotes and creates.

type Source = Pick<BookingState, "attendees" | "familyGroups" | "attendeeExtras" | "bookingExtras">;

export function stockIssues(
  state: Source,
  catalog: { products: CatalogProduct[] },
  fallbackMessage: string,
): StepIssue[] {
  const short = shortProducts(state, catalog);
  if (short.length === 0) {
    // Stock may have come back, or the catalog is still reloading: say what the server said.
    return [
      { step: "review", fieldId: STEP_HEADING_ID, message: fallbackMessage, persistent: true },
    ];
  }
  return short.map(({ product, wanted }) => issueFor(state, product, wanted));
}

const places = (n: number) => `${n} ${n === 1 ? "place" : "places"}`;

function issueFor(state: Source, product: CatalogProduct, wanted: number): StepIssue {
  const name = product.displayName;
  const left = product.soldOut ? 0 : product.remaining;

  if (product.rule.type === "pass") {
    const holder = state.attendees.find(
      (a) =>
        (a.entry.kind === "day_pass" || a.entry.kind === "all_days") &&
        a.entry.productId === product.id,
    );
    const group = state.familyGroups.find((g) => g.productId === product.id);
    return {
      step: "passes",
      fieldId: holder
        ? fieldIds.entry(holder.clientId)
        : group
          ? fieldIds.familyGroup(group.id)
          : STEP_HEADING_ID,
      message:
        left === 0
          ? `The ${name} has sold out. Please choose a different ticket${holder ? ` for ${firstNameOf(holder)}` : ""}.`
          : `Only ${left} ${name} left, and this booking needs ${wanted}. Please change some tickets.`,
      persistent: true,
    };
  }

  if (product.rule.scope === "per_booking") {
    const fix: StepIssue["fix"] = {
      label: left === 0 ? `Remove ${name}` : `Reduce ${name} to ${left}`,
      actions: [{ type: "SET_EXTRA_QUANTITY", productId: product.id, quantity: left }],
    };
    return {
      step: "extras",
      fieldId: fieldIds.bookingExtra(product.id),
      message:
        left === 0
          ? `${name} are sold out.`
          : `Only ${left} ${name} left — you've chosen ${wanted}.`,
      persistent: true,
      fix,
    };
  }

  const rows = state.attendeeExtras.filter((e) => e.productId === product.id && e.dates.length > 0);
  const first = rows[0];
  const people = rows.flatMap((r) => {
    const a = state.attendees.find((x) => x.clientId === r.attendeeClientId);
    return a ? [a] : [];
  });
  const removeAll: Action[] = rows.flatMap((r) =>
    r.dates.map((date): Action => ({
      type: "TOGGLE_EXTRA_DAY",
      productId: product.id,
      clientId: r.attendeeClientId,
      date,
    })),
  );
  const only = people.length === 1 ? people[0] : undefined;
  return {
    step: "extras",
    fieldId: first ? fieldIds.attendeeExtra(product.id, first.attendeeClientId) : STEP_HEADING_ID,
    message:
      left === 0
        ? `The ${name} is now full — 0 places left.`
        : `The ${name} has only ${places(left)} left — this booking has ${wanted}. Please untick ${wanted - left}.`,
    persistent: true,
    ...(left === 0 && removeAll.length > 0
      ? {
          fix: {
            label: only
              ? `Remove ${name} for ${attendeeName(only)}`
              : `Remove ${name} from this booking`,
            actions: removeAll,
          },
        }
      : {}),
  };
}
