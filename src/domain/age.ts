import { z } from "zod";
import { dateParts, parseIsoDate, type IsoDate } from "./calendar";
import { issue } from "./errors";
import { fail, ok, type Result } from "./result";

// <5 | 5–11 | 12+ (SPEC §5.1)
export const AGE_BANDS = ["infant", "child", "adult"] as const;
export const ageBandSchema = z.enum(AGE_BANDS);
export type AgeBand = z.infer<typeof ageBandSchema>;

export const CHILD_MIN_AGE = 5;
export const ADULT_PRICE_MIN_AGE = 12;
// The person paying, and the responsible adult for children (A5, D6), must be 18+.
export const RESPONSIBLE_ADULT_MIN_AGE = 18;
export const MAX_PLAUSIBLE_AGE = 120;

// Whole years completed on `referenceDate`. A 29 Feb birthday counts as
// passed from 1 Mar in non-leap years.
export function ageOn(dateOfBirth: IsoDate, referenceDate: IsoDate): number {
  const born = dateParts(dateOfBirth);
  const on = dateParts(referenceDate);
  const hadBirthday = on.month > born.month || (on.month === born.month && on.day >= born.day);
  return on.year - born.year - (hadBirthday ? 0 : 1);
}

export function ageBand(age: number): AgeBand {
  if (age < CHILD_MIN_AGE) return "infant";
  if (age < ADULT_PRICE_MIN_AGE) return "child";
  return "adult";
}

export type InvalidDobReason = "format" | "future" | "implausible";

// Validates untrusted DOB input against `today` (in the event timezone).
// Rejects garbage strings, impossible dates, future dates, and ages over 120 (A6).
export function parseDateOfBirth(
  input: string,
  today: IsoDate,
  path: (string | number)[] = [],
): Result<IsoDate> {
  const invalid = (reason: InvalidDobReason) => fail(issue("INVALID_DOB", path, { reason }));

  const dateOfBirth = parseIsoDate(input.trim());
  if (dateOfBirth === null) return invalid("format");
  if (dateOfBirth > today) return invalid("future");
  if (ageOn(dateOfBirth, today) > MAX_PLAUSIBLE_AGE) return invalid("implausible");
  return ok(dateOfBirth);
}

// A5: the booker must be 18+ on the booking date (not the festival date: they pay today).
export function checkBookerAge(
  dateOfBirth: IsoDate,
  bookingDate: IsoDate,
  path: (string | number)[] = ["booker", "dateOfBirth"],
): Result<IsoDate> {
  const age = ageOn(dateOfBirth, bookingDate);
  return age >= RESPONSIBLE_ADULT_MIN_AGE
    ? ok(dateOfBirth)
    : fail(issue("BOOKER_UNDER_18", path, { age }));
}
