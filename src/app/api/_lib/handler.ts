import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { logger } from "@/lib/logger";
import { problem } from "./problem";

export interface RequestMeta {
  requestId: string;
}

// Wraps a route: assigns a request id (logged and echoed back), and turns any
// unexpected error into a 500 problem without leaking internals.
export function route<Ctx>(
  name: string,
  handle: (request: Request, ctx: Ctx, meta: RequestMeta) => Promise<Response>,
) {
  return async (request: Request, ctx: Ctx): Promise<Response> => {
    const requestId = request.headers.get("x-request-id") ?? randomUUID();
    const started = Date.now();
    let response: Response;
    try {
      response = await handle(request, ctx, { requestId });
    } catch (error) {
      logger.error(`${name}.failed`, { requestId, error });
      response = problem(500, "INTERNAL_ERROR", "Something went wrong", {
        detail: "Please try again in a moment.",
        requestId,
      });
    }
    response.headers.set("x-request-id", requestId);
    logger.info(`${name}.done`, {
      requestId,
      status: response.status,
      durationMs: Date.now() - started,
    });
    return response;
  };
}

export type Parsed<T> = { ok: true; data: T } | { ok: false; response: Response };

// 400 for malformed JSON or the wrong shape; unknown fields are stripped.
export async function readJson<S extends z.ZodType>(
  request: Request,
  schema: S,
  meta: RequestMeta,
): Promise<Parsed<z.infer<S>>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      ok: false,
      response: problem(400, "INVALID_JSON", "Request body must be JSON", meta),
    };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      response: problem(400, "INVALID_REQUEST", "Request has the wrong shape", {
        details: parsed.error.issues.map((issue) => ({
          path: issue.path.map((p) => (typeof p === "symbol" ? String(p) : p)),
          code: "INVALID_REQUEST",
          message: issue.message,
        })),
        requestId: meta.requestId,
      }),
    };
  }
  return { ok: true, data: parsed.data };
}
