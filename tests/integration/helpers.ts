import { eq, sql } from "drizzle-orm";
import { createUseCases } from "@/application";
import type { Clock } from "@/application/ports";
import type { CreateBookingRequest } from "@/contracts/requests";
import type { AttendeeInput, ExtraInput } from "@/domain/booking";
import { createDependencies } from "@/infrastructure/container";
import { createDb } from "@/infrastructure/db/client";
import { inventoryPools, products, promoCodes } from "@/infrastructure/db/schema";
import { seed } from "@/infrastructure/db/seed";
import { testDatabaseUrl } from "./test-database";

export const handle = createDb(testDatabaseUrl());
export const db = handle.db;

// 28 Oct 2026, noon in Texas: before the festival, everything on sale.
export const START = new Date("2026-10-28T12:00:00-05:00");
export const clock: Clock & { current: Date; advanceMinutes(m: number): void } = {
  current: START,
  now() {
    return this.current;
  },
  advanceMinutes(minutes) {
    this.current = new Date(this.current.getTime() + minutes * 60_000);
  },
};

export const useCases = createUseCases(createDependencies(db, { clock }));

export async function resetDatabase(): Promise<void> {
  // Truncating organizations cascades to every event-owned table.
  await db.execute(sql`TRUNCATE organizations, idempotency_keys, outbox CASCADE`);
  await seed(db);
  clock.current = START;
}

export async function productIds(): Promise<Record<string, string>> {
  const rows = await db.select({ id: products.id, code: products.code }).from(products);
  return Object.fromEntries(rows.map((row) => [row.code, row.id]));
}

export async function remaining(code: string): Promise<number> {
  const [row] = await db
    .select({ remaining: inventoryPools.remaining })
    .from(inventoryPools)
    .innerJoin(products, eq(products.id, inventoryPools.productId))
    .where(eq(products.code, code));
  return row?.remaining ?? -1;
}

export async function promoRedemptions(code: string): Promise<number> {
  const [row] = await db
    .select({ redemptions: promoCodes.redemptions })
    .from(promoCodes)
    .where(eq(promoCodes.code, code));
  return row?.redemptions ?? -1;
}

export async function count(table: string): Promise<number> {
  const result = await db.execute<{ n: number }>(
    sql.raw(`select count(*)::int as n from ${table}`),
  );
  return result.rows[0]?.n ?? -1;
}

const BOOKER = {
  firstName: "Asha",
  lastName: "Patel",
  email: "asha@example.com",
  phone: "+1 214 555 0100",
  dateOfBirth: "1986-05-01",
  isAttending: true,
};

export function adult(
  pid: Record<string, string>,
  clientId: string,
  dates: string[],
): AttendeeInput {
  return {
    clientId,
    firstName: clientId,
    lastName: "Patel",
    dateOfBirth: "1986-05-01",
    entry: { kind: "day_pass", productId: pid.DAY_ADULT ?? "", dates },
  };
}

export function bookingRequest(
  attendees: AttendeeInput[],
  extras: ExtraInput[] = [],
  promoCode?: string,
): CreateBookingRequest {
  return {
    eventSlug: "sharad-utsav-2026",
    booker: BOOKER,
    attendees,
    familyGroups: [],
    extras,
    ...(promoCode === undefined ? {} : { promoCode }),
  };
}

// One adult on 11 + 13 Nov taking both Garba sessions: needs 2 Garba places.
export function garbaBooking(
  pid: Record<string, string>,
  promoCode?: string,
): CreateBookingRequest {
  return bookingRequest(
    [adult(pid, "dancer", ["2026-11-11", "2026-11-13"])],
    [
      {
        productId: pid.GARBA ?? "",
        attendeeClientId: "dancer",
        dates: ["2026-11-11", "2026-11-13"],
      },
    ],
    promoCode,
  );
}
