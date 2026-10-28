import { ADULT_PRICE_MIN_AGE, CHILD_MIN_AGE, RESPONSIBLE_ADULT_MIN_AGE } from "@/domain/age";
import type { DomainErrorCode, DomainIssue } from "@/domain/errors";
import { formatDay, formatDays } from "./format";

type Params = Record<string, string | number>;

const text = (value: string | number | undefined, fallback: string) =>
  value === undefined ? fallback : String(value);

// Dates arrive as ISO strings in params; print them like the rest of the UI.
const day = (value: string | number | undefined, fallback: string) =>
  typeof value === "string" ? formatDay(value) : fallback;

// One friendly sentence per rule code: helpful, not scolding (SPEC §9.3).
// Tests assert on codes; only people read these. Every age, date and product
// name comes from the domain rules or the issue's params, so another festival
// (other dates, other age bands, other products) needs no edits here.
const MESSAGES: Record<DomainErrorCode, (p: Params) => string> = {
  INVALID_DOB: (p) =>
    p.reason === "future"
      ? "That date of birth is in the future."
      : p.reason === "implausible"
        ? "Please check the year of birth."
        : "Please enter a date of birth as YYYY-MM-DD.",
  INFANT_MUST_NOT_HAVE_TICKET: () =>
    `Children under ${CHILD_MIN_AGE} come free and don't need a ticket.`,
  AGE_BAND_MISMATCH: (p) =>
    `They are ${text(p.age, "")} on ${day(p.onDate, "the first day")}, so they need ${
      p.ageBand === "child" ? "a child" : "an adult"
    } ticket.`,
  BOOKER_UNDER_18: () => `The person paying needs to be ${RESPONSIBLE_ADULT_MIN_AGE} or over.`,
  ENTRY_REQUIRED: () => "Please choose a ticket for this person.",
  INVALID_DAYS: (p) =>
    p.reason === "empty"
      ? "Please pick at least one day."
      : p.reason === "duplicate"
        ? "That day is selected twice."
        : p.firstDate !== undefined && p.lastDate !== undefined
          ? `Please pick days between ${day(p.firstDate, "")} and ${day(p.lastDate, "")}.`
          : "Please pick days during the festival.",
  FAMILY_PASS_COMPOSITION: (p) =>
    p.reason === "not_in_group"
      ? "This person is set to a family pass but isn't in one."
      : p.reason === "member_has_other_entry"
        ? "Someone in this family pass already has a different ticket."
        : p.reason === "two_passes_same_day"
          ? "A person can only be in one family pass per day."
          : p.maxAdults !== undefined && p.maxChildren !== undefined
            ? `A family pass covers 1–${p.maxAdults} adults and up to ${p.maxChildren} children.`
            : "This family pass has the wrong number of adults or children.",
  DAY_NOT_ON_SALE: (p) =>
    p.reason === "all_days_closed"
      ? "All-day passes stopped selling when the festival began. Day passes are still available."
      : `${day(p.date, "That day")} is no longer on sale.`,
  PRODUCT_UNAVAILABLE: () => "That ticket or extra isn't available.",
  EMPTY_BOOKING: () => "Add at least one person with a ticket.",
  CHILD_UNACCOMPANIED: (p) => {
    const list = typeof p.dates === "string" && p.dates !== "" ? p.dates.split(", ") : [];
    const everyDay = list.length > 1 && list.length === p.festivalDayCount;
    const dates = everyDay ? " every day" : list.length > 0 ? ` on ${formatDays(list)}` : "";
    return `${text(p.firstName, "This child")} needs someone aged ${RESPONSIBLE_ADULT_MIN_AGE} or over with them${dates}.`;
  },
  GROUP_TOO_LARGE: (p) =>
    `Bookings are limited to ${text(p.max, "")} people. For larger groups, please contact the organisers.`,
  DUPLICATE_ID: () => "This item appears twice.",
  UNKNOWN_ATTENDEE: () => "That person isn't in this booking.",
  EXTRA_REQUIRES_ENTRY: (p) =>
    `${text(p.firstName, "They")} need to be attending on ${day(p.date, "that day")} for this extra.`,
  EXTRA_DAY_NOT_ALLOWED: (p) => `This doesn't run on ${day(p.date, "that day")}.`,
  QUANTITY_OUT_OF_RANGE: (p) => `You can add up to ${text(p.max, "")} per booking.`,
  INVALID_QUANTITY: () => "Please enter a whole number of 1 or more.",
  EXTRA_AGE_NOT_ALLOWED: (p) =>
    `This isn't available for children under ${
      p.minAgeBand === "adult" ? ADULT_PRICE_MIN_AGE : CHILD_MIN_AGE
    }.`,
  SOLD_OUT: (p) => `Sorry, ${text(p.productName, "this")} has sold out.`,
  INSUFFICIENT_STOCK: (p) =>
    p.productName === undefined
      ? `Only ${text(p.remaining, "a few")} left. Please reduce the quantity.`
      : `Only ${text(p.remaining, "a few")} left for ${p.productName}. Please reduce the quantity.`,
};

export function messageFor(issue: Pick<DomainIssue, "code" | "params">): string {
  return MESSAGES[issue.code](issue.params ?? {});
}
