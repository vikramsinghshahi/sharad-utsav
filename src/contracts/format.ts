// Display formatting shared by the API's messages and the UI, so both print
// dates and money the same way. Display only: no value here is ever used in a calculation.

const moneyFormatters = new Map<string, Intl.NumberFormat>();

// Integer cents → "$146.70", in the event's own currency.
export function formatMoney(cents: number, currency: string): string {
  let formatter = moneyFormatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-US", { style: "currency", currency });
    moneyFormatters.set(currency, formatter);
  }
  return formatter.format(cents / 100);
}

// ISO dates are calendar days in the event timezone. Formatting them at noon UTC
// means no timezone can shift them onto the neighbouring day.
const atNoonUtc = (isoDate: string) => new Date(`${isoDate}T12:00:00Z`);

// Parts in US English ("Sep", not en-GB "Sept"), assembled day-first: "Wed 11 Nov".
const PARTS = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function parts(isoDate: string) {
  const all = PARTS.formatToParts(atNoonUtc(isoDate));
  const get = (type: Intl.DateTimeFormatPartTypes) => all.find((p) => p.type === type)?.value ?? "";
  return { weekday: get("weekday"), day: get("day"), month: get("month"), year: get("year") };
}

/** "Wed 11 Nov" */
export function formatDay(isoDate: string): string {
  const p = parts(isoDate);
  return `${p.weekday} ${p.day} ${p.month}`;
}

/** { weekday: "Wed", day: "11" } for compact day chips */
export function dayParts(isoDate: string): { weekday: string; day: string } {
  const p = parts(isoDate);
  return { weekday: p.weekday, day: p.day };
}

/** "30 Sep 2026" */
export function formatLongDate(isoDate: string): string {
  const p = parts(isoDate);
  return `${p.day} ${p.month} ${p.year}`;
}

/** "Tue 10 Nov, Thu 12 Nov" — accepts an array or a comma-separated string of ISO dates. */
export function formatDays(isoDates: readonly string[] | string): string {
  const list = typeof isoDates === "string" ? isoDates.split(",").map((d) => d.trim()) : isoDates;
  return list.filter(Boolean).map(formatDay).join(", ");
}

/** "Tue 10 – Sat 14 Nov 2026" (or across months: "Mon 30 Nov – Tue 1 Dec 2026") */
export function formatDateRange(firstIso: string, lastIso: string): string {
  const first = parts(firstIso);
  const last = parts(lastIso);
  if (firstIso === lastIso) return `${formatDay(firstIso)} ${first.year}`;
  const start =
    first.month === last.month && first.year === last.year
      ? `${first.weekday} ${first.day}`
      : `${first.weekday} ${first.day} ${first.month}`;
  return `${start} – ${last.weekday} ${last.day} ${last.month} ${last.year}`;
}
