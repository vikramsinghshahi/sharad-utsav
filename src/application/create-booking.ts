import type { CreateBookingRequest } from "@/contracts/requests";
import type { CreateBookingResponse } from "@/contracts/responses";
import { HOLD_DURATION_MS } from "@/domain/booking";
import { validateBooker } from "@/domain/eligibility";
import { normalizePromoCode, type PromoEvaluation } from "@/domain/promo";
import { saleClock, type SaleClock } from "@/domain/sales-window";
import type { Dependencies, EventCatalog } from "./ports";
import { priceDraft } from "./price-draft";
import { failure, success, type UseCaseResult } from "./result";

type Result = UseCaseResult<CreateBookingResponse>;

// Validate + re-price + hold stock + reserve promo (SPEC §7, §8.2). The quote in
// the response is what will be charged; it may differ from an earlier quote (D15).
export async function createBooking(
  deps: Dependencies,
  request: CreateBookingRequest,
): Promise<Result> {
  const now = deps.clock.now();
  await deps.bookings.releaseExpiredHolds(now);

  const found = await deps.catalogs.findBySlug(request.eventSlug);
  if (!found) return failure({ kind: "not_found", resource: "event" });
  const clock = saleClock(found.event.timezone, now);

  const result = await attempt(deps, request, found, clock, now);
  if (result !== "promo_unavailable") return result;

  // Someone took the last use of the code meanwhile: re-price without it. The
  // booking still goes ahead and the response shows the new amount.
  const exhausted: PromoEvaluation = {
    status: "exhausted",
    code: normalizePromoCode(request.promoCode ?? ""),
  };
  const retry = await attempt(deps, request, found, clock, now, exhausted);
  if (retry === "promo_unavailable") throw new Error("Promo reserved without a promo applied");
  return retry;
}

async function attempt(
  deps: Dependencies,
  request: CreateBookingRequest,
  found: EventCatalog,
  clock: SaleClock,
  now: Date,
  promoOverride?: PromoEvaluation,
): Promise<Result | "promo_unavailable"> {
  const booker = validateBooker(request.booker, clock);
  const priced = await priceDraft(deps, request, found, clock, promoOverride);
  // Rule problems first (all of them at once); stock only matters for a valid booking.
  const issues = [
    ...(booker.ok ? [] : booker.issues),
    ...(!priced.ok && priced.kind === "validation" ? priced.issues : []),
  ];
  if (issues.length > 0) return failure({ kind: "validation", issues });
  if (!priced.ok) {
    return priced.kind === "stock"
      ? failure({ kind: "stock", shortage: priced.shortage })
      : failure({ kind: "validation", issues: priced.issues });
  }
  if (!booker.ok) return failure({ kind: "validation", issues: booker.issues });

  const { booking, quote, demand, appliedPromo } = priced.value;
  const isFree = quote.totalCents === 0;
  const token = deps.secrets.newAccessToken();
  const id = deps.secrets.newId();
  const confirmationCode = isFree ? deps.secrets.newConfirmationCode() : null;
  const holdExpiresAt = isFree ? null : new Date(now.getTime() + HOLD_DURATION_MS);

  const outcome = await deps.bookings.create({
    id,
    eventId: found.event.id,
    status: isFree ? "confirmed" : "pending_payment",
    booker: booker.value,
    booking,
    quote,
    demand,
    promoCodeId: appliedPromo?.id ?? null,
    accessTokenHash: token.hash,
    confirmationCode,
    holdExpiresAt,
    now,
  });

  if (!outcome.ok) {
    return outcome.reason === "promo_unavailable"
      ? "promo_unavailable"
      : failure({ kind: "stock", shortage: outcome.shortage });
  }

  return success({
    bookingId: id,
    accessToken: token.token,
    status: isFree ? "confirmed" : "pending_payment",
    confirmationCode,
    quote,
    holdExpiresAt: holdExpiresAt?.toISOString() ?? null,
    payment: { provider: deps.payments.name, required: !isFree },
  });
}
