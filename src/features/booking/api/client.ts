import { z } from "zod";
import type { CreateBookingRequest, PayRequest } from "@/contracts/requests";
import type {
  BookingResponse,
  CatalogResponse,
  CreateBookingResponse,
  PayResponse,
  ProblemDetails,
  QuoteResponse,
} from "@/contracts/responses";
import type { BookingDraft } from "@/domain/booking";

// The only way the booking UI talks to the backend: HTTP, typed by src/contracts.

export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; kind: "problem"; problem: ProblemDetails }
  // No response at all (offline, dropped connection). Safe to retry with the same key.
  | { ok: false; kind: "network" }
  | { ok: false; kind: "aborted" };

const problemSchema = z.object({
  type: z.string().default("about:blank"),
  title: z.string().default("Something went wrong"),
  status: z.number(),
  code: z.string(),
  detail: z.string().optional(),
  details: z
    .array(
      z.object({
        path: z.array(z.union([z.string(), z.number()])),
        code: z.string(),
        message: z.string(),
      }),
    )
    .optional(),
  requestId: z.string().optional(),
}) satisfies z.ZodType<ProblemDetails>;

async function readProblem(response: Response): Promise<ProblemDetails> {
  const fallback: ProblemDetails = {
    type: "about:blank",
    title: "Something went wrong on our side. Please try again.",
    status: response.status,
    code: `HTTP_${response.status}`,
  };
  try {
    const parsed = problemSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : fallback;
  } catch {
    return fallback;
  }
}

async function request<T>(url: string, init: RequestInit): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { accept: "application/json", ...init.headers },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { ok: false, kind: "aborted" };
    }
    return { ok: false, kind: "network" };
  }
  if (!response.ok) return { ok: false, kind: "problem", problem: await readProblem(response) };
  try {
    // Success bodies are typed by the contract the API route is built from (src/contracts).
    const data: T = await response.json();
    return { ok: true, status: response.status, data };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { ok: false, kind: "aborted" };
    }
    return { ok: false, kind: "network" };
  }
}

const json = (body: unknown, extra: Record<string, string> = {}) => ({
  method: "POST",
  headers: { "content-type": "application/json", ...extra },
  body: JSON.stringify(body),
});

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
