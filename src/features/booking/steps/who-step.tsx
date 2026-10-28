import { MAX_ATTENDEES } from "@/domain/booking";
import { AttendeeCard } from "../components/attendee-card";
import { DiyaIcon } from "../components/diya-icon";
import { secondaryButton } from "../components/styles";
import { formatDay } from "../format";
import type { StepProps } from "./step-props";

// Step 1: everyone who is coming, with a date of birth each (SPEC §4).
export function WhoStep({ state, dispatch, catalog, today, errorsFor }: StepProps) {
  const firstDay = catalog.days[0]?.date ?? "";
  const count = state.attendees.length;
  const full = count >= MAX_ATTENDEES;
  const add = () => dispatch({ type: "ADD_ATTENDEE", clientId: crypto.randomUUID() });

  return (
    <div className="space-y-4">
      <p className="text-white/85">
        Add everyone who is coming, including little ones. Ages are as of {formatDay(firstDay)}, the
        first day.
      </p>

      {count === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-line-strong px-6 py-10 text-center">
          <DiyaIcon lit={false} current />
          <p className="mt-3 font-serif text-xl">Nobody added yet</p>
          <p className="mt-1 max-w-sm text-sm text-white/75">
            Start with yourself or whoever is coming. Under-5s come free, but please add them so our
            volunteers know who to expect.
          </p>
          <button id="add-person" type="button" onClick={add} className={`${secondaryButton} mt-5`}>
            + Add the first person
          </button>
        </div>
      ) : (
        <>
          <ul className="space-y-3">
            {state.attendees.map((attendee, index) => (
              <AttendeeCard
                key={attendee.clientId}
                attendee={attendee}
                index={index}
                firstDay={firstDay}
                today={today}
                dispatch={dispatch}
                errorsFor={errorsFor}
              />
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <button
              id="add-person"
              type="button"
              onClick={add}
              disabled={full}
              className={secondaryButton}
            >
              + Add another person
            </button>
            <p className="text-sm text-white/75" aria-live="polite">
              {full
                ? `That's the limit of ${MAX_ATTENDEES} people per booking. For larger groups, please contact the temple.`
                : `${count} of ${MAX_ATTENDEES} people`}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
