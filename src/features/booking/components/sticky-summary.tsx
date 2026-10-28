import type { CatalogResponse, QuoteResponse } from "@/contracts/responses";
import type { QuoteState } from "../api/use-quote";
import { formatMoney } from "../format";
import type { BookingState } from "../state/types";
import { Money } from "./money";
import { QuoteLines, QuoteTotals } from "./quote-lines";
import { Skeleton } from "./skeleton";
import { primaryButton } from "./styles";

export interface PrimaryAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
}

interface Props {
  quote: QuoteState;
  catalog: CatalogResponse;
  state: Pick<BookingState, "attendees" | "familyGroups">;
  action: PrimaryAction | null;
  onRetryQuote: () => void;
  // On Review the full breakdown is already on the page; the card then shows totals only.
  totalsOnly?: boolean;
}

const shownQuote = (state: QuoteState): QuoteResponse | null =>
  state.status === "ready" ? state.quote : state.status === "loading" ? state.previous : null;

// Phone: a bottom bar with the total and the next action. Desktop: an order summary card.
// The total is always the latest server quote, or "—" while there isn't one.
export function StickySummary({
  quote,
  catalog,
  state,
  action,
  onRetryQuote,
  totalsOnly = false,
}: Props) {
  const shown = shownQuote(quote);
  const updating = quote.status === "loading";

  const button = action && (
    <button
      type="button"
      onClick={action.onClick}
      disabled={action.disabled || action.busy}
      aria-busy={action.busy || undefined}
      className={`${primaryButton} w-full`}
    >
      {action.busy && (
        <span
          aria-hidden="true"
          className="size-4 animate-spin rounded-full border-2 border-heading/30 border-t-heading"
        />
      )}
      {action.label}
    </button>
  );

  return (
    <>
      <p aria-live="polite" className="sr-only">
        {quote.status === "ready" ? `Total ${formatMoney(quote.quote.totalCents)}` : ""}
      </p>

      {/* Phone bottom bar */}
      <div className="no-print fixed inset-x-0 bottom-0 z-20 border-t border-line bg-primary-dark/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm lg:hidden">
        <div className="mx-auto flex max-w-xl items-center gap-4">
          <div className="min-w-24" aria-busy={updating || undefined}>
            <p className="text-xs text-white/75">Total</p>
            {shown ? (
              <p
                className={`font-serif text-2xl leading-tight font-semibold text-bright-gold transition-opacity ${updating ? "opacity-60" : ""}`}
              >
                <Money cents={shown.totalCents} />
              </p>
            ) : quote.status === "loading" ? (
              <Skeleton className="mt-1 h-6 w-20" />
            ) : (
              <p className="font-serif text-2xl leading-tight text-white/70">—</p>
            )}
          </div>
          <div className="flex-1">{button}</div>
        </div>
      </div>

      {/* Desktop order summary */}
      <aside
        aria-label="Order summary"
        className="no-print sticky top-6 hidden rounded-2xl border border-line bg-surface p-5 lg:block"
      >
        <h2 className="font-serif text-2xl font-semibold">Your booking</h2>
        <div className="mt-4 max-h-[50vh] overflow-y-auto pr-1" aria-busy={updating || undefined}>
          {quote.status === "idle" && (
            <p className="text-sm text-white/75">Add the people who are coming to see prices.</p>
          )}
          {quote.status === "loading" && !shown && (
            <div className="space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          )}
          {quote.status === "invalid" && (
            <p className="text-sm text-white/75">
              Prices appear here as soon as everyone has a ticket that fits the rules.
            </p>
          )}
          {quote.status === "error" && (
            <div className="space-y-2 text-sm">
              <p className="text-white/80">We couldn&apos;t get prices just now.</p>
              <button type="button" onClick={onRetryQuote} className="text-bright-gold underline">
                Try again
              </button>
            </div>
          )}
          {shown && totalsOnly && (
            <p className="text-sm text-white/75">The full breakdown is on the left.</p>
          )}
          {shown && !totalsOnly && (
            <div className={`transition-opacity ${updating ? "opacity-60" : ""}`}>
              <QuoteLines quote={shown} catalog={catalog} state={state} compact />
            </div>
          )}
        </div>
        {shown ? (
          <div className={`mt-4 transition-opacity ${updating ? "opacity-60" : ""}`}>
            <QuoteTotals quote={shown} />
          </div>
        ) : (
          <div className="mt-4 flex items-baseline justify-between border-t border-line pt-3">
            <span className="font-semibold">Total</span>
            <span className="font-serif text-2xl text-white/70">—</span>
          </div>
        )}
        {updating && <p className="mt-1 text-xs text-white/70">Updating prices…</p>}
        {button && <div className="mt-4">{button}</div>}
        <p className="mt-3 text-xs leading-relaxed text-white/70">
          Prices are worked out by the temple&apos;s booking system. No fees or taxes.
        </p>
      </aside>
    </>
  );
}
