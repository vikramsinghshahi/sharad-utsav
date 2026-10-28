import type { AgeBand } from "../age";
import type { IsoDate } from "../calendar";
import type { ExtraProduct, PassProduct } from "../catalog";
import type { IssuePath } from "../errors";

// The output of eligibility: a booking whose every rule has been checked, with
// ages derived and products resolved. Pricing only ever sees this shape.

export type ValidatedEntry =
  | { kind: "none" }
  | { kind: "day_pass"; product: PassProduct; dates: IsoDate[] }
  | { kind: "all_days"; product: PassProduct }
  | { kind: "family_pass" };

export interface ValidatedAttendee {
  index: number; // position in the draft, for error paths
  clientId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: IsoDate;
  age: number; // on the festival's first day (D1)
  ageBand: AgeBand;
  entry: ValidatedEntry;
  // Days this person is at the festival. Infants attend the days their
  // responsible adults attend (D5), which is what lets infants have dinner (D12).
  attendanceDates: IsoDate[];
}

export interface ValidatedFamilyGroup {
  id: string;
  product: PassProduct;
  date: IsoDate;
  memberClientIds: string[];
}

export type ValidatedExtra =
  | { scope: "per_booking"; index: number; product: ExtraProduct; quantity: number }
  | {
      scope: "per_attendee";
      index: number; // position in the draft, for error paths
      product: ExtraProduct;
      attendeeClientId: string;
      dates: IsoDate[];
    };

// Non-blocking: shown to the user, never rejects the booking.
export interface BookingWarning {
  code: "POSSIBLE_DUPLICATE_ATTENDEE"; // D18
  path: IssuePath;
  params: Record<string, string | number>;
}

export interface ValidatedBooking {
  attendees: ValidatedAttendee[];
  familyGroups: ValidatedFamilyGroup[];
  extras: ValidatedExtra[];
  warnings: BookingWarning[];
}
