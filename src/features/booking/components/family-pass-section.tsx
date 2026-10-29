import type { Dispatch } from "react";
import type { CatalogResponse } from "@/contracts/responses";
import { formatDay } from "../format";
import { fieldIds } from "../state/field-targets";
import { ageInfo, attendeeName, type PassProductView } from "../state/selectors";
import type { Action, BookingState } from "../state/types";
import { errorIdFor, FieldError } from "./field-error";
import { Money } from "./money";
import { input, label, quietButton, secondaryButton } from "./styles";
import { BAND_RANGE } from "./age-labels";

interface Props {
  product: PassProductView;
  catalog: CatalogResponse;
  state: BookingState;
  dispatch: Dispatch<Action>;
  errorsFor: (fieldId: string) => readonly string[];
}

// Family passes: one pass per day (D20) for 1–2 adults and up to 2 children (D3).
export function FamilyPassSection({ product, catalog, state, dispatch, errorsFor }: Props) {
  const festival = state.festival;
  const maxAdults = product.rule.covers?.adult ?? 0;
  const maxChildren = product.rule.covers?.child ?? 0;
  const onSaleDays = catalog.days.filter((d) => d.onSale).map((d) => d.date);
  const usedDays = new Set(state.familyGroups.map((g) => g.date));
  const nextDay = onSaleDays.find((d) => !usedDays.has(d)) ?? onSaleDays[0];

  const people = festival
    ? state.attendees.flatMap((a) => {
        const info = ageInfo(a.dateOfBirth, festival.firstDay);
        return info && info.band !== "infant" ? [{ attendee: a, band: info.band }] : [];
      })
    : [];

  const addPass = () => {
    if (!nextDay) return;
    dispatch({
      type: "ADD_FAMILY_GROUP",
      id: crypto.randomUUID(),
      productId: product.id,
      date: nextDay,
    });
  };

  return (
    <section aria-labelledby="family-passes-title" className="space-y-3">
      <div>
        <h3 id="family-passes-title" className="font-serif text-2xl font-semibold">
          Family passes
        </h3>
        <p className="mt-1 text-sm text-ink/80">
          One {product.displayName} (<Money cents={product.priceCents} />) covers one day for 1–
          {maxAdults} adults ({BAND_RANGE.adult}) and up to {maxChildren} children (
          {BAND_RANGE.child}). Coming on more than one day? Add a pass for each day.
        </p>
      </div>

      {state.familyGroups.length === 0 && (
        <p className="rounded-xl border border-dashed border-line-strong p-4 text-sm text-ink/75">
          No family passes yet. Choose “{product.displayName}” for a person above, or add one here.
        </p>
      )}

      <ul className="space-y-3">
        {state.familyGroups.map((group, index) => {
          const members = people.filter((p) =>
            group.attendeeClientIds.includes(p.attendee.clientId),
          );
          const adults = members.filter((p) => p.band === "adult").length;
          const children = members.filter((p) => p.band === "child").length;
          const fieldId = fieldIds.familyGroup(group.id);
          const errors = errorsFor(fieldId);
          const dateId = `${fieldId}-date`;
          const ok = adults >= 1 && adults <= maxAdults && children <= maxChildren;
          return (
            <li
              key={group.id}
              id={fieldId}
              tabIndex={-1}
              aria-describedby={errors.length > 0 ? errorIdFor(fieldId) : undefined}
              className={`rise-in rounded-2xl border bg-surface p-4 ${errors.length > 0 ? "border-error" : "border-line"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <h4 className="font-semibold">Family pass {index + 1}</h4>
                <button
                  type="button"
                  className={`${quietButton} -mt-2 -mr-2`}
                  onClick={() => dispatch({ type: "REMOVE_FAMILY_GROUP", id: group.id })}
                >
                  Remove<span className="sr-only"> family pass {index + 1}</span>
                </button>
              </div>

              <div className="mt-2 max-w-xs">
                <label htmlFor={dateId} className={label}>
                  Day
                </label>
                <select
                  id={dateId}
                  className={input}
                  value={group.date}
                  onChange={(event) =>
                    dispatch({
                      type: "SET_FAMILY_GROUP_DATE",
                      id: group.id,
                      date: event.target.value,
                    })
                  }
                >
                  {catalog.days.map((d) => (
                    <option key={d.date} value={d.date} disabled={!d.onSale} className="bg-page">
                      {formatDay(d.date)}
                      {d.onSale ? "" : " (closed)"}
                    </option>
                  ))}
                </select>
              </div>

              <fieldset className="mt-3">
                <legend className="text-sm text-ink/80">Who does this pass cover?</legend>
                {people.length === 0 ? (
                  <p className="mt-2 text-sm text-ink/75">
                    Add people with a date of birth in step 1 first.
                  </p>
                ) : (
                  <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                    {people.map(({ attendee, band }) => {
                      const checked = group.attendeeClientIds.includes(attendee.clientId);
                      const full = band === "adult" ? adults >= maxAdults : children >= maxChildren;
                      const otherSameDay = state.familyGroups.some(
                        (g) =>
                          g.id !== group.id &&
                          g.date === group.date &&
                          g.attendeeClientIds.includes(attendee.clientId),
                      );
                      const disabled = !checked && (full || otherSameDay);
                      const id = `${fieldId}-${attendee.clientId}`;
                      return (
                        <li key={attendee.clientId}>
                          <label
                            htmlFor={id}
                            className={`flex min-h-11 items-center gap-3 rounded-xl border px-3 py-2 ${
                              checked ? "border-gold-ink bg-bright-gold/10" : "border-line-strong"
                            } ${disabled ? "opacity-60" : "cursor-pointer"}`}
                          >
                            <input
                              id={id}
                              type="checkbox"
                              checked={checked}
                              disabled={disabled}
                              className="size-4 accent-gold-ink"
                              onChange={(event) =>
                                dispatch({
                                  type: "SET_FAMILY_GROUP",
                                  id: group.id,
                                  clientId: attendee.clientId,
                                  member: event.target.checked,
                                })
                              }
                            />
                            <span className="flex-1 text-sm">
                              {attendeeName(attendee)}
                              <span className="block text-ink/70">
                                {band === "adult" ? "Adult" : "Child"}
                                {otherSameDay
                                  ? " · already on a pass this day"
                                  : disabled
                                    ? ` · pass has ${band === "adult" ? maxAdults : maxChildren} ${band === "adult" ? "adults" : "children"}`
                                    : ""}
                              </span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </fieldset>

              <p className={`mt-3 text-sm ${ok ? "text-success-text" : "text-ink/80"}`}>
                {adults} of {maxAdults} adults · {children} of {maxChildren} children
                {ok ? " ✓" : adults === 0 ? " · needs at least 1 adult" : ""}
              </p>
              <FieldError id={errorIdFor(fieldId)} messages={errors} />
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={addPass}
        disabled={product.soldOut || !nextDay}
        className={secondaryButton}
      >
        {product.soldOut ? "Family passes are sold out" : "+ Add a family pass"}
      </button>
    </section>
  );
}
