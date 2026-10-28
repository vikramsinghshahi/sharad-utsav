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

export const MAX_ATTENDEES = 20; // E9

// ---------- the draft as the client sends it (shape-checked by Zod, not yet trusted) ----------

export type EntryInput =
  | { kind: "none" }
  | { kind: "day_pass"; productId: string; dates: string[] }
  | { kind: "all_days"; productId: string }
  // Membership lives on FamilyGroupInput only, so there is one source of truth.
  | { kind: "family_pass" };

export interface AttendeeInput {
  clientId: string; // stable id from the browser, for diffing
  firstName: string;
  lastName: string;
  dateOfBirth: string; // age is derived, never sent
  entry: EntryInput;
}

export interface FamilyGroupInput {
  id: string;
  productId: string;
  date: string; // a family pass covers one day (D20: buy one per day)
  attendeeClientIds: string[];
}

export type ExtraInput =
  | { productId: string; quantity: number } // per booking (Dandiya)
  | { productId: string; attendeeClientId: string; dates: string[] }; // per attendee (Dinner, Garba)

export interface BookerInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string; // must be 18+ on the booking date (A5)
  isAttending: boolean; // D7: if true they also appear in attendees[]
}

export interface BookingDraft {
  attendees: AttendeeInput[];
  familyGroups: FamilyGroupInput[];
  extras: ExtraInput[];
  promoCode?: string;
}

// S3: stock is held this long for payment, then released.
export const HOLD_DURATION_MS = 15 * 60 * 1000;
