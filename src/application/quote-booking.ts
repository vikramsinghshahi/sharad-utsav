import type { BookingDraft } from "@/domain/booking";
import type { Quote } from "@/domain/pricing/types";
import { saleClock } from "@/domain/sales-window";
import type { Dependencies } from "./ports";
import { priceDraft } from "./price-draft";
import { failure, success, type UseCaseResult } from "./result";

// Prices a draft with no side effects. Advisory: create re-prices (D15).
export async function quoteBooking(
  deps: Pick<Dependencies, "clock" | "catalogs" | "promos" | "bookings">,
  slug: string,
  draft: BookingDraft,
): Promise<UseCaseResult<Quote>> {
  const now = deps.clock.now();
  await deps.bookings.releaseExpiredHolds(now);

  const found = await deps.catalogs.findBySlug(slug);
  if (!found) return failure({ kind: "not_found", resource: "event" });

  const priced = await priceDraft(deps, draft, found, saleClock(found.event.timezone, now));
  if (!priced.ok) {
    return failure(
      priced.kind === "stock"
        ? { kind: "stock", shortage: priced.shortage }
        : { kind: "validation", issues: priced.issues },
    );
  }
  return success(priced.value.quote);
}
