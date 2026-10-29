import type { CatalogResponse, QuoteResponse } from "@/contracts/responses";
import { formatDay } from "../format";
import { attendeeName, productById } from "../state/selectors";
import type { BookingState } from "../state/types";
import { Money } from "./money";

type Line = QuoteResponse["lines"][number];

interface Group {
  key: string;
  title: string;
  subtitle?: string;
  lines: Line[];
}

interface Props {
  quote: QuoteResponse;
  catalog: CatalogResponse;
  state: Pick<BookingState, "attendees" | "familyGroups">;
}

// The server's quote, grouped person → their lines, then family passes, then group extras.
// Nothing here adds anything up: every number is a field of the quote.
// Discounts are shown once, in the totals: each line already shows its amount after discount.
export function QuoteLines({ quote, catalog, state }: Props) {
  const groups = groupLines(quote, state);
  const nameOf = (line: Line) => productById(catalog, line.productId)?.displayName ?? "Item";

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <section key={group.key} aria-label={group.title}>
          <h4 className="text-sm font-semibold text-ink">{group.title}</h4>
          {group.subtitle && <p className="text-sm text-ink/70">{group.subtitle}</p>}
          <ul className="mt-1 divide-y divide-ink/10">
            {group.lines.map((line, index) => (
              <li key={`${line.productId}-${line.date ?? "x"}-${index}`} className="py-1.5 text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-ink/85">
                    {nameOf(line)}
                    {line.date && <span className="text-ink/70"> · {formatDay(line.date)}</span>}
                    {line.qty > 1 && (
                      <span className="text-ink/70">
                        {" "}
                        · {line.qty} × <Money cents={line.unitPriceCents} />
                      </span>
                    )}
                  </span>
                  <Money cents={line.lineTotalCents} className="shrink-0 text-ink" />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function QuoteTotals({ quote }: { quote: QuoteResponse }) {
  const promo = quote.promo.status === "applied" ? quote.promo.code : null;
  return (
    <dl className="space-y-1 border-t border-line pt-3 text-sm">
      <div className="flex justify-between">
        <dt className="text-ink/80">Subtotal</dt>
        <dd>
          <Money cents={quote.subtotalCents} />
        </dd>
      </div>
      {quote.discountCents > 0 && (
        <div className="flex justify-between text-success-text">
          <dt>Discount{promo ? ` (${promo})` : ""}</dt>
          <dd className="tabular-nums">
            −<Money cents={quote.discountCents} />
          </dd>
        </div>
      )}
      <div className="flex items-baseline justify-between pt-1">
        <dt className="font-semibold">Total</dt>
        <dd className="font-serif text-2xl font-semibold text-gold-ink">
          <Money cents={quote.totalCents} />
        </dd>
      </div>
    </dl>
  );
}

function groupLines(quote: QuoteResponse, state: Props["state"]): Group[] {
  const groups: Group[] = [];
  for (const attendee of state.attendees) {
    const lines = quote.lines.filter((l) => l.attendeeClientId === attendee.clientId);
    if (lines.length > 0) {
      groups.push({ key: attendee.clientId, title: attendeeName(attendee), lines });
    }
  }
  for (const group of state.familyGroups) {
    const lines = quote.lines.filter((l) => l.familyGroupId === group.id);
    if (lines.length === 0) continue;
    const members = state.attendees
      .filter((a) => group.attendeeClientIds.includes(a.clientId))
      .map((a) => a.firstName.trim() || "Guest");
    groups.push({
      key: group.id,
      title: `Family pass · ${formatDay(group.date)}`,
      subtitle: members.join(", "),
      lines,
    });
  }
  const rest = quote.lines.filter((l) => l.attendeeClientId === null && l.familyGroupId === null);
  if (rest.length > 0) groups.push({ key: "booking", title: "For the group", lines: rest });
  return groups;
}
