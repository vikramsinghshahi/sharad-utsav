import type { DomainErrorCode, DomainIssue } from "@/domain/errors";

type Params = Record<string, string | number>;

const text = (value: string | number | undefined, fallback: string) =>
  value === undefined ? fallback : String(value);

// One friendly sentence per rule code: helpful, not scolding (SPEC §9.3).
// Tests assert on codes; only people read these.
const MESSAGES: Record<DomainErrorCode, (p: Params) => string> = {
  INVALID_DOB: (p) =>
    p.reason === "future"
      ? "That date of birth is in the future."
      : p.reason === "implausible"
        ? "Please check the year of birth."
        : "Please enter a date of birth as YYYY-MM-DD.",
  INFANT_MUST_NOT_HAVE_TICKET: () => "Children under 5 come free and don't need a ticket.",
  AGE_BAND_MISMATCH: (p) =>
    p.ageBand === "child"
      ? `They are ${text(p.age, "")} on 10 Nov, so they need a child ticket.`
      : `They are ${text(p.age, "")} on 10 Nov, so they need an adult ticket.`,
  BOOKER_UNDER_18: () => "The person paying needs to be 18 or over.",
  ENTRY_REQUIRED: () => "Please choose a ticket for this person.",
  INVALID_DAYS: (p) =>
    p.reason === "empty"
      ? "Please pick at least one day."
      : p.reason === "duplicate"
        ? "That day is selected twice."
        : "Please pick days between 10 and 14 Nov.",
  FAMILY_PASS_COMPOSITION: (p) =>
    p.reason === "not_in_group"
      ? "This person is set to a family pass but isn't in one."
      : p.reason === "member_has_other_entry"
        ? "Someone in this family pass already has a different ticket."
        : p.reason === "two_passes_same_day"
          ? "A person can only be in one family pass per day."
          : "A family pass covers 1–2 adults and up to 2 children.",
  DAY_NOT_ON_SALE: (p) =>
    p.reason === "all_days_closed"
      ? "All-day passes stopped selling when the festival began. Day passes are still available."
      : "That day is no longer on sale.",
  PRODUCT_UNAVAILABLE: () => "That ticket or extra isn't available.",
  EMPTY_BOOKING: () => "Add at least one person with a ticket.",
  CHILD_UNACCOMPANIED: (p) =>
    `${text(p.firstName, "This child")} needs someone aged 18 or over with them${p.dates ? ` on ${p.dates}` : ""}.`,
  GROUP_TOO_LARGE: (p) =>
    `Bookings are limited to ${text(p.max, "20")} people. For larger groups, please contact the temple.`,
  DUPLICATE_ID: () => "This item appears twice.",
  UNKNOWN_ATTENDEE: () => "That person isn't in this booking.",
  EXTRA_REQUIRES_ENTRY: (p) =>
    `${text(p.firstName, "They")} need to be attending on ${text(p.date, "that day")} for this extra.`,
  EXTRA_DAY_NOT_ALLOWED: (p) => `This doesn't run on ${text(p.date, "that day")}.`,
  QUANTITY_OUT_OF_RANGE: (p) => `You can add up to ${text(p.max, "")} per booking.`,
  INVALID_QUANTITY: () => "Please enter a whole number of 1 or more.",
  EXTRA_AGE_NOT_ALLOWED: () => "This isn't available for children under 5.",
  SOLD_OUT: () => "Sorry, this has sold out.",
  INSUFFICIENT_STOCK: (p) => `Only ${text(p.remaining, "a few")} left. Please reduce the quantity.`,
};

export function messageFor(issue: Pick<DomainIssue, "code" | "params">): string {
  return MESSAGES[issue.code](issue.params ?? {});
}
