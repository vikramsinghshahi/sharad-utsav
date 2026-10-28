import type { BookingResponse } from "@/contracts/responses";
import type { Dependencies } from "./ports";
import { failure, success, type UseCaseResult } from "./result";

// Confirmation page data. A wrong token looks exactly like a missing booking,
// so the endpoint can't be used to discover which booking ids exist.
export async function getBooking(
  deps: Pick<Dependencies, "clock" | "bookings" | "secrets">,
  bookingId: string,
  token: string,
): Promise<UseCaseResult<BookingResponse>> {
  // Lazy cleanup, so a lapsed hold reads as expired rather than "held" (D16).
  await deps.bookings.releaseExpiredHolds(deps.clock.now());
  const details = await deps.bookings.findDetails(bookingId);
  if (!details || !deps.secrets.tokenMatches(token, details.accessTokenHash)) {
    return failure({ kind: "not_found", resource: "booking" });
  }

  return success({
    bookingId: details.id,
    event: details.event,
    status: details.status,
    confirmationCode: details.confirmationCode,
    holdExpiresAt: details.holdExpiresAt?.toISOString() ?? null,
    booker: details.booker,
    attendees: details.attendees,
    lines: details.lines,
    subtotalCents: details.subtotalCents,
    discountCents: details.discountCents,
    totalCents: details.totalCents,
    promoCode: details.promoCode,
    qrPayload: details.status === "confirmed" ? details.confirmationCode : null,
  });
}
