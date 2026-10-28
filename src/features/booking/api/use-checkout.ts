"use client";

import { useRef, type Dispatch } from "react";
import type { ProblemDetails } from "@/contracts/responses";
import { reusableCreateKey, reusablePayKey } from "../state/reducer";
import { stockIssues } from "../state/stock-issues";
import { requestFingerprint, toCreateBookingRequest } from "../state/to-request";
import type { Action, BookingState, FlowError, PayAttempt } from "../state/types";
import { createBooking, fetchBooking, fetchCatalog, payBooking } from "./client";

interface Options {
  slug: string;
  state: BookingState;
  dispatch: Dispatch<Action>;
  reviewedTotalCents: number | null;
  onConfirmed: (bookingId: string, accessToken: string) => void;
  onCatalogChanged: () => void;
}

const problemError = (problem: ProblemDetails): FlowError => ({
  kind: "problem",
  title: problem.title,
  detail: problem.detail ?? null,
  details: problem.details,
});

// Create (hold) and pay, with idempotency keys (D17) and a guard against double clicks.
export function useCheckout({
  slug,
  state,
  dispatch,
  reviewedTotalCents,
  onConfirmed,
  onCatalogChanged,
}: Options) {
  // A ref, not state: two clicks in the same frame must not both get through.
  const busy = useRef(false);

  async function continueToPayment() {
    if (busy.current || state.inFlight) return;
    busy.current = true;
    try {
      const body = toCreateBookingRequest(state, slug);
      const fingerprint = requestFingerprint(body);
      const key = reusableCreateKey(state.createAttempt, fingerprint) ?? crypto.randomUUID();
      dispatch({ type: "CREATE_STARTED", attempt: { key, fingerprint } });

      const result = await createBooking(body, key);
      if (result.ok) {
        const created = result.data;
        if (created.status === "confirmed" || created.holdExpiresAt === null) {
          // A $0 total confirms straight away (D10).
          onConfirmed(created.bookingId, created.accessToken);
          return;
        }
        dispatch({
          type: "CREATE_SUCCEEDED",
          hold: {
            bookingId: created.bookingId,
            accessToken: created.accessToken,
            holdExpiresAt: created.holdExpiresAt,
            totalCents: created.quote.totalCents,
            reviewedTotalCents,
            quote: created.quote,
          },
        });
        return;
      }
      if (result.kind !== "problem") {
        dispatch({
          type: "CREATE_FAILED",
          error: { kind: "network", during: "create" },
          definite: false,
        });
        return;
      }

      const { problem } = result;
      if (problem.code === "SOLD_OUT" || problem.code === "INSUFFICIENT_STOCK") {
        dispatch({ type: "CREATE_FAILED", error: await stockError(problem), definite: true });
        onCatalogChanged();
        return;
      }
      // The first request with this key is still running: retrying with the same key is safe.
      const definite = problem.code !== "REQUEST_IN_PROGRESS";
      dispatch({ type: "CREATE_FAILED", error: problemError(problem), definite });
    } finally {
      busy.current = false;
    }
  }

  // Reload stock, then place the server's shortage on the field it concerns.
  async function stockError(problem: ProblemDetails): Promise<FlowError> {
    const fresh = await fetchCatalog(slug);
    const fallback = problem.detail ?? "Something in this booking has sold out.";
    const issue = fresh.ok ? stockIssues(state, fresh.data, problem)[0] : undefined;
    if (!issue) return { kind: "stock", message: fallback, step: "review" };
    return {
      kind: "stock",
      message: issue.message,
      step: issue.step,
      ...(issue.fix ? { fix: issue.fix } : {}),
    };
  }

  async function pay(outcome: PayAttempt["outcome"]) {
    const hold = state.hold;
    if (!hold || busy.current || state.inFlight) return;
    busy.current = true;
    try {
      // Same key only to retry after no response; any definite answer means a new attempt.
      const key = reusablePayKey(state.payAttempt, outcome) ?? crypto.randomUUID();
      dispatch({ type: "PAY_STARTED", attempt: { key, outcome, awaitingRetry: false } });

      const result = await payBooking(hold.bookingId, { outcome }, key);
      if (result.ok) {
        onConfirmed(hold.bookingId, hold.accessToken);
        return;
      }
      if (result.kind !== "problem") {
        dispatch({
          type: "PAY_FAILED",
          error: { kind: "network", during: "pay" },
          definite: false,
        });
        return;
      }
      const { problem } = result;
      switch (problem.code) {
        case "PAYMENT_DECLINED":
          dispatch({ type: "PAY_FAILED", error: { kind: "declined" }, definite: true });
          return;
        case "HOLD_EXPIRED":
          dispatch({ type: "HOLD_RELEASED" });
          return;
        case "INVALID_STATE": {
          // Paid already (another tab, or a lost response) or released: ask the booking itself.
          const booking = await fetchBooking(hold.bookingId, hold.accessToken);
          if (booking.ok && booking.data.status === "confirmed") {
            onConfirmed(hold.bookingId, hold.accessToken);
          } else {
            dispatch({ type: "HOLD_RELEASED" });
          }
          return;
        }
        case "REQUEST_IN_PROGRESS":
          dispatch({ type: "PAY_FAILED", error: problemError(problem), definite: false });
          return;
        default:
          dispatch({ type: "PAY_FAILED", error: problemError(problem), definite: true });
      }
    } finally {
      busy.current = false;
    }
  }

  return { continueToPayment, pay };
}
