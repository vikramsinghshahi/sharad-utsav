import type { AppError, StoredResponse, UseCaseResult } from "@/application";
import { messageFor } from "@/contracts/messages";
import type { ProblemDetails } from "@/contracts/responses";
import { HOLD_DURATION_MS } from "@/domain/booking";
import type { DomainIssue } from "@/domain/errors";

const HOLD_MINUTES = Math.round(HOLD_DURATION_MS / 60_000);

type ProblemExtra = Pick<ProblemDetails, "detail" | "details" | "requestId">;

// application/problem+json bodies (SPEC §7, RFC 9457).
export function problemBody(
  status: number,
  code: string,
  title: string,
  extra: ProblemExtra = {},
): ProblemDetails {
  return {
    type: `/problems/${code.toLowerCase().replaceAll("_", "-")}`,
    title,
    status,
    code,
    ...extra,
  };
}

// Errors go out as problem+json; everything else as plain JSON.
export function respond({ status, body }: StoredResponse): Response {
  return Response.json(body, {
    status,
    headers: status >= 400 ? { "content-type": "application/problem+json" } : {},
  });
}

export function problem(status: number, code: string, title: string, extra: ProblemExtra = {}) {
  return respond({ status, body: problemBody(status, code, title, extra) });
}

export function issueDetails(issues: readonly DomainIssue[]): ProblemDetails["details"] {
  return issues.map((issue) => ({
    path: issue.path,
    code: issue.code,
    message: messageFor(issue),
    ...(issue.params ? { params: issue.params } : {}),
  }));
}

// One HTTP status per use-case failure kind.
export function appErrorBody(error: AppError, requestId: string): ProblemDetails {
  switch (error.kind) {
    case "not_found":
      return error.resource === "event"
        ? problemBody(404, "EVENT_NOT_FOUND", "Event not found", { requestId })
        : problemBody(404, "BOOKING_NOT_FOUND", "Booking not found", { requestId });
    case "validation":
      return problemBody(422, "VALIDATION_FAILED", "Some details need attention", {
        details: issueDetails(error.issues),
        requestId,
      });
    case "stock": {
      const { code, productId, productCode, productName, date, remaining } = error.shortage;
      const issue: DomainIssue = {
        code,
        path: [],
        params: { productId, productCode, productName, remaining, ...(date ? { date } : {}) },
      };
      return problemBody(409, code, "Not enough left", {
        detail: messageFor(issue),
        details: issueDetails([issue]),
        requestId,
      });
    }
    case "hold_expired":
      return problemBody(410, "HOLD_EXPIRED", "Your places were released", {
        detail: `The ${HOLD_MINUTES}-minute hold ran out. Please check availability and book again.`,
        requestId,
      });
    case "payment_declined":
      return problemBody(402, "PAYMENT_DECLINED", "Payment declined", {
        detail: "The payment didn't go through. Your places are still held; you can try again.",
        requestId,
      });
    case "invalid_state":
      return problemBody(409, "INVALID_STATE", "This booking can't be paid", {
        detail: `The booking is ${error.status.replaceAll("_", " ")}.`,
        requestId,
      });
  }
}

// A use-case result as status + body, ready to send or to store for idempotent replay.
export function toStored<T>(
  result: UseCaseResult<T>,
  successStatus: number,
  requestId: string,
): StoredResponse {
  if (result.ok) return { status: successStatus, body: result.value };
  const body = appErrorBody(result.error, requestId);
  return { status: body.status, body };
}
