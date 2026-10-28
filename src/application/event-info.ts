import type { EventInfo } from "@/contracts/responses";
import type { EventRecord } from "./ports";

// The public face of an event: everything except the internal id.
export function publicEventInfo(event: EventRecord): EventInfo {
  return {
    slug: event.slug,
    name: event.name,
    venue: event.venue,
    tagline: event.tagline,
    timezone: event.timezone,
    currency: event.currency,
  };
}
