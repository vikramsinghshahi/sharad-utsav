import type { PayRequest } from "@/contracts/requests";
import type { PayResponse } from "@/contracts/responses";
import type { Dependencies } from "./ports";
import { failure, success, type UseCaseResult } from "./result";

// PENDING_PAYMENT → CONFIRMED (SPEC §8.1). A decline leaves the booking pending
// so the customer can retry until the hold expires. The charge happens outside
// any DB transaction: no locks are held across the network.
export async function payBooking(
  deps: Pick<Dependencies, "clock" | "bookings" | "payments" | "secrets">,
  bookingId: string,
  request: PayRequest,
): Promise<UseCaseResult<PayResponse>> {
  const now = deps.clock.now();
  const target = await deps.bookings.findForPayment(bookingId);
  if (!target) return failure({ kind: "not_found", resource: "booking" });

  // Paying an already-confirmed booking is a no-op, not a second charge.
  if (target.status === "confirmed" && target.confirmationCode) {
    return success({ status: "confirmed", confirmationCode: target.confirmationCode });
  }
  if (target.status === "expired") return failure({ kind: "hold_expired" });
  if (target.status !== "pending_payment") {
    return failure({ kind: "invalid_state", status: target.status });
  }
  if (!target.holdExpiresAt || target.holdExpiresAt <= now) {
    await deps.bookings.releaseExpiredHolds(now);
    return failure({ kind: "hold_expired" });
  }

  const charge = await deps.payments.charge({
    bookingId,
    amountCents: target.totalCents,
    simulate: request.outcome,
  });
  const payment = {
    bookingId,
    provider: deps.payments.name,
    providerRef: charge.providerRef,
    amountCents: target.totalCents,
  };

  if (charge.status === "declined") {
    await deps.bookings.recordDeclinedPayment(payment);
    return failure({ kind: "payment_declined" });
  }

  const confirmationCode = deps.secrets.newConfirmationCode();
  const confirmed = await deps.bookings.confirm({ ...payment, confirmationCode, now });
  if (confirmed.ok) return success({ status: "confirmed", confirmationCode });

  // Lost a race: another request confirmed it, or the hold expired mid-payment.
  const latest = await deps.bookings.findForPayment(bookingId);
  if (latest?.status === "confirmed" && latest.confirmationCode) {
    return success({ status: "confirmed", confirmationCode: latest.confirmationCode });
  }
  return failure({ kind: "hold_expired" });
}
