import type { AgeBand } from "@/domain/age";
import type { BookingStatus, EntryKind } from "@/domain/booking";
import type { IsoDate } from "@/domain/calendar";
import type { ProductCategory, ProductPricing, ProductRule } from "@/domain/catalog";
import type { Quote } from "@/domain/pricing/types";

// Response bodies (SPEC §7). Money is always integer cents; dates are ISO in the
// event timezone; timestamps are ISO-8601 UTC strings.

export interface CatalogResponse {
  event: { slug: string; name: string; timezone: string; currency: string };
  days: { date: IsoDate; cutoffTime: string; onSale: boolean }[];
  allDaysOnSale: boolean;
  products: {
    id: string;
    code: string;
    displayName: string;
    category: ProductCategory;
    priceCents: number;
    pricing: ProductPricing;
    rule: ProductRule;
    remaining: number;
    soldOut: boolean;
  }[];
}

export type QuoteResponse = Quote;

export interface CreateBookingResponse {
  bookingId: string;
  // Secret for the confirmation link. Shown once; only its hash is stored.
  accessToken: string;
  // "confirmed" straight away when the total is $0 (D10).
  status: Extract<BookingStatus, "pending_payment" | "confirmed">;
  confirmationCode: string | null;
  quote: Quote;
  holdExpiresAt: string | null;
  payment: { provider: "simulated"; required: boolean };
}

export interface PayResponse {
  status: "confirmed";
  confirmationCode: string;
}

export interface BookingResponse {
  bookingId: string;
  status: BookingStatus;
  confirmationCode: string | null;
  holdExpiresAt: string | null;
  booker: { firstName: string; lastName: string; email: string };
  attendees: {
    id: string;
    firstName: string;
    lastName: string;
    ageBand: AgeBand;
    entryKind: EntryKind;
  }[];
  lines: {
    productCode: string;
    displayName: string;
    attendeeId: string | null;
    date: IsoDate | null;
    qty: number;
    unitPriceCents: number;
    discountCents: number;
    lineTotalCents: number;
  }[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  promoCode: string | null;
  // What the door volunteers scan; null until confirmed.
  qrPayload: string | null;
}

export interface ExpireHoldsResponse {
  released: number;
}

// application/problem+json (RFC 9457).
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  code: string;
  detail?: string;
  details?: { path: (string | number)[]; code: string; message: string }[];
  requestId?: string;
}
