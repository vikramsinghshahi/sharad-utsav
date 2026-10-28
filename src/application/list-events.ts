import type { EventListResponse } from "@/contracts/responses";
import { todayIn } from "@/domain/calendar";
import { publicEventInfo } from "./event-info";
import type { Dependencies } from "./ports";

// Events still to come (or under way), earliest first: what the landing page
// shows. Judged per event in its own timezone.
export async function listEvents(
  deps: Pick<Dependencies, "clock" | "catalogs">,
): Promise<EventListResponse> {
  const now = deps.clock.now();
  const events = await deps.catalogs.listEvents();
  return {
    events: events
      .filter((event) => event.lastDay >= todayIn(event.timezone, now))
      .map((event) => ({
        ...publicEventInfo(event),
        firstDay: event.firstDay,
        lastDay: event.lastDay,
        lowestEntryPriceCents: event.lowestEntryPriceCents,
      })),
  };
}
