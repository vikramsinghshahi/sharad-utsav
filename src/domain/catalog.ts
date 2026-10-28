import { z } from "zod";
import { ageBandSchema } from "./age";

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
