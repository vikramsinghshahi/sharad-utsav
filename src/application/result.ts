import type { BookingStatus } from "@/domain/booking";
import type { DomainIssue } from "@/domain/errors";
import type { StockShortage } from "@/domain/inventory";

// Every way a use-case can fail. The API maps each kind to one HTTP status.
export type AppError =
  | { kind: "not_found"; resource: "event" | "booking" }
  | { kind: "validation"; issues: DomainIssue[] }
  | { kind: "stock"; shortage: StockShortage }
  | { kind: "hold_expired" }
  | { kind: "payment_declined" }
  | { kind: "invalid_state"; status: BookingStatus };

export type UseCaseResult<T> = { ok: true; value: T } | { ok: false; error: AppError };

export function success<T>(value: T): UseCaseResult<T> {
  return { ok: true, value };
}

export function failure<T = never>(error: AppError): UseCaseResult<T> {
  return { ok: false, error };
}
