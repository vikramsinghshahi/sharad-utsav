import { parseIsoDate, type IsoDate } from "../calendar";
import { findProduct, firstFestivalDay, type Catalog, type Product } from "../catalog";
import { issue, type IssuePath } from "../errors";
import { fail, IssueCollector, ok, type Result } from "../result";
import { isDayOnSale, type SaleClock } from "../sales-window";

export interface EligibilityContext {
  catalog: Catalog;
  clock: SaleClock;
  ageReferenceDate: IsoDate; // D1: the festival's first day
}

export function eligibilityContext(catalog: Catalog, clock: SaleClock): EligibilityContext {
  return { catalog, clock, ageReferenceDate: firstFestivalDay(catalog) };
}

// E6: the product exists in this event, is active, and is the right kind.
export function resolveProduct<P extends Product>(
  productId: string,
  ctx: EligibilityContext,
  path: IssuePath,
  isRightKind: (product: Product) => product is P,
): Result<P> {
  const product = findProduct(ctx.catalog, productId);
  if (!product || !product.active || !isRightKind(product)) {
    return fail(issue("PRODUCT_UNAVAILABLE", path, { productId }));
  }
  return ok(product);
}

interface DateRules {
  // Restrict to these dates (Garba: 11 and 13 Nov); undefined = any festival day.
  allowedDates?: readonly string[];
}

// E2 + E5 + X2: at least one date, real, unique, within the festival, on sale.
export function validateDates(
  raw: readonly string[],
  ctx: EligibilityContext,
  path: IssuePath,
  rules: DateRules = {},
): Result<IsoDate[]> {
  if (raw.length === 0) return fail(issue("INVALID_DAYS", path, { reason: "empty" }));

  const issues = new IssueCollector();
  const dates: IsoDate[] = [];
  raw.forEach((input, i) => {
    const at = [...path, i];
    const date = parseIsoDate(input);
    if (date === null) return issues.add(issue("INVALID_DAYS", at, { reason: "format" }));
    if (dates.includes(date)) {
      return issues.add(issue("INVALID_DAYS", at, { reason: "duplicate", date }));
    }
    dates.push(date);

    const day = ctx.catalog.days.find((d) => d.date === date);
    if (!day) return issues.add(issue("INVALID_DAYS", at, { reason: "outside_festival", date }));
    if (rules.allowedDates && !rules.allowedDates.includes(date)) {
      return issues.add(issue("EXTRA_DAY_NOT_ALLOWED", at, { date }));
    }
    if (!isDayOnSale(day, ctx.clock)) return issues.add(issue("DAY_NOT_ON_SALE", at, { date }));
  });

  return issues.finish(dates.sort());
}
