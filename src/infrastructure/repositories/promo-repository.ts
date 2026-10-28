import { and, eq } from "drizzle-orm";
import type { PromoRepository } from "@/application/ports";
import { toIsoDate } from "@/domain/calendar";
import type { Db } from "../db/client";
import { promoCodes } from "../db/schema";

export function promoRepository(db: Db): PromoRepository {
  return {
    async findByCode(eventId, code) {
      // `code` is citext, so this comparison is case-insensitive in Postgres too.
      const [row] = await db
        .select()
        .from(promoCodes)
        .where(and(eq(promoCodes.eventId, eventId), eq(promoCodes.code, code)))
        .limit(1);
      if (!row) return null;
      return {
        id: row.id,
        code: row.code,
        kind: row.kind,
        value: row.value,
        validFrom: row.validFrom === null ? null : toIsoDate(row.validFrom),
        validTo: row.validTo === null ? null : toIsoDate(row.validTo),
        maxRedemptions: row.maxRedemptions,
        redemptions: row.redemptions,
      };
    },
  };
}
