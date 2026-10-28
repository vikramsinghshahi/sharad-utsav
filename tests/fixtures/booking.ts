import type { AttendeeInput, BookingDraft, EntryInput } from "@/domain/booking";
import { toIsoDate } from "@/domain/calendar";
import { toProductId, type Catalog, type Product } from "@/domain/catalog";
import { validateBooking, type ValidatedBooking } from "@/domain/eligibility";
import { toCents } from "@/domain/money";
import { evaluatePromo, type Promo } from "@/domain/promo";
import { priceBooking } from "@/domain/pricing/pipeline";
import type { Quote } from "@/domain/pricing/types";
import { saleClock, type SaleClock } from "@/domain/sales-window";
import {
  EVENT,
  FESTIVAL_DATES,
  PRODUCTS,
  PROMOS,
  SAME_DAY_CUTOFF,
} from "@/infrastructure/db/seed-data";

// Test catalog built from the same data as the DB seed, with product id = code.
type ProductCode = (typeof PRODUCTS)[number]["code"];

export function buildCatalog(
  overrides: Partial<Record<ProductCode, Partial<Pick<Product, "remaining" | "active">>>> = {},
): Catalog {
  return {
    eventSlug: EVENT.slug,
    timezone: EVENT.timezone,
    days: FESTIVAL_DATES.map((date) => ({ date: toIsoDate(date), cutoffTime: SAME_DAY_CUTOFF })),
    products: PRODUCTS.map(({ stock, ...product }) => ({
      ...product,
      id: toProductId(product.code),
      priceCents: toCents(product.priceCents),
      active: true,
      remaining: stock,
      ...overrides[product.code],
    })),
  };
}

// Today is 28 Oct 2026, noon in Texas: before the festival, everything on sale.
export const BEFORE_FESTIVAL = saleClock(EVENT.timezone, new Date("2026-10-28T12:00:00-05:00"));

export function clockAt(localIso: string): SaleClock {
  return saleClock(EVENT.timezone, new Date(localIso));
}

// Dates of birth giving these ages on 10 Nov 2026 (D1).
export const DOB = {
  adult40: "1986-05-01",
  adult18: "2008-01-01",
  teen13: "2013-01-01",
  child7: "2019-06-01",
  child9: "2017-03-15",
  infant2: "2024-03-01",
} as const;

export const ALL_DAYS = [...FESTIVAL_DATES];

let nextId = 0;
export function person(
  dateOfBirth: string,
  entry: EntryInput,
  overrides: Partial<AttendeeInput> = {},
): AttendeeInput {
  nextId += 1;
  return {
    clientId: `p${nextId}`,
    firstName: `Person${nextId}`,
    lastName: "Patel",
    dateOfBirth,
    entry,
    ...overrides,
  };
}

export const dayPass = (code: "DAY_ADULT" | "DAY_CHILD", dates: string[]): EntryInput => ({
  kind: "day_pass",
  productId: code,
  dates,
});
export const allDays = (code: "ALLDAY_ADULT" | "ALLDAY_CHILD"): EntryInput => ({
  kind: "all_days",
  productId: code,
});
export const familyEntry: EntryInput = { kind: "family_pass" };
export const noEntry: EntryInput = { kind: "none" };

export function draft(partial: Partial<BookingDraft>): BookingDraft {
  return { attendees: [], familyGroups: [], extras: [], ...partial };
}

export function validate(booking: BookingDraft, catalog = buildCatalog(), clock = BEFORE_FESTIVAL) {
  return validateBooking(booking, catalog, clock);
}

export function mustValidate(
  booking: BookingDraft,
  catalog = buildCatalog(),
  clock = BEFORE_FESTIVAL,
): ValidatedBooking {
  const result = validateBooking(booking, catalog, clock);
  if (!result.ok) throw new Error(`Expected valid booking, got ${JSON.stringify(result.issues)}`);
  return result.value;
}

export function promoRow(code: string): Promo {
  const seed = PROMOS.find((p) => p.code === code);
  if (!seed) throw new Error(`No seed promo ${code}`);
  return {
    ...seed,
    validFrom: seed.validFrom === null ? null : toIsoDate(seed.validFrom),
    validTo: seed.validTo === null ? null : toIsoDate(seed.validTo),
  };
}

// Validate + price in one go, the way the quote use-case will.
export function quote(
  booking: BookingDraft,
  { catalog = buildCatalog(), clock = BEFORE_FESTIVAL } = {},
): Quote {
  const validated = mustValidate(booking, catalog, clock);
  const code = booking.promoCode;
  const row = code ? (PROMOS.find((p) => p.code === code.trim().toUpperCase()) ?? null) : null;
  const promo = evaluatePromo(code, row ? promoRow(row.code) : null, clock.today);
  return priceBooking({ booking: validated, catalog, clock, promo });
}
