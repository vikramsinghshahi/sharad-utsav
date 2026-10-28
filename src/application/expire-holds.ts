import type { ExpireHoldsResponse } from "@/contracts/responses";
import type { Dependencies } from "./ports";

// Safety net behind the lazy cleanup (D16): run by the daily Vercel cron.
export async function expireHolds(
  deps: Pick<Dependencies, "clock" | "bookings">,
): Promise<ExpireHoldsResponse> {
  return { released: await deps.bookings.releaseExpiredHolds(deps.clock.now()) };
}
