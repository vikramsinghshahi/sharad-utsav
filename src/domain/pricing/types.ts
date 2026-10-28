import type { IsoDate } from "../calendar";
import type { Catalog, Product, ProductCategory, ProductId } from "../catalog";
import type { BookingWarning, ValidatedBooking } from "../eligibility";
import type { IssuePath } from "../errors";
import type { Cents } from "../money";
import type { PromoEvaluation, PromoKind } from "../promo";
import type { SaleClock } from "../sales-window";

// A line while the pipeline is running. `discountCents` accumulates from every promo step.
export interface PricedLine {
  product: Product;
  attendeeClientId: string | null;
  familyGroupId: string | null;
  date: IsoDate | null; // the day this line is for; null = not day-specific
  qty: number;
  unitPriceCents: Cents;
  discountCents: Cents;
}

export type PromoOutcome =
  | Exclude<PromoEvaluation, { status: "valid" }>
  | { status: "applied"; code: string; kind: PromoKind; discountCents: Cents }
  | {
      status: "not_applicable";
      code: string;
      reason: "no_child_tickets" | "nothing_to_discount";
    };

// Non-binding hints: the customer decides, nothing is switched silently (D3, D4).
export type Suggestion =
  | {
      code: "SWITCH_TO_ALL_DAYS";
      attendeeClientId: string;
      fromProductId: ProductId;
      toProductId: ProductId;
      savingsCents: Cents;
    }
  | { code: "USE_SEPARATE_DAY_PASSES"; familyGroupId: string; savingsCents: Cents };

export interface QuoteWarning {
  code: BookingWarning["code"] | "ALL_DAYS_SOLD_OUT";
  path: IssuePath;
  params: Record<string, string | number>;
}

export interface PricingState {
  readonly booking: ValidatedBooking;
  readonly catalog: Catalog;
  readonly clock: SaleClock;
  readonly promo: PromoEvaluation;
  readonly lines: readonly PricedLine[];
  // null until a promo step decides; resolved when the quote is built.
  readonly promoOutcome: PromoOutcome | null;
  readonly suggestions: readonly Suggestion[];
  readonly warnings: readonly QuoteWarning[];
}

export type PricingStep = (state: PricingState) => PricingState;

// ---------- output ----------

export interface QuoteLine {
  productId: ProductId;
  productCode: string;
  category: ProductCategory;
  attendeeClientId: string | null;
  familyGroupId: string | null;
  date: IsoDate | null;
  qty: number;
  unitPriceCents: Cents;
  discountCents: Cents;
  lineTotalCents: Cents;
}

export interface Quote {
  lines: QuoteLine[];
  subtotalCents: Cents;
  discountCents: Cents;
  totalCents: Cents;
  promo: PromoOutcome;
  suggestions: Suggestion[];
  warnings: QuoteWarning[];
}
