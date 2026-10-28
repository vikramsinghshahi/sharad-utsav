import type { CreateBookingRequest, PayRequest } from "@/contracts/requests";
import type {
  BookingResponse,
  CatalogResponse,
  CreateBookingResponse,
  PayResponse,
  QuoteResponse,
} from "@/contracts/responses";
import type { BookingDraft } from "@/domain/booking";
import { apiRequest as request, jsonBody as json } from "@/lib/api-client";

export type { ApiResult } from "@/lib/api-client";

// The booking endpoints. Transport and error parsing are in src/lib/api-client.ts.

export function fetchCatalog(slug: string, signal?: AbortSignal) {
  return request<CatalogResponse>(`/api/events/${encodeURIComponent(slug)}`, {
    signal,
    cache: "no-store",
  });
}

export function fetchQuote(slug: string, draft: BookingDraft, signal?: AbortSignal) {
  return request<QuoteResponse>(`/api/events/${encodeURIComponent(slug)}/quotes`, {
    ...json(draft),
    signal,
  });
}

export function createBooking(body: CreateBookingRequest, idempotencyKey: string) {
  return request<CreateBookingResponse>("/api/bookings", {
    ...json(body, { "idempotency-key": idempotencyKey }),
  });
}

export function payBooking(bookingId: string, body: PayRequest, idempotencyKey: string) {
  return request<PayResponse>(`/api/bookings/${encodeURIComponent(bookingId)}/pay`, {
    ...json(body, { "idempotency-key": idempotencyKey }),
  });
}

export function fetchBooking(bookingId: string, token: string, signal?: AbortSignal) {
  const query = new URLSearchParams({ token });
  return request<BookingResponse>(`/api/bookings/${encodeURIComponent(bookingId)}?${query}`, {
    signal,
    cache: "no-store",
  });
}
