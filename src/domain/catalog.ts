import { z } from "zod";
import { ageBandSchema, type AgeBand } from "./age";
import type { IsoDate } from "./calendar";
import type { Cents } from "./money";

// Rules are read from these structured fields, never from a product's display name.

export const PRODUCT_CATEGORIES = ["entry", "extra"] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const PRODUCT_PRICINGS = ["per_person_per_day", "flat", "per_unit"] as const;
export type ProductPricing = (typeof PRODUCT_PRICINGS)[number];

export const passRuleSchema = z.object({
  type: z.literal("pass"),
  dayScope: z.enum(["chosen_days", "all_days", "single_day"]),
  // undefined = composite product (family pass) described by `covers`
  eligibleAgeBand: z.enum(["child", "adult"]).optional(),
  covers: z
    .object({ adult: z.number().int().nonnegative(), child: z.number().int().nonnegative() })
    .optional(),
});
export type PassRule = z.infer<typeof passRuleSchema>;

export const extraRuleSchema = z.object({
  type: z.literal("extra"),
  scope: z.enum(["per_booking", "per_attendee_per_day", "per_attendee_per_session"]),
  // ISO dates (YYYY-MM-DD) the extra runs on; undefined = every festival day
  availableDates: z.array(z.iso.date()).optional(),
  requiresEntryOnDay: z.boolean(),
  minAgeBand: ageBandSchema.optional(),
  maxPerBooking: z.number().int().positive().optional(),
});
export type ExtraRule = z.infer<typeof extraRuleSchema>;

export const productRuleSchema = z.discriminatedUnion("type", [passRuleSchema, extraRuleSchema]);
export type ProductRule = z.infer<typeof productRuleSchema>;

export type ProductId = string & { readonly __brand: "ProductId" };

export function toProductId(value: string): ProductId {
  if (value.length === 0) throw new RangeError("ProductId must not be empty");
  return value as ProductId;
}

export interface Product {
  id: ProductId;
  code: string; // stable machine key; never shown, never renamed
  displayName: string;
  category: ProductCategory;
  priceCents: Cents;
  pricing: ProductPricing;
  rule: ProductRule;
  active: boolean;
  remaining: number; // units left; person-days for per-day products (D8)
}

export type PassProduct = Product & { rule: PassRule };
export type ExtraProduct = Product & { rule: ExtraRule };

export interface FestivalDay {
  date: IsoDate;
  cutoffTime: string; // "HH:MM:SS" local; the day stops selling at this time (D9)
}

// Everything the domain needs to know about one event's catalog.
export interface Catalog {
  eventSlug: string;
  timezone: string;
  days: readonly FestivalDay[]; // sorted by date
  products: readonly Product[];
}

export function firstFestivalDay(catalog: Catalog): IsoDate {
  const first = catalog.days[0];
  if (!first) throw new RangeError(`Event ${catalog.eventSlug} has no festival days`);
  return first.date;
}

export function findProduct(catalog: Catalog, id: string): Product | undefined {
  return catalog.products.find((product) => product.id === id);
}

export function isPassProduct(product: Product): product is PassProduct {
  return product.rule.type === "pass";
}

export function isExtraProduct(product: Product): product is ExtraProduct {
  return product.rule.type === "extra";
}

// The active individual pass for an age band, e.g. the child all-day pass.
export function findIndividualPass(
  catalog: Catalog,
  dayScope: "chosen_days" | "all_days",
  band: Exclude<AgeBand, "infant">,
): PassProduct | undefined {
  return catalog.products
    .filter(isPassProduct)
    .find(
      (product) =>
        product.active &&
        product.rule.dayScope === dayScope &&
        product.rule.eligibleAgeBand === band,
    );
}

// Child day / all-day passes: the lines KIDSFREE makes free (D11). Family passes are not.
export function isChildIndividualPass(product: Product): boolean {
  return (
    isPassProduct(product) &&
    product.rule.eligibleAgeBand === "child" &&
    product.rule.dayScope !== "single_day"
  );
}
