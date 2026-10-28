import type { IsoDate } from "./calendar";

// percent: value is whole percent (10 = 10%); fixed: value is cents; free_child_entry: value unused.
export const PROMO_KINDS = ["percent", "fixed", "free_child_entry"] as const;
export type PromoKind = (typeof PROMO_KINDS)[number];

export interface Promo {
  code: string;
  kind: PromoKind;
  value: number;
  validFrom: IsoDate | null; // inclusive, event timezone (D21)
  validTo: IsoDate | null; // inclusive: valid through 23:59:59 local on this day
  maxRedemptions: number | null;
  redemptions: number;
}

// Codes are matched case-insensitively with surrounding spaces ignored.
export function normalizePromoCode(input: string): string {
  return input.trim().toUpperCase();
}

export type PromoEvaluation =
  | { status: "none" }
  | { status: "unknown"; code: string }
  | { status: "not_yet_valid"; code: string; validFrom: IsoDate }
  | { status: "expired"; code: string; validTo: IsoDate }
  | { status: "exhausted"; code: string }
  | { status: "valid"; promo: Promo };

// `promo` is whatever the repository found for the normalized code (or null).
// An invalid code never blocks a booking: it is reported and ignored (§5.5).
export function evaluatePromo(
  entered: string | undefined,
  promo: Promo | null,
  today: IsoDate,
): PromoEvaluation {
  const code = normalizePromoCode(entered ?? "");
  if (code === "") return { status: "none" };
  if (!promo || normalizePromoCode(promo.code) !== code) return { status: "unknown", code };
  if (promo.validFrom && today < promo.validFrom) {
    return { status: "not_yet_valid", code, validFrom: promo.validFrom };
  }
  if (promo.validTo && today > promo.validTo) {
    return { status: "expired", code, validTo: promo.validTo };
  }
  if (promo.maxRedemptions !== null && promo.redemptions >= promo.maxRedemptions) {
    return { status: "exhausted", code };
  }
  return { status: "valid", promo };
}
