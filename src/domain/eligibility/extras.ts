import { AGE_BANDS, type AgeBand } from "../age";
import type { ExtraInput } from "../booking";
import { isExtraProduct, type ExtraProduct } from "../catalog";
import { issue, type IssuePath } from "../errors";
import { fail, IssueCollector, ok, type Result } from "../result";
import { resolveProduct, validateDates, type EligibilityContext } from "./context";
import type { ValidatedAttendee, ValidatedExtra } from "./types";

export function validateExtras(
  extras: readonly ExtraInput[],
  attendees: ReadonlyMap<string, ValidatedAttendee>,
  ctx: EligibilityContext,
): Result<ValidatedExtra[]> {
  const issues = new IssueCollector();
  const validated: ValidatedExtra[] = [];

  extras.forEach((extra, index) => {
    const path: IssuePath = ["extras", index];
    const product = issues.take(
      resolveProduct(extra.productId, ctx, [...path, "productId"], isExtraProduct),
    );
    if (!product) return;
    const result =
      "quantity" in extra
        ? validatePerBooking(extra.quantity, product, index)
        : validatePerAttendee(extra, product, attendees, ctx, index);
    const value = issues.take(result);
    if (value) validated.push(value);
  });

  issues.add(...checkNoRepeatedDays(validated));
  issues.add(...checkMaxPerBooking(validated));
  return issues.finish(mergePerBooking(validated));
}

function validatePerBooking(
  quantity: number,
  product: ExtraProduct,
  index: number,
): Result<ValidatedExtra> {
  const path: IssuePath = ["extras", index];
  if (product.rule.scope !== "per_booking") {
    return fail(issue("PRODUCT_UNAVAILABLE", [...path, "productId"], { reason: "per_attendee" }));
  }
  // X4: positive whole numbers only.
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    return fail(issue("INVALID_QUANTITY", [...path, "quantity"]));
  }
  return ok({ scope: "per_booking", index, product, quantity });
}

function validatePerAttendee(
  extra: { attendeeClientId: string; dates: string[] },
  product: ExtraProduct,
  attendees: ReadonlyMap<string, ValidatedAttendee>,
  ctx: EligibilityContext,
  index: number,
): Result<ValidatedExtra> {
  const path: IssuePath = ["extras", index];
  const { rule } = product;
  if (rule.scope === "per_booking") {
    return fail(issue("PRODUCT_UNAVAILABLE", [...path, "productId"], { reason: "per_booking" }));
  }

  const attendee = attendees.get(extra.attendeeClientId);
  if (!attendee) {
    return fail(
      issue("UNKNOWN_ATTENDEE", [...path, "attendeeClientId"], {
        clientId: extra.attendeeClientId,
      }),
    );
  }

  // D14 and future rules like "Garba is 12+ only".
  if (rule.minAgeBand && bandRank(attendee.ageBand) < bandRank(rule.minAgeBand)) {
    return fail(
      issue("EXTRA_AGE_NOT_ALLOWED", [...path, "attendeeClientId"], {
        firstName: attendee.firstName,
        age: attendee.age,
        minAgeBand: rule.minAgeBand,
      }),
    );
  }

  // X2: only on the days the extra runs.
  const dates = validateDates(extra.dates, ctx, [...path, "dates"], {
    allowedDates: rule.availableDates,
  });
  if (!dates.ok) return dates;

  // X1: only on days the person is at the festival.
  if (rule.requiresEntryOnDay) {
    const issues = new IssueCollector();
    dates.value.forEach((date) => {
      if (!attendee.attendanceDates.includes(date)) {
        issues.add(
          issue("EXTRA_REQUIRES_ENTRY", [...path, "dates", extra.dates.indexOf(date)], {
            firstName: attendee.firstName,
            date,
          }),
        );
      }
    });
    if (issues.hasIssues) return fail(...issues.issues);
  }

  return ok({
    scope: "per_attendee",
    index,
    product,
    attendeeClientId: attendee.clientId,
    dates: dates.value,
  });
}

function bandRank(band: AgeBand): number {
  return AGE_BANDS.indexOf(band);
}

// The same person can't book the same extra twice on one day.
function checkNoRepeatedDays(validated: readonly ValidatedExtra[]) {
  const seen = new Set<string>();
  const issues = [];
  for (const extra of validated) {
    if (extra.scope !== "per_attendee") continue;
    for (const date of extra.dates) {
      const key = `${extra.product.id}|${extra.attendeeClientId}|${date}`;
      if (seen.has(key)) {
        issues.push(
          issue("INVALID_DAYS", ["extras", extra.index, "dates"], { reason: "duplicate", date }),
        );
      }
      seen.add(key);
    }
  }
  return issues;
}

// X3 and data-driven caps such as "max 6 dinner plates per booking".
function checkMaxPerBooking(validated: readonly ValidatedExtra[]) {
  const units = new Map<string, { product: ExtraProduct; index: number; count: number }>();
  for (const extra of validated) {
    const count = extra.scope === "per_booking" ? extra.quantity : extra.dates.length;
    const entry = units.get(extra.product.id) ?? {
      product: extra.product,
      index: extra.index,
      count: 0,
    };
    entry.count += count;
    units.set(extra.product.id, entry);
  }
  return [...units.values()]
    .filter(
      ({ product, count }) =>
        product.rule.maxPerBooking !== undefined && count > product.rule.maxPerBooking,
    )
    .map(({ product, index, count }) =>
      issue("QUANTITY_OUT_OF_RANGE", ["extras", index], {
        productCode: product.code,
        max: product.rule.maxPerBooking ?? 0,
        requested: count,
      }),
    );
}

// Two Dandiya lines of 3 and 2 become one line of 5.
function mergePerBooking(validated: readonly ValidatedExtra[]): ValidatedExtra[] {
  const merged: ValidatedExtra[] = [];
  for (const extra of validated) {
    const existing = merged.find(
      (m) =>
        m.scope === "per_booking" &&
        extra.scope === "per_booking" &&
        m.product.id === extra.product.id,
    );
    if (existing?.scope === "per_booking" && extra.scope === "per_booking") {
      existing.quantity += extra.quantity;
    } else {
      merged.push({ ...extra });
    }
  }
  return merged;
}
