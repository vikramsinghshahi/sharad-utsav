"use client";

import { useEffect, useRef } from "react";
import { Callout } from "../components/callout";
import { errorIdFor, FieldError } from "../components/field-error";
import { HoldCountdown } from "../components/hold-countdown";
import { Money } from "../components/money";
import { card, input, label, primaryButton, secondaryButton } from "../components/styles";
import { fieldIds } from "../state/field-targets";
import { findBookerAttendee } from "../state/selectors";
import { STEP_TITLES, type BookerDraft } from "../state/types";
import type { StepProps } from "./step-props";
import { RESPONSIBLE_AGE } from "../components/age-labels";

interface Props extends StepProps {
  onPay: (outcome: "succeed" | "decline") => void;
  onHoldExpired: () => void;
  onAddBookerAsAttendee: () => void;
}

type TextField = Exclude<keyof BookerDraft, "isAttending">;

const FIELDS: { name: TextField; label: string; type: string; autoComplete: string }[] = [
  { name: "firstName", label: "First name", type: "text", autoComplete: "given-name" },
  { name: "lastName", label: "Last name", type: "text", autoComplete: "family-name" },
  { name: "email", label: "Email", type: "email", autoComplete: "email" },
  { name: "phone", label: "Phone", type: "tel", autoComplete: "tel" },
  { name: "dateOfBirth", label: "Your date of birth", type: "date", autoComplete: "bday" },
];

