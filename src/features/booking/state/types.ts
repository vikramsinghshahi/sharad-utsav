import type { ProblemDetails } from "@/contracts/responses";
import type { AgeBand } from "@/domain/age";
import type { AttendeeInput, EntryInput, FamilyGroupInput } from "@/domain/booking";

// The booking flow's whole state, driven by one reducer (SPEC §9.2).

export const STEPS = ["who", "passes", "extras", "review", "pay"] as const;
export type Step = (typeof STEPS)[number];

export const STEP_TITLES: Record<Step, string> = {
  who: "Who's coming",
  passes: "Days & passes",
  extras: "Extras",
  review: "Review",
  pay: "Contact & pay",
};

// Tickets live on people, so the number of people always equals the number of tickets.
export type AttendeeDraft = AttendeeInput;
export type EntryDraft = EntryInput;
export type FamilyGroupDraft = FamilyGroupInput;

// Dinner / Garba: one row per person per product, holding the days they chose.
export interface AttendeeExtraDraft {
  productId: string;
  attendeeClientId: string;
  dates: string[];
}

// Dandiya: one row per product with a quantity.
export interface BookingExtraDraft {
  productId: string;
  quantity: number;
}

export interface BookerDraft {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  isAttending: boolean;
}

// What the reducer needs to know about the festival for its cascades. Set from the catalog.
export interface FestivalInfo {
  firstDay: string; // ages are worked out on this day (D1)
  days: string[];
  // Individual passes by id → the age band they are for (from each product's rule).
  passBands: Record<string, "adult" | "child">;
  // Per-person extras by id → the youngest band allowed (e.g. Garba: child, D14).
  extraMinBands: Record<string, AgeBand>;
  // Family passes by id → how many adults and children one pass covers (D3).
  familyCovers: Record<string, { adult: number; child: number }>;
}

export interface Notice {
  id: string;
  // The person it is about: it is withdrawn as soon as that person's details change again.
  clientId?: string;
  tone: "info" | "warning";
  text: string;
}

// D17: one key per create request body; reused only to retry the same body.
export interface CreateAttempt {
  key: string;
  fingerprint: string;
}

// One key per pay attempt; reused only when retrying after a network failure.
export interface PayAttempt {
  key: string;
  outcome: "succeed" | "decline";
  awaitingRetry: boolean; // true after a network failure (no response)
}

export interface Hold {
  bookingId: string;
  accessToken: string;
  holdExpiresAt: string;
  // The amount that will be charged: the create response's own quote total (D15).
  totalCents: number;
  reviewedTotalCents: number | null; // the total the user last saw on Review (D15)
}

export type FlowError =
  | { kind: "network"; during: "create" | "pay" }
  | { kind: "declined" }
  | { kind: "released" }
  | { kind: "stock"; message: string; step: Step; fix?: { label: string; actions: Action[] } }
  | { kind: "problem"; title: string; detail: string | null; details: ProblemDetails["details"] };

export interface BookingState {
  hydrated: boolean;
  step: Step;
  // The furthest step reached: the stepper lets people jump back and forth up to here.
  furthestStep: Step;
  festival: FestivalInfo | null;
  attendees: AttendeeDraft[];
  familyGroups: FamilyGroupDraft[];
  attendeeExtras: AttendeeExtraDraft[];
  bookingExtras: BookingExtraDraft[];
  promoCode: string;
  booker: BookerDraft;
  notices: Notice[];
  noticeSeq: number;
  createAttempt: CreateAttempt | null;
  payAttempt: PayAttempt | null;
  hold: Hold | null;
  inFlight: "create" | "pay" | null;
  error: FlowError | null;
}

// The part of the state that survives a refresh (sessionStorage).
export type PersistedState = Pick<
  BookingState,
  | "step"
  | "furthestStep"
  | "attendees"
  | "familyGroups"
  | "attendeeExtras"
  | "bookingExtras"
  | "promoCode"
  | "booker"
  | "createAttempt"
  | "payAttempt"
  | "hold"
>;

export type Action =
  | { type: "RESTORE"; saved: PersistedState | null }
  | { type: "CATALOG_LOADED"; festival: FestivalInfo }
  | { type: "GO_TO_STEP"; step: Step }
  | { type: "ADD_ATTENDEE"; clientId: string; prefill?: Partial<AttendeeDraft> }
  | { type: "REMOVE_ATTENDEE"; clientId: string }
  | { type: "SET_NAME"; clientId: string; field: "firstName" | "lastName"; value: string }
  | { type: "SET_DOB"; clientId: string; dateOfBirth: string }
  | { type: "SET_ENTRY"; clientId: string; entry: EntryDraft }
  // Family pass chosen on a person's card: join a pass with room, or start one (D3, D20).
  | {
      type: "CHOOSE_FAMILY_PASS";
      clientId: string;
      newGroup: { id: string; productId: string; date: string };
    }
  | { type: "TOGGLE_DAY"; clientId: string; date: string }
  | { type: "ADD_FAMILY_GROUP"; id: string; productId: string; date: string }
  | { type: "REMOVE_FAMILY_GROUP"; id: string }
  | { type: "SET_FAMILY_GROUP_DATE"; id: string; date: string }
  | { type: "SET_FAMILY_GROUP"; id: string; clientId: string; member: boolean }
  | { type: "SPLIT_FAMILY_GROUP"; id: string; passes: { clientId: string; productId: string }[] }
  | { type: "TOGGLE_EXTRA_DAY"; productId: string; clientId: string; date: string }
  | { type: "SET_EXTRA_QUANTITY"; productId: string; quantity: number }
  | { type: "SET_PROMO"; code: string }
  | { type: "SET_BOOKER"; patch: Partial<BookerDraft> }
  | { type: "DISMISS_NOTICE"; id: string }
  | { type: "CREATE_STARTED"; attempt: CreateAttempt }
  | { type: "CREATE_SUCCEEDED"; hold: Hold }
  | { type: "CREATE_FAILED"; error: FlowError; definite: boolean }
  | { type: "PAY_STARTED"; attempt: PayAttempt }
  | { type: "PAY_FAILED"; error: FlowError; definite: boolean }
  | { type: "HOLD_RELEASED" }
  | { type: "BOOKING_FINISHED" };
