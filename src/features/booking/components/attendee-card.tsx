import type { Dispatch } from "react";
import type { IsoDate } from "@/domain/calendar";
import { fieldIds } from "../state/field-targets";
import { ageInfo } from "../state/selectors";
import type { Action, AttendeeDraft } from "../state/types";
import { AgeBadge } from "./age-badge";
import { errorIdFor, FieldError } from "./field-error";
import { input, label, quietButton } from "./styles";

interface Props {
  attendee: AttendeeDraft;
  index: number;
  firstDay: string;
  today: IsoDate;
  dispatch: Dispatch<Action>;
  errorsFor: (fieldId: string) => readonly string[];
}

// One person: name, date of birth, and a live age badge (ages as of the first day, D1).
export function AttendeeCard({ attendee, index, firstDay, today, dispatch, errorsFor }: Props) {
  const { clientId } = attendee;
  const info = ageInfo(attendee.dateOfBirth, firstDay);
  const title = attendee.firstName.trim() || `Person ${index + 1}`;

  const field = (name: "firstName" | "lastName" | "dateOfBirth") => {
    const id = fieldIds.attendeeField(clientId, name);
    const errors = errorsFor(id);
    return {
      id,
      errors,
      "aria-invalid": errors.length > 0 || undefined,
      "aria-describedby": errors.length > 0 ? errorIdFor(id) : undefined,
    };
  };
  const first = field("firstName");
  const last = field("lastName");
  const dob = field("dateOfBirth");

  return (
    <li className="rise-in rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3
            id={fieldIds.attendee(clientId)}
            tabIndex={-1}
            className="font-serif text-xl font-semibold"
          >
            {title}
          </h3>
          <AgeBadge info={info} />
        </div>
        <button
          type="button"
          className={`${quietButton} -mt-2 -mr-2`}
          onClick={() => dispatch({ type: "REMOVE_ATTENDEE", clientId })}
        >
          Remove<span className="sr-only"> {title}</span>
        </button>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {(["firstName", "lastName"] as const).map((name) => {
          const f = name === "firstName" ? first : last;
          return (
            <div key={name}>
              <label htmlFor={f.id} className={label}>
                {name === "firstName" ? "First name" : "Last name"}
              </label>
              <input
                id={f.id}
                className={input}
                autoComplete="off"
                value={attendee[name]}
                maxLength={100}
                aria-invalid={f["aria-invalid"]}
                aria-describedby={f["aria-describedby"]}
                onChange={(event) =>
                  dispatch({ type: "SET_NAME", clientId, field: name, value: event.target.value })
                }
              />
              <FieldError id={errorIdFor(f.id)} messages={f.errors} />
            </div>
          );
        })}
        <div className="sm:col-span-2 sm:max-w-xs">
          <label htmlFor={dob.id} className={label}>
            Date of birth
          </label>
          <input
            id={dob.id}
            type="date"
            min="1900-01-01"
            max={today}
            className={input}
            value={attendee.dateOfBirth}
            aria-invalid={dob["aria-invalid"]}
            aria-describedby={dob["aria-describedby"]}
            onChange={(event) =>
              dispatch({ type: "SET_DOB", clientId, dateOfBirth: event.target.value })
            }
          />
          <FieldError id={errorIdFor(dob.id)} messages={dob.errors} />
        </div>
      </div>
      {info?.band === "infant" && (
        <p className="mt-3 text-sm text-success-text">Free — no ticket needed.</p>
      )}
    </li>
  );
}
