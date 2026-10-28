import type { AgeBand } from "@/domain/age";
import type { BookingStatus, EntryKind } from "@/domain/booking";
import type { IsoDate } from "@/domain/calendar";
import type { Catalog } from "@/domain/catalog";
import type { ValidatedBooker, ValidatedBooking } from "@/domain/eligibility";
import type { StockDemand, StockShortage } from "@/domain/inventory";
import type { Cents } from "@/domain/money";
import type { Quote } from "@/domain/pricing/types";
import type { Promo } from "@/domain/promo";

// What the use-cases need from the outside world. Infrastructure implements
// these; tests can swap in fakes. Use-cases never import a DB driver.

export interface Clock {
  now(): Date;
}

export interface EventRecord {
  id: string;
  slug: string;
  name: string;
  timezone: string;
  currency: string;
}

export interface EventCatalog {
  event: EventRecord;
  catalog: Catalog;
}

export interface CatalogRepository {
  findBySlug(slug: string): Promise<EventCatalog | null>;
}

export type PromoRecord = Promo & { id: string };

export interface PromoRepository {
  // `code` is already normalized (trimmed, upper-case); lookup is case-insensitive.
  findByCode(eventId: string, code: string): Promise<PromoRecord | null>;
}

export interface NewBooking {
  id: string;
  eventId: string;
  // "confirmed" only for $0 bookings, which skip payment (D10).
  status: Extract<BookingStatus, "pending_payment" | "confirmed">;
  booker: ValidatedBooker;
  booking: ValidatedBooking;
  quote: Quote;
  demand: StockDemand[];
  promoCodeId: string | null;
  accessTokenHash: string;
  confirmationCode: string | null;
  holdExpiresAt: Date | null;
  now: Date;
}

export type CreateBookingOutcome =
  | { ok: true }
  | { ok: false; reason: "stock"; shortage: StockShortage }
  // The promo hit its limit between quote and create (another booking took the last use).
  | { ok: false; reason: "promo_unavailable" };

export interface PaymentTarget {
  id: string;
  status: BookingStatus;
  totalCents: Cents;
  holdExpiresAt: Date | null;
  confirmationCode: string | null;
}

export type ConfirmOutcome =
  | { ok: true }
  // The guarded UPDATE matched nothing: someone else confirmed it, or it expired.
  | { ok: false; status: BookingStatus };

export interface PaymentRecord {
  bookingId: string;
  provider: PaymentProvider["name"];
  providerRef: string;
  amountCents: Cents;
}

export interface BookingDetails {
  id: string;
  status: BookingStatus;
  accessTokenHash: string;
  confirmationCode: string | null;
  holdExpiresAt: Date | null;
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
}

export interface BookingRepository {
  // One transaction: reserve promo, hold stock in pool-id order, write the
  // booking, attendees, family groups, line snapshot and holds (SPEC §8.2).
  create(input: NewBooking): Promise<CreateBookingOutcome>;
  findForPayment(bookingId: string): Promise<PaymentTarget | null>;
  recordDeclinedPayment(payment: PaymentRecord): Promise<void>;
  // PENDING_PAYMENT → CONFIRMED, guarded by status and hold expiry; commits holds,
  // records the payment and writes an outbox row, all in one transaction.
  confirm(input: PaymentRecord & { confirmationCode: string; now: Date }): Promise<ConfirmOutcome>;
  findDetails(bookingId: string): Promise<BookingDetails | null>;
  // PENDING_PAYMENT → EXPIRED for holds past their time; returns stock and promo uses.
  releaseExpiredHolds(now: Date): Promise<number>;
}

export interface PaymentProvider {
  readonly name: "simulated";
  charge(input: {
    bookingId: string;
    amountCents: Cents;
    simulate: "succeed" | "decline";
  }): Promise<{ status: "succeeded" | "declined"; providerRef: string }>;
}

export interface Secrets {
  newId(): string;
  // A random URL-safe token and the hash we store; the raw token is never persisted.
  newAccessToken(): { token: string; hash: string };
  tokenMatches(token: string, hash: string): boolean;
  newConfirmationCode(): string;
}

export interface StoredResponse {
  status: number;
  body: unknown;
}

export type IdempotencyBegin =
  | { state: "started" }
  | { state: "replay"; response: StoredResponse }
  | { state: "mismatch" } // same key, different request body
  | { state: "in_progress" }; // same key, first request still running

export interface IdempotencyStore {
  begin(scope: string, key: string, requestHash: string): Promise<IdempotencyBegin>;
  complete(scope: string, key: string, response: StoredResponse): Promise<void>;
  // The request crashed: forget the key so a retry can run.
  abandon(scope: string, key: string): Promise<void>;
}

export interface Dependencies {
  clock: Clock;
  catalogs: CatalogRepository;
  promos: PromoRepository;
  bookings: BookingRepository;
  payments: PaymentProvider;
  secrets: Secrets;
  idempotency: IdempotencyStore;
}
