import { z } from "zod";
import type { ProblemDetails } from "@/contracts/responses";

// Browser-side HTTP to our own API, typed by src/contracts. Every feature uses this, so
// problem+json parsing and network/abort handling live in exactly one place.

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
        params: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
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

export async function apiRequest<T>(url: string, init: RequestInit): Promise<ApiResult<T>> {
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

export const jsonBody = (body: unknown, extra: Record<string, string> = {}) => ({
  method: "POST",
  headers: { "content-type": "application/json", ...extra },
  body: JSON.stringify(body),
});
