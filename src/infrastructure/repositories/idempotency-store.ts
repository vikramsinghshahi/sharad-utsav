import { and, eq, isNull, lt, sql } from "drizzle-orm";
import type { IdempotencyStore } from "@/application/ports";
import type { Db } from "../db/client";
import { idempotencyKeys } from "../db/schema";

// Keys are remembered for 24h (SPEC §8.3). A request that never finished
// (crashed function) stops blocking retries after a minute.
const KEY_TTL = sql`interval '24 hours'`;
const STALE_IN_PROGRESS = sql`interval '60 seconds'`;

export function idempotencyStore(db: Db): IdempotencyStore {
  const byKey = (scope: string, key: string) =>
    and(eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.key, key));

  return {
    async begin(scope, key, requestHash) {
      await db
        .delete(idempotencyKeys)
        .where(and(byKey(scope, key), lt(idempotencyKeys.createdAt, sql`now() - ${KEY_TTL}`)));

      // The insert is the lock: only one concurrent request with this key wins.
      const inserted = await db
        .insert(idempotencyKeys)
        .values({ scope, key, requestHash })
        .onConflictDoNothing()
        .returning({ key: idempotencyKeys.key });
      if (inserted.length > 0) return { state: "started" };

      const [row] = await db.select().from(idempotencyKeys).where(byKey(scope, key)).limit(1);
      if (!row) return { state: "in_progress" };
      if (row.requestHash !== requestHash) return { state: "mismatch" };
      if (row.completedAt !== null && row.responseStatus !== null) {
        return {
          state: "replay",
          response: { status: row.responseStatus, body: row.responseJson },
        };
      }

      const takenOver = await db
        .update(idempotencyKeys)
        .set({ createdAt: sql`now()` })
        .where(
          and(
            byKey(scope, key),
            isNull(idempotencyKeys.completedAt),
            lt(idempotencyKeys.createdAt, sql`now() - ${STALE_IN_PROGRESS}`),
          ),
        )
        .returning({ key: idempotencyKeys.key });
      return takenOver.length > 0 ? { state: "started" } : { state: "in_progress" };
    },

    async complete(scope, key, response) {
      await db
        .update(idempotencyKeys)
        .set({
          responseStatus: response.status,
          responseJson: response.body,
          completedAt: sql`now()`,
        })
        .where(byKey(scope, key));
    },

    async abandon(scope, key) {
      await db
        .delete(idempotencyKeys)
        .where(and(byKey(scope, key), isNull(idempotencyKeys.completedAt)));
    },
  };
}
