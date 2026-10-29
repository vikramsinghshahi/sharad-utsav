"use client";

import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import type { BookingResponse } from "@/contracts/responses";
import type { EntryKind } from "@/domain/booking";
import { fetchBooking } from "./api/client";
import { DiyaIcon } from "@/components/diya-icon";
import { Money } from "./components/money";
import { Skeleton } from "./components/skeleton";
import { secondaryButton } from "./components/styles";
import { formatDay } from "./format";
import { EventProvider } from "./components/event-context";
import { BAND_LABEL } from "./components/age-labels";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; booking: BookingResponse }
  | { status: "not_found" }
  | { status: "error"; network: boolean };

const ENTRY_LABEL: Record<EntryKind, string> = {
  none: "Free, no ticket needed",
  day_pass: "Day pass",
  all_days: "All-day pass",
  family_pass: "Family pass",
};

// Step 6: the booking as the server has it. Reload-safe: it only needs the id and token.
export function ConfirmationView({ id, token }: { id: string; token: string }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void fetchBooking(id, token, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      if (result.ok) return setState({ status: "ready", booking: result.data });
      if (result.kind === "aborted") return;
      if (result.kind === "problem" && result.problem.status === 404) {
        return setState({ status: "not_found" });
      }
      setState({ status: "error", network: result.kind === "network" });
    });
    return () => controller.abort();
  }, [id, token, attempt]);

  if (state.status === "loading") {
    return (
      <Shell>
        <div aria-busy="true" aria-label="Loading your booking" className="space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-[28rem] w-full rounded-3xl" />
        </div>
      </Shell>
    );
  }
  if (state.status === "not_found") {
    return (
      <Shell>
        <h1 className="font-serif text-4xl font-semibold">We couldn&apos;t find that booking</h1>
        <p className="mt-3 text-ink/85">
          Check the link — it needs to be exactly as it was given after payment.
        </p>
        <Link href="/" className={`${secondaryButton} mt-6`}>
          Go to the home page
        </Link>
      </Shell>
    );
  }
  if (state.status === "error") {
    return (
      <Shell>
        <h1 className="font-serif text-4xl font-semibold">We couldn&apos;t load your booking</h1>
        <p className="mt-3 text-ink/85">
          {state.network ? "You seem to be offline." : "Something went wrong on our side."} Your
          booking is safe.
        </p>
        <button
          type="button"
          onClick={() => setAttempt((n) => n + 1)}
          className={`${secondaryButton} mt-6`}
        >
          Try again
        </button>
      </Shell>
    );
  }

  const { booking } = state;
  if (booking.status !== "confirmed" || !booking.confirmationCode) {
    return (
      <Shell>
        <h1 className="font-serif text-4xl font-semibold">
          {booking.status === "pending_payment"
            ? "Payment not finished yet"
            : "This booking isn't active"}
        </h1>
        <p className="mt-3 text-ink/85">
          {booking.status === "pending_payment"
            ? "Your places are held, but the payment hasn't been completed. Go back to the booking tab to pay."
            : "The places for this booking were released. You're welcome to book again."}
        </p>
        <Link href={`/events/${booking.event.slug}/book`} className={`${secondaryButton} mt-6`}>
          Book tickets
        </Link>
      </Shell>
    );
  }

  return (
    <EventProvider value={booking.event}>
      <Shell>
        <div className="no-print mb-6 flex items-center gap-3">
          <DiyaIcon lit />
          <div>
            <h1 className="font-serif text-4xl leading-tight font-semibold">You&apos;re booked</h1>
            <p className="text-ink/85">
              Confirmation sent to{" "}
              <span className="font-medium text-ink">{booking.booker.email}</span>
            </p>
          </div>
        </div>
        <Ticket booking={booking} code={booking.confirmationCode} />
        <div className="no-print mt-6 flex flex-wrap gap-3">
          <button type="button" onClick={() => window.print()} className={secondaryButton}>
            Print or save as PDF
          </button>
          <Link href="/" className={secondaryButton}>
            Done
          </Link>
        </div>
      </Shell>
    </EventProvider>
  );
}

