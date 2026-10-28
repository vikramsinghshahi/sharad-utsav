// percent: value is whole percent (10 = 10%); fixed: value is cents; free_child_entry: value unused.
export const PROMO_KINDS = ["percent", "fixed", "free_child_entry"] as const;
export type PromoKind = (typeof PROMO_KINDS)[number];