// Step 5: the person paying (18+, A5), then the hold (HOLD_DURATION_MS) and the simulated payment.
export function PayStep(props: Props) {
  const { state, dispatch, today, errorsFor, onPay, onHoldExpired, onAddBookerAsAttendee } = props;
  const { booker, hold, error, inFlight } = state;
  const match = findBookerAttendee(state);
  const feedback = useRef<HTMLDivElement>(null);
  const failed =
    error?.kind === "declined" || (error?.kind === "network" && error.during === "pay");

  // After a failed payment, take focus to the message (not lost on <body>).
  useEffect(() => {
    if (failed) feedback.current?.focus();
  }, [failed, error]);

  // Once places are held, focus the payment panel so Pay is the next Tab stop.
  const payHeading = useRef<HTMLHeadingElement>(null);
  const heldBookingId = hold?.bookingId;
  useEffect(() => {
    if (heldBookingId) payHeading.current?.focus();
  }, [heldBookingId]);

  if (hold) {
    const changed = hold.reviewedTotalCents !== null && hold.reviewedTotalCents !== hold.totalCents;
    const paying = inFlight === "pay";
    return (
      <div className="space-y-4">
        <HoldCountdown expiresAt={hold.holdExpiresAt} onExpire={onHoldExpired} />

        {changed && (
          <Callout tone="warning" role="alert">
            The price changed to <Money cents={hold.totalCents} /> since you reviewed it. This is
            the amount that will be charged.
          </Callout>
        )}

        <section className={card} aria-labelledby="pay-title">
          <h3
            id="pay-title"
            ref={payHeading}
            tabIndex={-1}
            className="font-serif text-2xl font-semibold focus-visible:outline-none"
          >
            Payment
          </h3>
          <p className="mt-1 text-sm text-white/80">
            Booking for {booker.firstName} {booker.lastName} · confirmation goes to {booker.email}
          </p>
          <p className="mt-4 text-sm text-white/80">Amount to pay</p>
          <p className="font-serif text-4xl font-semibold text-bright-gold">
            <Money cents={hold.totalCents} />
          </p>

          <div
            ref={feedback}
            tabIndex={-1}
            aria-live="polite"
            className="mt-4 space-y-2 rounded-xl empty:hidden"
          >
            {error?.kind === "declined" && (
              <Callout tone="error" role="alert">
                The payment didn&apos;t go through. Your places are still held — you can try again.
              </Callout>
            )}
            {error?.kind === "network" && error.during === "pay" && (
              <Callout tone="error" role="alert">
                We didn&apos;t hear back from the payment service. Try again — you won&apos;t be
                charged twice.
              </Callout>
            )}
            {error?.kind === "problem" && (
              <Callout tone="error" role="alert">
                {error.detail ?? error.title}
              </Callout>
            )}
          </div>

          <p className="mt-4 text-sm text-white/75">
            This is a demonstration: no card is needed and no money moves.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              className={primaryButton}
              disabled={inFlight !== null}
              aria-busy={paying || undefined}
              onClick={() => onPay("succeed")}
            >
              {paying ? (
                "Paying…"
              ) : (
                <span>
                  Pay <Money cents={hold.totalCents} /> (simulated success)
                </span>
              )}
            </button>
            <button
              type="button"
              className={secondaryButton}
              disabled={inFlight !== null}
              onClick={() => onPay("decline")}
            >
              Simulate a declined card
            </button>
          </div>
        </section>
      </div>
    );
  }

  const set = (patch: Partial<BookerDraft>) => dispatch({ type: "SET_BOOKER", patch });
  const attendingId = fieldIds.booker("isAttending");
  const attendingErrors = errorsFor(attendingId);

  return (
    <div className="space-y-4">
      <p className="text-white/85">
        The person paying must be {RESPONSIBLE_AGE} or over. We&apos;ll send the confirmation to
        this email.
      </p>

      {error?.kind === "network" && error.during === "create" && (
        <Callout tone="error" role="alert">
          We couldn&apos;t reach the booking server. Press “Continue to payment” again — you
          won&apos;t be booked twice.
        </Callout>
      )}
      {error?.kind === "stock" && (
        <Callout tone="error" role="alert">
          <p>{error.message}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {error.fix && (
              <button
                type="button"
                className={secondaryButton}
                onClick={() => error.fix?.actions.forEach((a) => dispatch(a))}
              >
                {error.fix.label}
              </button>
            )}
            <button
              type="button"
              className={secondaryButton}
              onClick={() => dispatch({ type: "GO_TO_STEP", step: error.step })}
            >
              Go to {STEP_TITLES[error.step]}
            </button>
          </div>
        </Callout>
      )}
      {error?.kind === "problem" && (error.details ?? []).length === 0 && (
        <Callout tone="error" role="alert">
          {error.detail ?? error.title}
        </Callout>
      )}

      <section className={card} aria-labelledby="booker-title">
        <h3 id="booker-title" className="font-serif text-2xl font-semibold">
          Your details
        </h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {FIELDS.map((f) => {
            const id = fieldIds.booker(f.name);
            const errors = errorsFor(id);
            return (
              <div key={f.name} className={f.name === "dateOfBirth" ? "sm:max-w-xs" : ""}>
                <label htmlFor={id} className={label}>
                  {f.label}
                </label>
                <input
                  id={id}
                  type={f.type}
                  autoComplete={f.autoComplete}
                  className={input}
                  value={booker[f.name]}
                  {...(f.type === "date" ? { min: "1900-01-01", max: today } : {})}
                  inputMode={f.type === "tel" ? "tel" : undefined}
                  aria-invalid={errors.length > 0 || undefined}
                  aria-describedby={errors.length > 0 ? errorIdFor(id) : undefined}
                  onChange={(event) => set({ [f.name]: event.target.value })}
                />
                <FieldError id={errorIdFor(id)} messages={errors} />
              </div>
            );
          })}
        </div>

        <div className="mt-4">
          <label htmlFor={attendingId} className="flex min-h-11 cursor-pointer items-center gap-3">
            <input
              id={attendingId}
              type="checkbox"
              className="size-5 accent-bright-gold"
              checked={booker.isAttending}
              aria-invalid={attendingErrors.length > 0 || undefined}
              aria-describedby={attendingErrors.length > 0 ? errorIdFor(attendingId) : undefined}
              onChange={(event) => set({ isAttending: event.target.checked })}
            />
            <span>I&apos;m also attending</span>
          </label>
          {booker.isAttending && match && (
            <p className="mt-1 text-sm text-success-text">
              You&apos;re in the group as {match.firstName} {match.lastName}. ✓
            </p>
          )}
          {booker.isAttending && !match && (
            <div className="mt-2 rounded-xl border border-bright-gold/60 bg-bright-gold/10 p-3 text-sm">
              <p>
                We can&apos;t find you in the group (same name and date of birth). Add yourself so
                you get a ticket too?
              </p>
              <button
                type="button"
                className={`${secondaryButton} mt-2`}
                disabled={booker.firstName.trim() === "" || booker.dateOfBirth === ""}
                onClick={onAddBookerAsAttendee}
              >
                Add {booker.firstName.trim() || "me"} as a person
              </button>
            </div>
          )}
          <FieldError id={errorIdFor(attendingId)} messages={attendingErrors} />
        </div>
      </section>
    </div>
  );
}