function Ticket({ booking, code }: { booking: BookingResponse; code: string }) {
  const byAttendee = (attendeeId: string) =>
    booking.lines.filter((l) => l.attendeeId === attendeeId);
  const groupLines = booking.lines.filter((l) => l.attendeeId === null);

  return (
    <article
      aria-label="Your ticket"
      className="overflow-hidden rounded-3xl border border-cream-edge bg-cream text-heading shadow-[0_24px_60px_-30px_rgba(209,172,62,0.55)]"
    >
      {/* Admit panel: code + QR for the door */}
      <div className="flex flex-col items-center gap-5 px-6 pt-7 pb-8 text-center sm:flex-row sm:items-center sm:text-left">
        <div className="flex-1">
          <p className="text-sm font-semibold tracking-[0.2em] text-primary-text uppercase">
            {booking.event.name}
          </p>
          {booking.event.venue && (
            <p className="mt-1 text-sm text-primary-text">{booking.event.venue}</p>
          )}
          <p className="mt-5 text-sm text-primary-text">Confirmation code</p>
          <p className="font-serif text-4xl font-bold tracking-wide tabular-nums lining-nums sm:text-5xl">
            {code}
          </p>
          <p className="mt-3 font-medium">Show this at the door.</p>
        </div>
        {booking.qrPayload && (
          <div className="rounded-2xl border border-cream-edge bg-white p-3">
            <QRCodeSVG
              value={booking.qrPayload}
              size={168}
              level="M"
              fgColor="#291900"
              bgColor="#ffffff"
              title={`QR code for booking ${code}`}
            />
          </div>
        )}
      </div>

      {/* Tear line */}
      <div className="ticket-notch">
        <div className="mx-6 border-t-2 border-dashed border-cream-edge" />
      </div>

      {/* Stub: who and what */}
      <div className="grid gap-6 px-6 pt-6 pb-7 sm:grid-cols-2">
        <section aria-labelledby="ticket-people">
          <h2
            id="ticket-people"
            className="text-sm font-semibold tracking-[0.15em] text-primary-text uppercase"
          >
            Guests
          </h2>
          <ul className="mt-2 space-y-1.5">
            {booking.attendees.map((a) => (
              <li key={a.id}>
                <span className="font-medium">
                  {a.firstName} {a.lastName}
                </span>
                <span className="block text-sm text-primary-text">
                  {BAND_LABEL[a.ageBand]} · {ENTRY_LABEL[a.entryKind]}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-primary-text">
            Booked by {booking.booker.firstName} {booking.booker.lastName}
          </p>
        </section>

        <section aria-labelledby="ticket-receipt">
          <h2
            id="ticket-receipt"
            className="text-sm font-semibold tracking-[0.15em] text-primary-text uppercase"
          >
            Receipt
          </h2>
          <ul className="mt-2 space-y-1 text-sm">
            {booking.attendees.flatMap((a) =>
              byAttendee(a.id).map((line, i) => (
                <ReceiptLine key={`${a.id}-${i}`} line={line} who={a.firstName} />
              )),
            )}
            {groupLines.map((line, i) => (
              <ReceiptLine key={`group-${i}`} line={line} who={null} />
            ))}
          </ul>
          <dl className="mt-3 space-y-1 border-t border-cream-edge pt-3 text-sm">
            <div className="flex justify-between">
              <dt>Subtotal</dt>
              <dd>
                <Money cents={booking.subtotalCents} />
              </dd>
            </div>
            {booking.discountCents > 0 && (
              <div className="flex justify-between">
                <dt>Discount{booking.promoCode ? ` (${booking.promoCode})` : ""}</dt>
                <dd className="tabular-nums">
                  −<Money cents={booking.discountCents} />
                </dd>
              </div>
            )}
            <div className="flex items-baseline justify-between pt-1">
              <dt className="font-semibold">Paid</dt>
              <dd className="font-serif text-2xl font-bold">
                <Money cents={booking.totalCents} />
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </article>
  );
}

function ReceiptLine({
  line,
  who,
}: {
  line: BookingResponse["lines"][number];
  who: string | null;
}) {
  const detail = [
    who,
    line.date ? formatDay(line.date) : null,
    line.qty > 1 ? `×${line.qty}` : null,
  ]
    .filter((part) => part !== null)
    .join(" · ");
  return (
    <li className="flex justify-between gap-3">
      <span>
        {line.displayName}
        {detail && <span className="block text-primary-text">{detail}</span>}
      </span>
      <Money cents={line.lineTotalCents} className="shrink-0" />
    </li>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">{children}</main>;
}
