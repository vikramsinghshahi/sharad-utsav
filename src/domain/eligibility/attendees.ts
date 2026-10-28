import { ageBand, ageOn, parseDateOfBirth, type AgeBand } from "../age";
import { isPassProduct, type PassProduct, type Product } from "../catalog";
import type { AttendeeInput, EntryInput } from "../booking";
import { issue, type IssuePath } from "../errors";
import { fail, ok, type Result } from "../result";
import { isAllDaysOnSale } from "../sales-window";
import { resolveProduct, validateDates, type EligibilityContext } from "./context";
import type { ValidatedAttendee, ValidatedEntry } from "./types";

// An attendee before attendance days are known (those need the whole group).
export type AttendeeCore = Omit<ValidatedAttendee, "attendanceDates">;

const isDayPass = (p: Product): p is PassProduct =>
  isPassProduct(p) && p.rule.dayScope === "chosen_days";
const isAllDaysPass = (p: Product): p is PassProduct =>
  isPassProduct(p) && p.rule.dayScope === "all_days";

export function validateAttendee(
  input: AttendeeInput,
  index: number,
  ctx: EligibilityContext,
): Result<AttendeeCore> {
  const path: IssuePath = ["attendees", index];

  const dob = parseDateOfBirth(input.dateOfBirth, ctx.clock.today, [...path, "dateOfBirth"]);
  if (!dob.ok) return dob;

  const age = ageOn(dob.value, ctx.ageReferenceDate);
  const band = ageBand(age);
  const entry = validateEntry(input.entry, band, age, ctx, [...path, "entry"]);
  if (!entry.ok) return entry;

  return ok({
    index,
    clientId: input.clientId,
    firstName: input.firstName,
    lastName: input.lastName,
    dateOfBirth: dob.value,
    age,
    ageBand: band,
    entry: entry.value,
  });
}

function validateEntry(
  entry: EntryInput,
  band: AgeBand,
  age: number,
  ctx: EligibilityContext,
  path: IssuePath,
): Result<ValidatedEntry> {
  // A2: under-5s are free and hold no ticket; E1: everyone else holds exactly one.
  if (band === "infant") {
    return entry.kind === "none"
      ? ok({ kind: "none" })
      : fail(issue("INFANT_MUST_NOT_HAVE_TICKET", path, { age }));
  }

  switch (entry.kind) {
    case "none":
      return fail(issue("ENTRY_REQUIRED", path, { age }));

    case "family_pass":
      // Membership and composition are checked with the family groups.
      return ok({ kind: "family_pass" });

    case "day_pass": {
      const product = resolveProduct(entry.productId, ctx, [...path, "productId"], isDayPass);
      if (!product.ok) return product;
      const bandIssue = checkAgeBand(product.value, band, age, ctx, [...path, "productId"]);
      if (bandIssue) return bandIssue;
      const dates = validateDates(entry.dates, ctx, [...path, "dates"]);
      if (!dates.ok) return dates;
      return ok({ kind: "day_pass", product: product.value, dates: dates.value });
    }

    case "all_days": {
      const product = resolveProduct(entry.productId, ctx, [...path, "productId"], isAllDaysPass);
      if (!product.ok) return product;
      const bandIssue = checkAgeBand(product.value, band, age, ctx, [...path, "productId"]);
      if (bandIssue) return bandIssue;
      if (!isAllDaysOnSale(ctx.catalog, ctx.clock)) {
        return fail(issue("DAY_NOT_ON_SALE", path, { reason: "all_days_closed" }));
      }
      return ok({ kind: "all_days", product: product.value });
    }
  }
}

// A3/A4: a 7-year-old can never hold an adult ticket, and vice versa.
function checkAgeBand(
  product: PassProduct,
  band: AgeBand,
  age: number,
  ctx: EligibilityContext,
  path: IssuePath,
): Result<never> | undefined {
  if (product.rule.eligibleAgeBand === band) return undefined;
  return fail(
    issue("AGE_BAND_MISMATCH", path, {
      age,
      ageBand: band,
      onDate: ctx.ageReferenceDate,
    }),
  );
}
