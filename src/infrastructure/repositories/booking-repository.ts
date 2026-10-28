import { randomUUID } from "node:crypto";
import { and, asc, eq, gt, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { BookingDetails, BookingRepository, NewBooking } from "@/application/ports";
import { toIsoDate, type IsoDate } from "@/domain/calendar";
import type { StockDemand, StockShortage } from "@/domain/inventory";
import { toCents } from "@/domain/money";
import type { Db, Tx } from "../db/client";
import {
  bookingAttendees,
  bookingFamilyGroupMembers,
  bookingFamilyGroups,
  bookingLines,
  bookings,
  eventDays,
  events,
  inventoryHolds,
  inventoryPools,
  outbox,
  payments,
  products,
  promoCodes,
} from "../db/schema";

// Thrown inside a transaction to roll it back; caught and turned into an outcome.
class StockShortageError extends Error {
  constructor(readonly shortage: StockShortage) {
    super(`Stock shortage for ${shortage.productCode}`);
  }
}
class PromoUnavailableError extends Error {}

interface PoolAllocation {
  poolId: string;
  qty: number;
  productId: string;
  productCode: string;
  productName: string;
  date: IsoDate | null;
}

export function bookingRepository(db: Db): BookingRepository {
  return {
    async create(input) {
      try {
        await db.transaction(async (tx) => {
          if (input.promoCodeId) await reservePromoUse(tx, input.promoCodeId);
          const dayIds = await dayIdsByDate(tx, input.eventId);
          const allocations = await allocatePools(tx, input.demand, dayIds);
          await decrementPools(tx, allocations);
          await insertBooking(tx, input, dayIds, allocations);
        });
        return { ok: true };
      } catch (error) {
        if (error instanceof StockShortageError) {
          return { ok: false, reason: "stock", shortage: error.shortage };
        }
        if (error instanceof PromoUnavailableError)
          return { ok: false, reason: "promo_unavailable" };
        throw error;
      }
    },

    async findForPayment(bookingId) {
      const [row] = await db
        .select({
          id: bookings.id,
          status: bookings.status,
          totalCents: bookings.totalCents,
          holdExpiresAt: bookings.holdExpiresAt,
          confirmationCode: bookings.confirmationCode,
        })
        .from(bookings)
        .where(eq(bookings.id, bookingId))
        .limit(1);
      return row ? { ...row, totalCents: toCents(row.totalCents) } : null;
    },

    async recordDeclinedPayment(payment) {
      await db.insert(payments).values({ ...payment, status: "declined" });
    },

    async confirm({ confirmationCode, now, ...payment }) {
      return db.transaction(async (tx) => {
        // Guarded transition: only a pending booking whose hold is still live.
        const updated = await tx
          .update(bookings)
          .set({ status: "confirmed", confirmationCode, updatedAt: now })
          .where(
            and(
              eq(bookings.id, payment.bookingId),
              eq(bookings.status, "pending_payment"),
              gt(bookings.holdExpiresAt, now),
            ),
          )
          .returning({ id: bookings.id });

        // The charge happened either way, so it is always recorded (a real
        // provider would refund one that arrived too late).
        await tx.insert(payments).values({ ...payment, status: "succeeded" });

        if (updated.length === 0) {
          const [row] = await tx
            .select({ status: bookings.status })
            .from(bookings)
            .where(eq(bookings.id, payment.bookingId));
          return { ok: false, status: row?.status ?? "expired" };
        }

        await tx
          .update(inventoryHolds)
          .set({ committedAt: now })
          .where(
            and(
              eq(inventoryHolds.bookingId, payment.bookingId),
              isNull(inventoryHolds.releasedAt),
              isNull(inventoryHolds.committedAt),
            ),
          );
        await tx.insert(outbox).values({
          type: "booking.confirmed",
          payload: { bookingId: payment.bookingId, confirmationCode },
        });
        return { ok: true };
      });
    },

    findDetails: (bookingId) => findDetails(db, bookingId),

    async releaseExpiredHolds(now) {
      return db.transaction(async (tx) => {
        // SKIP LOCKED: concurrent cleanups (every request runs one) never block each other.
        const expired = await tx
          .select({ id: bookings.id, promoCodeId: bookings.promoCodeId })
          .from(bookings)
          .where(and(eq(bookings.status, "pending_payment"), lte(bookings.holdExpiresAt, now)))
          .limit(100)
          .for("update", { skipLocked: true });
        if (expired.length === 0) return 0;

        const ids = expired.map((b) => b.id);
        await tx
          .update(bookings)
          .set({ status: "expired", updatedAt: now })
          .where(and(inArray(bookings.id, ids), eq(bookings.status, "pending_payment")));

        // Same lock order as create (promo, then pools by id) so the two can't deadlock.
        await releasePromoUses(
          tx,
          expired.map((b) => b.promoCodeId),
        );

        const released = await tx
          .update(inventoryHolds)
          .set({ releasedAt: now })
          .where(
            and(
              inArray(inventoryHolds.bookingId, ids),
              isNull(inventoryHolds.releasedAt),
              isNull(inventoryHolds.committedAt),
            ),
          )
          .returning({ poolId: inventoryHolds.poolId, qty: inventoryHolds.qty });
        for (const [poolId, qty] of sumByPool(released)) {
          await tx
            .update(inventoryPools)
            .set({ remaining: sql`${inventoryPools.remaining} + ${qty}` })
            .where(eq(inventoryPools.id, poolId));
        }
        return expired.length;
      });
    },
  };
}

// ---------- create helpers ----------

async function reservePromoUse(tx: Tx, promoCodeId: string): Promise<void> {
  const reserved = await tx
    .update(promoCodes)
    .set({ redemptions: sql`${promoCodes.redemptions} + 1` })
    .where(
      and(
        eq(promoCodes.id, promoCodeId),
        or(
          isNull(promoCodes.maxRedemptions),
          lt(promoCodes.redemptions, promoCodes.maxRedemptions),
        ),
      ),
    )
    .returning({ id: promoCodes.id });
  if (reserved.length === 0) throw new PromoUnavailableError();
}

async function dayIdsByDate(tx: Tx, eventId: string): Promise<Map<string, string>> {
  const days = await tx
    .select({ id: eventDays.id, date: eventDays.date })
    .from(eventDays)
    .where(eq(eventDays.eventId, eventId));
  return new Map(days.map((day) => [day.date, day.id]));
}

// A per-day pool for (product, day) wins; otherwise the product's shared pool.
async function allocatePools(
  tx: Tx,
  demand: readonly StockDemand[],
  dayIds: ReadonlyMap<string, string>,
): Promise<PoolAllocation[]> {
  if (demand.length === 0) return [];
  const pools = await tx
    .select({
      id: inventoryPools.id,
      productId: inventoryPools.productId,
      eventDayId: inventoryPools.eventDayId,
      productName: products.displayName,
    })
    .from(inventoryPools)
    .innerJoin(products, eq(products.id, inventoryPools.productId))
    .where(inArray(inventoryPools.productId, [...new Set(demand.map((d) => d.productId))]));

  const byPool = new Map<string, PoolAllocation>();
  for (const item of demand) {
    const dayId = item.date === null ? undefined : dayIds.get(item.date);
    const pool =
      pools.find((p) => p.productId === item.productId && dayId && p.eventDayId === dayId) ??
      pools.find((p) => p.productId === item.productId && p.eventDayId === null);
    if (!pool) throw new Error(`No inventory pool for product ${item.productCode}`);

    const allocation = byPool.get(pool.id) ?? {
      poolId: pool.id,
      qty: 0,
      productId: item.productId,
      productCode: item.productCode,
      productName: pool.productName,
      date: pool.eventDayId === null ? null : item.date,
    };
    allocation.qty += item.qty;
    byPool.set(pool.id, allocation);
  }
  return [...byPool.values()];
}

// SPEC §8.2: fixed order (pool id) to avoid deadlocks; the conditional UPDATE is
// what makes overselling impossible. Zero rows → roll the whole booking back.
async function decrementPools(tx: Tx, allocations: readonly PoolAllocation[]): Promise<void> {
  const ordered = [...allocations].sort((a, b) => (a.poolId < b.poolId ? -1 : 1));
  for (const allocation of ordered) {
    const updated = await tx
      .update(inventoryPools)
      .set({ remaining: sql`${inventoryPools.remaining} - ${allocation.qty}` })
      .where(
        and(
          eq(inventoryPools.id, allocation.poolId),
          gte(inventoryPools.remaining, allocation.qty),
        ),
      )
      .returning({ id: inventoryPools.id });
    if (updated.length > 0) continue;

    const [pool] = await tx
      .select({ remaining: inventoryPools.remaining })
      .from(inventoryPools)
      .where(eq(inventoryPools.id, allocation.poolId));
    const remaining = pool?.remaining ?? 0;
    throw new StockShortageError({
      code: remaining <= 0 ? "SOLD_OUT" : "INSUFFICIENT_STOCK",
      productId: allocation.productId,
      productCode: allocation.productCode,
      productName: allocation.productName,
      date: allocation.date,
      remaining,
    });
  }
}

async function insertBooking(
  tx: Tx,
  input: NewBooking,
  dayIds: ReadonlyMap<string, string>,
  allocations: readonly PoolAllocation[],
): Promise<void> {
  const { booker, booking, quote } = input;
  await tx.insert(bookings).values({
    id: input.id,
    eventId: input.eventId,
    status: input.status,
    bookerFirstName: booker.firstName,
    bookerLastName: booker.lastName,
    bookerEmail: booker.email,
    bookerPhone: booker.phone,
    bookerDateOfBirth: booker.dateOfBirth,
    bookerIsAttending: booker.isAttending,
    subtotalCents: quote.subtotalCents,
    discountCents: quote.discountCents,
    totalCents: quote.totalCents,
    promoCodeId: input.promoCodeId,
    confirmationCode: input.confirmationCode,
    accessTokenHash: input.accessTokenHash,
    holdExpiresAt: input.holdExpiresAt,
    createdAt: input.now,
    updatedAt: input.now,
  });

  // Ids are generated here so rows can reference each other without relying on
  // the order RETURNING happens to give.
  const attendeeIds = new Map(booking.attendees.map((a) => [a.clientId, randomUUID()]));
  if (booking.attendees.length > 0) {
    await tx.insert(bookingAttendees).values(
      booking.attendees.map((a) => ({
        id: requireId(attendeeIds, a.clientId),
        bookingId: input.id,
        firstName: a.firstName,
        lastName: a.lastName,
        dateOfBirth: a.dateOfBirth,
        ageBand: a.ageBand,
        entryKind: a.entry.kind,
      })),
    );
  }

  const familyIds = new Map(booking.familyGroups.map((g) => [g.id, randomUUID()]));
  if (booking.familyGroups.length > 0) {
    await tx.insert(bookingFamilyGroups).values(
      booking.familyGroups.map((g) => ({
        id: requireId(familyIds, g.id),
        bookingId: input.id,
        productId: g.product.id,
        eventDayId: requireDayId(dayIds, g.date),
      })),
    );
    await tx.insert(bookingFamilyGroupMembers).values(
      booking.familyGroups.flatMap((g) =>
        g.memberClientIds.map((clientId) => ({
          familyGroupId: requireId(familyIds, g.id),
          attendeeId: requireId(attendeeIds, clientId),
        })),
      ),
    );
  }

  if (quote.lines.length > 0) {
    await tx.insert(bookingLines).values(
      quote.lines.map((line) => ({
        bookingId: input.id,
        productId: line.productId,
        attendeeId: line.attendeeClientId ? requireId(attendeeIds, line.attendeeClientId) : null,
        familyGroupId: line.familyGroupId ? requireId(familyIds, line.familyGroupId) : null,
        eventDayId: line.date ? requireDayId(dayIds, line.date) : null,
        qty: line.qty,
        unitPriceCents: line.unitPriceCents,
        discountCents: line.discountCents,
        lineTotalCents: line.lineTotalCents,
      })),
    );
  }

  if (input.status === "pending_payment" && input.holdExpiresAt && allocations.length > 0) {
    const expiresAt = input.holdExpiresAt;
    await tx
      .insert(inventoryHolds)
      .values(
        allocations.map((a) => ({ bookingId: input.id, poolId: a.poolId, qty: a.qty, expiresAt })),
      );
  }

  if (input.status === "confirmed") {
    await tx.insert(outbox).values({
      type: "booking.confirmed",
      payload: { bookingId: input.id, confirmationCode: input.confirmationCode },
    });
  }
}

function requireId(ids: ReadonlyMap<string, string>, key: string): string {
  const id = ids.get(key);
  if (!id) throw new Error(`Missing id for ${key}`);
  return id;
}

function requireDayId(dayIds: ReadonlyMap<string, string>, date: string): string {
  const id = dayIds.get(date);
  if (!id) throw new Error(`No event day for ${date}`);
  return id;
}

// ---------- expiry helpers ----------

async function releasePromoUses(tx: Tx, promoIds: readonly (string | null)[]): Promise<void> {
  const counts = new Map<string, number>();
  for (const id of promoIds) if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const [id, count] of [...counts].sort(([a], [b]) => (a < b ? -1 : 1))) {
    await tx
      .update(promoCodes)
      .set({ redemptions: sql`greatest(${promoCodes.redemptions} - ${count}, 0)` })
      .where(eq(promoCodes.id, id));
  }
}

