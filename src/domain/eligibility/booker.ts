import { checkBookerAge, parseDateOfBirth } from "../age";
import type { BookerInput } from "../booking";
import type { IsoDate } from "../calendar";
import { ok, type Result } from "../result";
import type { SaleClock } from "../sales-window";

export type ValidatedBooker = Omit<BookerInput, "dateOfBirth"> & { dateOfBirth: IsoDate };

// A5 + A6 for the person paying. Checked when the booking is created, not on
// quotes, because contact details are collected after the review step.
export function validateBooker(booker: BookerInput, clock: SaleClock): Result<ValidatedBooker> {
  const path = ["booker", "dateOfBirth"];
  const dob = parseDateOfBirth(booker.dateOfBirth, clock.today, path);
  if (!dob.ok) return dob;
  const adult = checkBookerAge(dob.value, clock.today, path);
  if (!adult.ok) return adult;
  return ok({ ...booker, dateOfBirth: dob.value });
}
