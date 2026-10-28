import { extraAt } from "./to-request";
import type { BookingState, Step } from "./types";

// Maps a server error path (problem+json `details[].path`, e.g.
// ["attendees", 1, "entry", "productId"]) to the step and form field it belongs to.

export interface FieldTarget {
  step: Step;
  fieldId: string;
}

export const STEP_HEADING_ID = "step-heading";

export const fieldIds = {
  attendee: (clientId: string) => `attendee-${clientId}`,
  attendeeField: (clientId: string, field: "firstName" | "lastName" | "dateOfBirth") =>
    `attendee-${clientId}-${field}`,
  entry: (clientId: string) => `attendee-${clientId}-entry`,
  familyGroup: (groupId: string) => `family-${groupId}`,
  attendeeExtra: (productId: string, clientId: string) => `extra-${productId}-${clientId}`,
  bookingExtra: (productId: string) => `extra-${productId}`,
  booker: (field: string) => `booker-${field}`,
  promo: "promo-code",
  addPerson: "add-person",
};

type Source = Pick<
  BookingState,
  "attendees" | "familyGroups" | "attendeeExtras" | "bookingExtras" | "promoCode"
>;

export function fieldTargetFor(state: Source, path: readonly (string | number)[]): FieldTarget {
  const [section, index, field] = path;
  const at = typeof index === "number" ? index : -1;

  if (section === "attendees") {
    const attendee = state.attendees[at];
    if (!attendee) return { step: "who", fieldId: STEP_HEADING_ID };
    if (field === "firstName" || field === "lastName" || field === "dateOfBirth") {
      return { step: "who", fieldId: fieldIds.attendeeField(attendee.clientId, field) };
    }
    if (field === "entry") return { step: "passes", fieldId: fieldIds.entry(attendee.clientId) };
    return { step: "passes", fieldId: fieldIds.attendee(attendee.clientId) };
  }

  if (section === "familyGroups") {
    const group = state.familyGroups[at];
    return { step: "passes", fieldId: group ? fieldIds.familyGroup(group.id) : STEP_HEADING_ID };
  }

  if (section === "extras") {
    const extra = extraAt(state, at);
    if (!extra) return { step: "extras", fieldId: STEP_HEADING_ID };
    return {
      step: "extras",
      fieldId:
        extra.attendeeClientId === null
          ? fieldIds.bookingExtra(extra.productId)
          : fieldIds.attendeeExtra(extra.productId, extra.attendeeClientId),
    };
  }

  if (section === "booker") {
    return {
      step: "pay",
      fieldId: fieldIds.booker(typeof index === "string" ? index : "firstName"),
    };
  }

  if (section === "promoCode") return { step: "review", fieldId: fieldIds.promo };
  return { step: "passes", fieldId: STEP_HEADING_ID };
}
