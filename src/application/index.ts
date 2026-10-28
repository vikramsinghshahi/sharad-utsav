import type { BookingDraft } from "@/domain/booking";
import type { CreateBookingRequest, PayRequest } from "@/contracts/requests";
import { createBooking } from "./create-booking";
import { expireHolds } from "./expire-holds";
import { getBooking } from "./get-booking";
import { getCatalog } from "./get-catalog";
import { payBooking } from "./pay-booking";
import type { Dependencies } from "./ports";
import { quoteBooking } from "./quote-booking";

export type { AppError, UseCaseResult } from "./result";
export type { Dependencies, IdempotencyStore, StoredResponse } from "./ports";

// Binds every use-case to one set of dependencies (the composition root passes
// real adapters; tests pass a test database or fakes).
export function createUseCases(deps: Dependencies) {
  return {
    getCatalog: (slug: string) => getCatalog(deps, slug),
    quoteBooking: (slug: string, draft: BookingDraft) => quoteBooking(deps, slug, draft),
    createBooking: (request: CreateBookingRequest) => createBooking(deps, request),
    payBooking: (bookingId: string, request: PayRequest) => payBooking(deps, bookingId, request),
    getBooking: (bookingId: string, token: string) => getBooking(deps, bookingId, token),
    expireHolds: () => expireHolds(deps),
    idempotency: deps.idempotency,
  };
}

export type UseCases = ReturnType<typeof createUseCases>;
