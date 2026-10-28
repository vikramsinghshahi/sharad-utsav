"use client";

import { createContext, useContext } from "react";
import type { EventInfo } from "@/contracts/responses";
import { formatMoney } from "../format";

// The event being booked (name, venue, currency, timezone), from the API. Components
// read it here instead of assuming one festival or one currency.
const EventContext = createContext<EventInfo | null>(null);

export const EventProvider = EventContext.Provider;

export function useEvent(): EventInfo {
  const event = useContext(EventContext);
  if (!event) throw new Error("useEvent must be used inside <EventProvider>");
  return event;
}

// Formats integer cents in the current event's currency.
export function useMoney(): (cents: number) => string {
  const { currency } = useEvent();
  return (cents) => formatMoney(cents, currency);
}
