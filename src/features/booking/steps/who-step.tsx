import { useEffect, useRef } from "react";
import { MAX_ATTENDEES } from "@/domain/booking";
import { AttendeeCard } from "../components/attendee-card";
import { DiyaIcon } from "@/components/diya-icon";
import { secondaryButton } from "../components/styles";
import { formatDay } from "../format";
import { fieldIds } from "../state/field-targets";
import type { StepProps } from "./step-props";

// Step 1: everyone who is coming, with a date of birth each (SPEC §4).
export function WhoStep({ state, dispatch, catalog, today, errorsFor }: StepProps) {
  const firstDay = catalog.days[0]?.date ?? "";
  const count = state.attendees.length;
  const full = count >= MAX_ATTENDEES;
  // Keyboard focus follows the change instead of dropping to <body>: a new card's first
  // name, or after a removal the next card (else the previous one, else "Add").
  const focusNext = useRef<string | null>(null);
  useEffect(() => {
    if (focusNext.current === null) return;
    document.getElementById(focusNext.current)?.focus();
    focusNext.current = null;
  }, [state.attendees]);

  const add = () => {
    const clientId = crypto.randomUUID();
    focusNext.current = fieldIds.attendeeField(clientId, "firstName");
    dispatch({ type: "ADD_ATTENDEE", clientId });
  };
  const remove = (index: number) => {
    const removed = state.attendees[index];
    if (!removed) return;
    const neighbour = state.attendees[index + 1] ?? state.attendees[index - 1];
    focusNext.current = neighbour ? fieldIds.attendee(neighbour.clientId) : fieldIds.addPerson;
    dispatch({ type: "REMOVE_ATTENDEE", clientId: removed.clientId });
  };

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
          <button
            id={fieldIds.addPerson}
            type="button"
            onClick={add}
            className={`${secondaryButton} mt-5`}
          >
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
                onRemove={() => remove(index)}
              />
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <button
              id={fieldIds.addPerson}
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
