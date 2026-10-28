import type { Dispatch } from "react";
import type { CatalogResponse, QuoteResponse } from "@/contracts/responses";
import { fieldIds } from "../state/field-targets";
import {
  allDaysPassFor,
  dayPassFor,
  familyPass,
  firstNameOf,
  type TicketBand,
} from "../state/selectors";
import type { Action, AttendeeDraft, FamilyGroupDraft } from "../state/types";
import { formatDay } from "../format";
import { AgeBadge } from "./age-badge";
import { Callout } from "./callout";
import { DayPicker } from "./day-picker";
import { errorIdFor, FieldError } from "./field-error";
import { Money } from "./money";
import { priceLabel } from "./price-label";
import { useEvent } from "./event-context";

interface Props {
  attendee: AttendeeDraft;
  age: number;
  band: TicketBand;
  catalog: CatalogResponse;
  dispatch: Dispatch<Action>;
  errors: readonly string[];
  warnings: QuoteResponse["warnings"];
  familyGroups: readonly FamilyGroupDraft[];
}

// One person's ticket. Only products for their age band are offered (A3/A4),
// so an adult ticket for a 7-year-old can't even be chosen.
export function EntryPicker({
  attendee,
  age,
  band,
  catalog,
  dispatch,
  errors,
  warnings,
  familyGroups,
}: Props) {
  const { currency } = useEvent();
  const { clientId, entry } = attendee;
  const dayPass = dayPassFor(catalog, band);
  const allDays = allDaysPassFor(catalog, band);
  const family = familyPass(catalog);
  const fieldId = fieldIds.entry(clientId);
  const name = firstNameOf(attendee);
  const radioName = `entry-${clientId}`;

  const allDaysReason = !allDays
    ? null
    : allDays.soldOut
      ? "Sold out"
      : !catalog.allDaysOnSale
        ? "No longer on sale"
        : null;

  const option = (
    kind: "day_pass" | "all_days" | "family_pass",
    title: string,
    price: React.ReactNode,
    detail: string,
    disabledReason: string | null,
    onSelect: () => void,
  ) => {
    const checked = entry.kind === kind;
    const id = `${radioName}-${kind}`;
    return (
      <label
        htmlFor={id}
        className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
          checked
            ? "border-bright-gold bg-bright-gold/10"
            : "border-line-strong hover:border-white/60"
        } ${disabledReason ? "cursor-not-allowed opacity-70" : ""}`}
      >
        <input
          id={id}
          type="radio"
          name={radioName}
          checked={checked}
          disabled={disabledReason !== null}
          onChange={onSelect}
          className="mt-1 size-4 accent-bright-gold"
        />
        <span className="flex-1">
          <span className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="font-medium">{title}</span>
            <span className="text-sm text-bright-gold tabular-nums">{price}</span>
          </span>
          <span className="block text-sm text-white/75">{disabledReason ?? detail}</span>
        </span>
      </label>
    );
  };

  const soldOutWarning = warnings.find((w) => w.code === "ALL_DAYS_SOLD_OUT");

  return (
    <li className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3
          id={fieldIds.attendee(clientId)}
          tabIndex={-1}
          className="font-serif text-xl font-semibold"
        >
          {name}
        </h3>
        <AgeBadge info={{ age, band }} />
      </div>

      <fieldset
        id={fieldId}
        tabIndex={-1}
        className="mt-3 space-y-2"
        aria-invalid={errors.length > 0 || undefined}
        aria-describedby={errors.length > 0 ? errorIdFor(fieldId) : undefined}
      >
        <legend className="sr-only">Ticket for {name}</legend>
        {dayPass &&
          option(
            "day_pass",
            dayPass.displayName,
            priceLabel(dayPass, currency),
            "Choose the days below",
            dayPass.soldOut ? "Sold out" : null,
            () =>
              dispatch({
                type: "SET_ENTRY",
                clientId,
                entry: { kind: "day_pass", productId: dayPass.id, dates: [] },
              }),
          )}
        {allDays &&
          option(
            "all_days",
            allDays.displayName,
            <Money cents={allDays.priceCents} />,
            `All ${catalog.days.length} days`,
            allDaysReason,
            () =>
              dispatch({
                type: "SET_ENTRY",
                clientId,
                entry: { kind: "all_days", productId: allDays.id },
              }),
          )}
        {family &&
          option(
            "family_pass",
            family.displayName,
            `${priceLabel(family, currency)} / day`,
            "Shared with family members — set it up below",
            family.soldOut ? "Sold out" : null,
            () => {
              // Default a new pass to the first on-sale day that has no pass yet.
              const onSale = catalog.days.filter((d) => d.onSale).map((d) => d.date);
              const used = new Set(familyGroups.map((g) => g.date));
              const date = onSale.find((d) => !used.has(d)) ?? onSale[0];
              if (!date) return;
              dispatch({
                type: "CHOOSE_FAMILY_PASS",
                clientId,
                newGroup: { id: crypto.randomUUID(), productId: family.id, date },
              });
            },
          )}
      </fieldset>
      <FieldError id={errorIdFor(fieldId)} messages={errors} />

      {entry.kind === "day_pass" && (
        <div className="mt-4">
          <DayPicker
            legend={`Which days is ${name} coming?`}
            selected={entry.dates}
            options={catalog.days.map((d) => ({
              date: d.date,
              disabled: !d.onSale,
              note: d.onSale ? undefined : "Closed",
            }))}
            onToggle={(date) => dispatch({ type: "TOGGLE_DAY", clientId, date })}
          />
        </div>
      )}

      {entry.kind === "family_pass" && (
        <FamilyMembership clientId={clientId} name={name} familyGroups={familyGroups} />
      )}

      {soldOutWarning && allDays && (
        <div className="mt-3">
          <Callout tone="warning">
            The {allDays.displayName} is sold out, so {catalog.days.length} day passes cost{" "}
            <Money cents={Number(soldOutWarning.params.dayPassTotalCents ?? 0)} /> instead of{" "}
            <Money cents={allDays.priceCents} />.
          </Callout>
        </div>
      )}
    </li>
  );
}

// Which family pass(es) this person is on, with a jump to edit them.
function FamilyMembership({
  clientId,
  name,
  familyGroups,
}: {
  clientId: string;
  name: string;
  familyGroups: readonly FamilyGroupDraft[];
}) {
  const mine = familyGroups
    .map((group, index) => ({ group, index }))
    .filter(({ group }) => group.attendeeClientIds.includes(clientId));
  const jump = (groupId: string) => {
    const element = document.getElementById(fieldIds.familyGroup(groupId));
    element?.scrollIntoView({ block: "center" });
    element?.focus({ preventScroll: true });
  };
  if (mine.length === 0) {
    return <p className="mt-3 text-sm text-white/80">{name} isn&apos;t on a family pass yet.</p>;
  }
  return (
    <ul className="mt-3 space-y-1 text-sm">
      {mine.map(({ group, index }) => (
        <li key={group.id} className="flex flex-wrap items-center gap-x-3">
          <span>
            On family pass {index + 1} · {formatDay(group.date)}
          </span>
          <button
            type="button"
            onClick={() => jump(group.id)}
            className="min-h-11 text-bright-gold underline-offset-4 hover:underline"
          >
            Edit pass {index + 1}
          </button>
        </li>
      ))}
    </ul>
  );
}
