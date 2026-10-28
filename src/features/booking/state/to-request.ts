import type { CreateBookingRequest } from "@/contracts/requests";
import type { BookingDraft, EntryInput, ExtraInput } from "@/domain/booking";
import type { BookingState, EntryDraft } from "./types";

// BookingState → the request bodies in src/contracts/requests.ts. Pure, and
// deterministic: the same state always gives the same body (and fingerprint).

type DraftSource = Pick<
  BookingState,
  "attendees" | "familyGroups" | "attendeeExtras" | "bookingExtras" | "promoCode"
>;

function toEntry(entry: EntryDraft): EntryInput {
  return entry.kind === "day_pass" ? { ...entry, dates: [...entry.dates].sort() } : { ...entry };
}

// Per-person extras first, then per-booking ones; `extraAt` relies on this order.
function toExtras(state: DraftSource): ExtraInput[] {
  return [
    ...state.attendeeExtras
      .filter((e) => e.dates.length > 0)
      .map((e) => ({
        productId: e.productId,
        attendeeClientId: e.attendeeClientId,
        dates: [...e.dates].sort(),
      })),
    ...state.bookingExtras
      .filter((e) => e.quantity > 0)
      .map((e) => ({ productId: e.productId, quantity: e.quantity })),
  ];
}

export function toBookingDraft(state: DraftSource): BookingDraft {
  const promoCode = state.promoCode.trim();
  return {
    attendees: state.attendees.map((a) => ({
      clientId: a.clientId,
      firstName: a.firstName.trim(),
      lastName: a.lastName.trim(),
      dateOfBirth: a.dateOfBirth,
      entry: toEntry(a.entry),
    })),
    familyGroups: state.familyGroups.map((g) => ({
      id: g.id,
      productId: g.productId,
      date: g.date,
      attendeeClientIds: [...g.attendeeClientIds],
    })),
    extras: toExtras(state),
    ...(promoCode === "" ? {} : { promoCode }),
  };
}

export function toCreateBookingRequest(
  state: DraftSource & Pick<BookingState, "booker">,
  eventSlug: string,
): CreateBookingRequest {
  const { booker } = state;
  return {
    ...toBookingDraft(state),
    eventSlug,
    booker: {
      firstName: booker.firstName.trim(),
      lastName: booker.lastName.trim(),
      email: booker.email.trim(),
      phone: booker.phone.trim(),
      dateOfBirth: booker.dateOfBirth,
      isAttending: booker.isAttending,
    },
  };
}

// Identifies a request body, so a retry of the same body reuses its idempotency key.
export function requestFingerprint(body: BookingDraft | CreateBookingRequest): string {
  return JSON.stringify(body);
}

// Which draft row `extras[index]` in an error path refers to.
export function extraAt(
  state: DraftSource,
  index: number,
): { productId: string; attendeeClientId: string | null } | null {
  const extra = toExtras(state)[index];
  if (!extra) return null;
  return "attendeeClientId" in extra
    ? { productId: extra.productId, attendeeClientId: extra.attendeeClientId }
    : { productId: extra.productId, attendeeClientId: null };
}
