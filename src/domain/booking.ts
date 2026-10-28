// Booking lifecycle (SPEC §8.1). Transitions are guarded by the expected current status.
export const BOOKING_STATUSES = [
  "pending_payment",
  "confirmed",
  "expired",
  "cancelled",
  "refunded",
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

// Every attendee has exactly one entry kind; infants have "none" (SPEC §3.1).
export const ENTRY_KINDS = ["none", "day_pass", "all_days", "family_pass"] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];
