import type { Dispatch } from "react";
import { formatDay } from "../format";
import { fieldIds } from "../state/field-targets";
import {
  ageInfo,
  attendanceDates,
  attendeeName,
  bandAllows,
  selectedExtraUnits,
  type ExtraProductView,
} from "../state/selectors";
import type { Action, BookingState } from "../state/types";
import { DayPicker } from "./day-picker";
import { errorIdFor, FieldError } from "./field-error";
import { priceLabel } from "./price-label";
import { useEvent } from "./event-context";
import { BAND_RANGE } from "./age-labels";

const LOW_STOCK = 10;

interface Props {
  product: ExtraProductView;
  state: BookingState;
  dispatch: Dispatch<Action>;
  errorsFor: (fieldId: string) => readonly string[];
}

// A per-person extra (Dinner, Garba): each person can pick only the days they
// attend (X1) on which it runs (X2), and only if it suits their age (D14).
export function ExtraSection({ product, state, dispatch, errorsFor }: Props) {
  const { currency } = useEvent();
  const festival = state.festival;
  if (!festival) return null;
  const { rule } = product;
  const runsOn = rule.availableDates ?? festival.days;
  const chosen = selectedExtraUnits(state, product.id);
  const left = product.remaining - chosen;
  const titleId = `extra-title-${product.id}`;

  const stock = product.soldOut
    ? "Sold out"
    : product.remaining <= LOW_STOCK
      ? `${product.remaining} ${product.remaining === 1 ? "place" : "places"} left${chosen > 0 ? ` · you've picked ${chosen}` : ""}`
      : null;

  return (
    <section
      aria-labelledby={titleId}
      className="rounded-2xl border border-line bg-surface p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={titleId} className="font-serif text-2xl font-semibold">
          {product.displayName}
        </h3>
        <p className="text-sm tabular-nums text-bright-gold">
          {priceLabel(product, currency)}
          {stock && <span className="ml-2 text-white/85">· {stock}</span>}
        </p>
      </div>
      {rule.availableDates && (
        <p className="mt-1 text-sm text-white/80">
          Only on {rule.availableDates.map(formatDay).join(" and ")}.
          {rule.minAgeBand === "child" && " For ages 5 and over."}
        </p>
      )}

      <ul className="mt-4 space-y-4">
        {state.attendees.map((attendee) => {
          const info = ageInfo(attendee.dateOfBirth, festival.firstDay);
          const name = attendeeName(attendee);
          const fieldId = fieldIds.attendeeExtra(product.id, attendee.clientId);
          const errors = errorsFor(fieldId);
          if (!info) return null;
          if (!bandAllows(info.band, rule.minAgeBand)) {
            return (
              <li key={attendee.clientId} className="text-sm text-white/75">
                {name} · not available for under-5s
              </li>
            );
          }
          const attending = attendanceDates(state, attendee.clientId, festival);
          const days = runsOn.filter((d) => attending.includes(d));
          const row = state.attendeeExtras.find(
            (e) => e.productId === product.id && e.attendeeClientId === attendee.clientId,
          );
          const selected = row?.dates ?? [];
          if (days.length === 0) {
            return (
              <li key={attendee.clientId} className="text-sm text-white/75">
                {name} ·{" "}
                {info.band === "infant"
                  ? "no adult from your group is coming on a day this runs"
                  : "not coming on a day this runs"}
              </li>
            );
          }
          return (
            <li key={attendee.clientId}>
              <DayPicker
                id={fieldId}
                legend={`${name}${info.band === "infant" ? ` (${BAND_RANGE.infant}, optional)` : ""}`}
                selected={selected}
                invalid={errors.length > 0}
                describedBy={errors.length > 0 ? errorIdFor(fieldId) : undefined}
                options={days.map((date) => {
                  // A day they've already picked is theirs: never call it "Full".
                  const full = !selected.includes(date) && (product.soldOut || left <= 0);
                  return { date, disabled: full, note: full ? "Full" : undefined };
                })}
                onToggle={(date) =>
                  dispatch({
                    type: "TOGGLE_EXTRA_DAY",
                    productId: product.id,
                    clientId: attendee.clientId,
                    date,
                  })
                }
              />
              <FieldError id={errorIdFor(fieldId)} messages={errors} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
