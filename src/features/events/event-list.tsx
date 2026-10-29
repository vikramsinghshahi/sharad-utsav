"use client";

import Link from "next/link";
import { DiyaIcon } from "@/components/diya-icon";
import { formatDateRange, formatMoney } from "@/contracts/format";
import type { EventListResponse } from "@/contracts/responses";
import { useEvents } from "./use-events";

type EventSummary = EventListResponse["events"][number];

// The landing page's list of upcoming events, all from GET /api/events. A second
// festival appears here as soon as its data exists: no code change.
export function EventList() {
  const { state, retry } = useEvents();

  if (state.status === "loading") {
    return (
      <div aria-busy="true" aria-label="Loading events" className="mt-10 space-y-4">
        <div className="h-56 animate-pulse rounded-2xl border border-line bg-surface" />
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <p role="alert" className="mt-10 text-ink/85">
        {state.network ? "You seem to be offline. " : "We couldn't load events just now. "}
        <button type="button" onClick={retry} className="text-gold-ink underline">
          Try again
        </button>
      </p>
    );
  }
  if (state.events.length === 0) {
    return <p className="mt-10 text-ink/85">There are no upcoming events right now.</p>;
  }
  return (
    <ul className="mt-10 space-y-6">
      {state.events.map((event) => (
        <li key={event.slug}>
          <EventCard event={event} />
        </li>
      ))}
    </ul>
  );
}

function EventCard({ event }: { event: EventSummary }) {
  const headingId = `event-${event.slug}`;
  return (
    <article
      aria-labelledby={headingId}
      className="rounded-2xl border border-line bg-surface px-5 py-6 sm:px-8 sm:py-8"
    >
      <div className="flex items-center gap-2" aria-hidden="true">
        <DiyaIcon lit />
        <DiyaIcon lit />
        <DiyaIcon lit />
      </div>
      {event.venue && (
        <p className="mt-5 text-sm font-medium tracking-[0.2em] text-gold-ink uppercase">
          {event.venue}
        </p>
      )}
      <h2
        id={headingId}
        className="mt-2 font-serif text-4xl leading-[1.05] font-semibold lining-nums sm:text-6xl"
      >
        {event.name}
      </h2>
      <p className="mt-3 text-lg font-medium text-ink lining-nums">
        {formatDateRange(event.firstDay, event.lastDay)}
      </p>
      {event.tagline && <p className="mt-3 max-w-xl text-ink/85">{event.tagline}</p>}

      <div className="mt-7 flex flex-wrap items-center gap-4">
        <Link
          href={`/events/${encodeURIComponent(event.slug)}/book`}
          className="inline-flex min-h-12 items-center rounded-xl bg-primary px-6 py-3 text-lg font-semibold text-heading transition-colors hover:bg-bright-gold"
        >
          Book tickets
        </Link>
        {event.lowestEntryPriceCents !== null && (
          <p className="text-sm text-ink/80">
            Tickets from{" "}
            <span className="font-semibold text-ink tabular-nums">
              {formatMoney(event.lowestEntryPriceCents, event.currency)}
            </span>
          </p>
        )}
      </div>
    </article>
  );
}
