import { EntryPicker } from "../components/entry-picker";
import { FamilyPassSection } from "../components/family-pass-section";
import { SuggestionCard } from "../components/suggestion-card";
import { fieldIds, STEP_HEADING_ID } from "../state/field-targets";
import { ageInfo, attendeeName, familyPass, responsibleAdultDates } from "../state/selectors";
import { formatDays } from "../format";
import type { StepProps } from "./step-props";
import { BAND_LABEL, RESPONSIBLE_AGE } from "../components/age-labels";

// Step 2: a ticket for each person aged 5+, and any family passes.
export function PassesStep({ state, dispatch, catalog, quote, errorsFor }: StepProps) {
  const festival = state.festival;
  const family = familyPass(catalog);
  const quoteNow = quote.status === "ready" ? quote.quote : null;
  if (!festival) return null;

  const rows = state.attendees.map((attendee, index) => ({
    attendee,
    index,
    info: ageInfo(attendee.dateOfBirth, festival.firstDay),
  }));
  const ticketed = rows.filter((r) => r.info && r.info.band !== "infant");
  const infants = rows.filter((r) => r.info?.band === "infant");
  const missingDob = rows.filter((r) => !r.info);
  const infantDays = responsibleAdultDates(state, festival);

  return (
    <div className="space-y-6">
      <p className="text-ink/85">
        Choose a ticket for each person aged 5 and over. Only tickets that fit their age are shown.
      </p>

      {missingDob.length > 0 && (
        <p className="rounded-xl border border-line p-3 text-sm">
          {missingDob.map((r) => attendeeName(r.attendee)).join(", ")} still need a date of birth in
          step 1.
        </p>
      )}

      <ul className="space-y-3">
        {ticketed.map(({ attendee, index, info }) =>
          info && info.band !== "infant" ? (
            <EntryPicker
              key={attendee.clientId}
              attendee={attendee}
              age={info.age}
              band={info.band}
              catalog={catalog}
              dispatch={dispatch}
              errors={[
                ...errorsFor(fieldIds.entry(attendee.clientId)),
                ...errorsFor(fieldIds.attendee(attendee.clientId)),
              ]}
              familyGroups={state.familyGroups}
              warnings={
                quoteNow?.warnings.filter(
                  (w) => w.path[0] === "attendees" && w.path[1] === index,
                ) ?? []
              }
            />
          ) : null,
        )}
      </ul>

      {infants.length > 0 && (
        <section
          aria-labelledby="infants-title"
          className="rounded-2xl border border-line bg-surface p-4"
        >
          <h3 id="infants-title" className="font-semibold">
            {BAND_LABEL.infant} — free, no ticket needed
          </h3>
          <ul className="mt-2 space-y-1 text-sm">
            {infants.map(({ attendee }) => (
              <li key={attendee.clientId} id={fieldIds.attendee(attendee.clientId)} tabIndex={-1}>
                {attendeeName(attendee)}
                <span className="text-ink/75">
                  {infantDays.length > 0
                    ? ` · comes with your adults on ${formatDays(infantDays)}`
                    : ` · comes with an adult aged ${RESPONSIBLE_AGE}+ from your group`}
                </span>
                {errorsFor(fieldIds.attendee(attendee.clientId)).map((m) => (
                  <span key={m} className="block text-error-text">
                    {m}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </section>
      )}

      {quoteNow?.suggestions
        .filter((s) => s.code === "USE_SEPARATE_DAY_PASSES" || s.code === "SWITCH_TO_ALL_DAYS")
        .map((s, i) => (
          <SuggestionCard
            key={i}
            suggestion={s}
            catalog={catalog}
            state={state}
            dispatch={dispatch}
            onApplied={() =>
              document
                .getElementById(
                  s.code === "SWITCH_TO_ALL_DAYS"
                    ? fieldIds.entry(s.attendeeClientId)
                    : STEP_HEADING_ID,
                )
                ?.focus()
            }
          />
        ))}

      {family && (
        <FamilyPassSection
          product={family}
          catalog={catalog}
          state={state}
          dispatch={dispatch}
          errorsFor={errorsFor}
        />
      )}
    </div>
  );
}