function sumByPool(holds: readonly { poolId: string; qty: number }[]): [string, number][] {
  const totals = new Map<string, number>();
  for (const hold of holds) totals.set(hold.poolId, (totals.get(hold.poolId) ?? 0) + hold.qty);
  return [...totals].sort(([a], [b]) => (a < b ? -1 : 1));
}

// ---------- reads ----------

async function findDetails(db: Db, bookingId: string): Promise<BookingDetails | null> {
  const [row] = await db
    .select({ booking: bookings, event: events, promoCode: promoCodes.code })
    .from(bookings)
    .innerJoin(events, eq(events.id, bookings.eventId))
    .leftJoin(promoCodes, eq(promoCodes.id, bookings.promoCodeId))
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!row) return null;

  const [attendees, lines] = await Promise.all([
    db
      .select({
        id: bookingAttendees.id,
        firstName: bookingAttendees.firstName,
        lastName: bookingAttendees.lastName,
        ageBand: bookingAttendees.ageBand,
        entryKind: bookingAttendees.entryKind,
      })
      .from(bookingAttendees)
      .where(eq(bookingAttendees.bookingId, bookingId)),
    db
      .select({
        productCode: products.code,
        displayName: products.displayName,
        attendeeId: bookingLines.attendeeId,
        date: eventDays.date,
        qty: bookingLines.qty,
        unitPriceCents: bookingLines.unitPriceCents,
        discountCents: bookingLines.discountCents,
        lineTotalCents: bookingLines.lineTotalCents,
      })
      .from(bookingLines)
      .innerJoin(products, eq(products.id, bookingLines.productId))
      .leftJoin(eventDays, eq(eventDays.id, bookingLines.eventDayId))
      .where(eq(bookingLines.bookingId, bookingId))
      .orderBy(asc(products.code), asc(eventDays.date)),
  ]);

  const b = row.booking;
  return {
    id: b.id,
    event: {
      slug: row.event.slug,
      name: row.event.name,
      venue: row.event.venue,
      tagline: row.event.tagline,
      timezone: row.event.timezone,
      currency: row.event.currency,
    },
    status: b.status,
    accessTokenHash: b.accessTokenHash,
    confirmationCode: b.confirmationCode,
    holdExpiresAt: b.holdExpiresAt,
    booker: { firstName: b.bookerFirstName, lastName: b.bookerLastName, email: b.bookerEmail },
    attendees,
    lines: lines.map((line) => ({
      ...line,
      date: line.date === null ? null : toIsoDate(line.date),
    })),
    subtotalCents: b.subtotalCents,
    discountCents: b.discountCents,
    totalCents: b.totalCents,
    promoCode: row.promoCode,
  };
}
