import { useRef } from "react";
import { Callout } from "../components/callout";
import { Money } from "../components/money";
import { PromoForm } from "../components/promo-form";
import { QuoteLines, QuoteTotals } from "../components/quote-lines";
import { Skeleton } from "../components/skeleton";
import { SuggestionCard } from "../components/suggestion-card";
import { card } from "../components/styles";
import { ageInfo, allDaysPassFor, attendeeName } from "../state/selectors";
import type { StepProps } from "./step-props";
import { HOLD_DURATION_MS } from "@/domain/booking";
import { formatMinutes } from "../format";

// Step 4: the server's quote, promo code, and any money-saving suggestions (D3, D4).
export function ReviewStep({ state, dispatch, catalog, quote }: StepProps) {
  const current = quote.status === "ready" ? quote.quote : null;
  const shown = current ?? (quote.status === "loading" ? quote.previous : null);
  const linesHeading = useRef<HTMLHeadingElement>(null);

  const warnings = (current?.warnings ?? []).map((w, i) => {
    if (w.code === "POSSIBLE_DUPLICATE_ATTENDEE") {
      const index = typeof w.path[1] === "number" ? w.path[1] : -1;
      const person = state.attendees[index];
      return (
        <Callout key={i} tone="warning">
          Two people have the same name and date of birth
          {person ? ` (${attendeeName(person)})` : ""} — is that right? If it&apos;s a mistake,
          remove one in step 1.
        </Callout>
      );
    }
    const index = typeof w.path[1] === "number" ? w.path[1] : -1;
    const person = state.attendees[index];
    // D2: the all-day pass is sold out, so all five days are charged as day passes.
    const info =
      person && state.festival ? ageInfo(person.dateOfBirth, state.festival.firstDay) : null;
    const product = info && info.band !== "infant" ? allDaysPassFor(catalog, info.band) : undefined;
    return (
      <Callout key={i} tone="warning">
        {product ? `The ${product.displayName}` : "The all-day pass"} is sold out, so{" "}
        {person ? `${attendeeName(person)}'s` : "the"} {catalog.days.length} day passes cost{" "}
        <Money cents={Number(w.params.dayPassTotalCents ?? 0)} />.
      </Callout>
    );
  });

  return (
    <div className="space-y-5">
      {state.error?.kind === "released" && (
        <Callout tone="warning" role="alert">
          <strong className="font-semibold">
            Your places were released — re-check availability.
          </strong>{" "}
          They were held for {formatMinutes(HOLD_DURATION_MS)}. The prices below are fresh; continue
          when you&apos;re ready.
        </Callout>
      )}

      <section
        aria-labelledby="review-lines-title"
        className={card}
        aria-busy={quote.status === "loading" || undefined}
      >
        <h3
          id="review-lines-title"
          ref={linesHeading}
          tabIndex={-1}
          className="font-serif text-2xl font-semibold focus-visible:outline-none"
        >
          Your booking
        </h3>
        <div className="mt-3">
          {shown ? (
            <div className={quote.status === "loading" ? "opacity-60 transition-opacity" : ""}>
              <QuoteLines quote={shown} catalog={catalog} state={state} />
              <div className="mt-4">
                <QuoteTotals quote={shown} />
              </div>
            </div>
          ) : quote.status === "invalid" ? (
            <p className="text-sm text-ink/80">
              We&apos;ll show the total once the points above are sorted out.
            </p>
          ) : quote.status === "error" ? (
            <p className="text-sm text-ink/80">We couldn&apos;t get prices just now.</p>
          ) : (
            <div className="space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="mt-4 h-7 w-32" />
            </div>
          )}
        </div>
      </section>

      {warnings.length > 0 && <div className="space-y-2">{warnings}</div>}

      {current && current.suggestions.length > 0 && (
        <section aria-label="Ways to save" className="space-y-2">
          {current.suggestions.map((s, i) => (
            <SuggestionCard
              key={i}
              suggestion={s}
              catalog={catalog}
              state={state}
              dispatch={dispatch}
              onApplied={() => linesHeading.current?.focus()}
            />
          ))}
        </section>
      )}

      <section className={card}>
        <PromoForm
          applied={state.promoCode}
          outcome={current?.promo ?? null}
          checking={quote.status === "loading"}
          dispatch={dispatch}
        />
      </section>
    </div>
  );
}
