// Calendar dates as "YYYY-MM-DD" strings, interpreted in the event timezone.
// ISO dates compare correctly as strings, so no Date math is needed for ordering.
export type IsoDate = string & { readonly __brand: "IsoDate" };

export interface DateParts {
  year: number;
  month: number; // 1–12
  day: number;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

// Returns null for malformed strings and impossible dates such as 2026-02-30.
export function parseIsoDate(input: string): IsoDate | null {
  const match = ISO_DATE.exec(input);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const probe = new Date(Date.UTC(year, month - 1, day));
  const isRealDate =
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day;
  return isRealDate ? (input as IsoDate) : null;
}

export function toIsoDate(input: string): IsoDate {
  const date = parseIsoDate(input);
  if (date === null) throw new RangeError(`Not a valid ISO date: "${input}"`);
  return date;
}

export function dateParts(date: IsoDate): DateParts {
  const [year, month, day] = date.split("-").map(Number);
  return { year: year ?? 0, month: month ?? 0, day: day ?? 0 };
}

export interface LocalDateTime {
  date: IsoDate;
  time: string; // "HH:MM:SS", 24-hour
}

// The wall-clock date and time it currently is in `timeZone` (e.g. "America/Chicago").
// `now` is passed in so callers control the clock and tests stay deterministic.
export function localDateTimeIn(timeZone: string, now: Date): LocalDateTime {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: toIsoDate(`${get("year")}-${get("month")}-${get("day")}`),
    time: `${get("hour")}:${get("minute")}:${get("second")}`,
  };
}

export function todayIn(timeZone: string, now: Date): IsoDate {
  return localDateTimeIn(timeZone, now).date;
}
