import { createHash } from "node:crypto";
import type { IdempotencyStore, StoredResponse } from "@/application";
import { idempotencyKeySchema } from "@/contracts/requests";
import type { RequestMeta } from "./handler";
import { problem, respond } from "./problem";

// D17: a double-click or a retry after a dropped connection with the same
// Idempotency-Key gets the original response instead of a second booking/charge.
export async function idempotent(
  request: Request,
  scope: string,
  body: unknown,
  store: IdempotencyStore,
  meta: RequestMeta,
  run: () => Promise<StoredResponse>,
): Promise<Response> {
  const key = idempotencyKeySchema.safeParse(request.headers.get("idempotency-key"));
  if (!key.success) {
    return problem(400, "IDEMPOTENCY_KEY_REQUIRED", "Send an Idempotency-Key header (UUID)", meta);
  }

  // Hash of the parsed body: field order and stripped extras don't change it.
  const requestHash = createHash("sha256").update(JSON.stringify(body)).digest("hex");
  const begun = await store.begin(scope, key.data, requestHash);
  switch (begun.state) {
    case "mismatch":
      return problem(
        409,
        "IDEMPOTENCY_KEY_REUSED",
        "This key was used for a different request",
        meta,
      );
    case "in_progress":
      return problem(
        409,
        "REQUEST_IN_PROGRESS",
        "The first request with this key is still running",
        {
          detail: "Retry in a moment with the same key.",
          requestId: meta.requestId,
        },
      );
    case "replay": {
      const replayed = respond(begun.response);
      replayed.headers.set("idempotent-replayed", "true");
      return replayed;
    }
    case "started":
      break;
  }

  try {
    const response = await run();
    await store.complete(scope, key.data, response);
    return respond(response);
  } catch (error) {
    await store.abandon(scope, key.data);
    throw error;
  }
}
