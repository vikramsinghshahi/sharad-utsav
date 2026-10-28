// Display formatting only. Every amount shown comes from the server; this just prints it.

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function formatMoney(cents: number): string {
  return USD.format(cents / 100);
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
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    PARTS.formatToParts(atNoonUtc(isoDate)).find((p) => p.type === type)?.value ?? "";
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

export function formatDays(isoDates: readonly string[]): string {
  return isoDates.map(formatDay).join(", ");
}

/** "14:59" style countdown */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
