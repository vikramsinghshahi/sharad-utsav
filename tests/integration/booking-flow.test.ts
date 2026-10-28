import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { bookings, promoCodes } from "@/infrastructure/db/schema";
import {
  adult,
  bookingRequest,
  clock,
  count,
  db,
  garbaBooking,
  handle,
  productIds,
  promoRedemptions,
  remaining,
  resetDatabase,
  useCases,
} from "./helpers";

beforeEach(resetDatabase);
afterAll(() => handle.close());

async function created(request: Parameters<typeof useCases.createBooking>[0]) {
  const result = await useCases.createBooking(request);
  if (!result.ok) throw new Error(`createBooking failed: ${JSON.stringify(result.error)}`);
  return result.value;
}

describe("stock under concurrency (SPEC §8.2)", () => {
  it("six buyers race for the last two Garba places: exactly one wins, nothing oversold", async () => {
    const pid = await productIds();
    const results = await Promise.all(
      Array.from({ length: 6 }, () => useCases.createBooking(garbaBooking(pid))),
    );

    const winners = results.filter((r) => r.ok);
    expect(winners).toHaveLength(1);
    for (const loser of results.filter((r) => !r.ok)) {
      expect(loser.ok ? null : loser.error).toMatchObject({
        kind: "stock",
        shortage: { productCode: "GARBA" },
      });
    }
    expect(await remaining("GARBA")).toBe(0);
    // Losers' day passes were rolled back with them: only the winner's 2 person-days are gone.
    expect(await remaining("DAY_ADULT")).toBe(378);
    expect(await count("bookings")).toBe(1);
  });

  it("a sold-out item is refused before any stock is touched", async () => {
    const pid = await productIds();
    await created(garbaBooking(pid));
    const second = await useCases.createBooking(garbaBooking(pid));
    expect(second.ok ? null : second.error).toMatchObject({
      kind: "stock",
      shortage: { code: "SOLD_OUT", productCode: "GARBA", remaining: 0 },
    });
    expect(await remaining("DAY_ADULT")).toBe(378);
  });
});

describe("holds and expiry (S3, D16)", () => {
  it("an unpaid booking releases its stock and promo use after 15 minutes", async () => {
    const pid = await productIds();
    await db.update(promoCodes).set({ maxRedemptions: 5 }).where(eq(promoCodes.code, "FLAT20"));
    const booking = await created(garbaBooking(pid, "FLAT20"));
    expect(booking.status).toBe("pending_payment");
    expect(await remaining("GARBA")).toBe(0);
    expect(await promoRedemptions("FLAT20")).toBe(1);

    clock.advanceMinutes(14);
    expect((await useCases.getCatalog("sharad-utsav-2026")).ok).toBe(true);
    expect(await remaining("GARBA")).toBe(0); // still held

    clock.advanceMinutes(2);
    const pay = await useCases.payBooking(booking.bookingId, { outcome: "succeed" });
    expect(pay.ok ? null : pay.error).toEqual({ kind: "hold_expired" });

    expect(await remaining("GARBA")).toBe(2);
    expect(await remaining("DAY_ADULT")).toBe(380);
    expect(await promoRedemptions("FLAT20")).toBe(0);
    const [row] = await db.select().from(bookings).where(eq(bookings.id, booking.bookingId));
    expect(row?.status).toBe("expired");

    // Guarded: releasing again changes nothing.
    expect(await useCases.expireHolds()).toEqual({ released: 0 });
    expect(await remaining("GARBA")).toBe(2);
  });

  it("a catalog read alone frees abandoned holds (lazy cleanup)", async () => {
    const pid = await productIds();
    await created(garbaBooking(pid));
    clock.advanceMinutes(16);
    const catalog = await useCases.getCatalog("sharad-utsav-2026");
    const garba = catalog.ok ? catalog.value.products.find((p) => p.code === "GARBA") : undefined;
    expect(garba).toMatchObject({ remaining: 2, soldOut: false });
  });

  it("reading a lapsed booking shows it as expired and frees its stock", async () => {
    const pid = await productIds();
    const booking = await created(garbaBooking(pid));
    clock.advanceMinutes(16);
    const details = await useCases.getBooking(booking.bookingId, booking.accessToken);
    expect(details.ok && details.value.status).toBe("expired");
    expect(await remaining("GARBA")).toBe(2);
  });
});

describe("payment (SPEC §8.1)", () => {
  it("a decline keeps the hold; a retry confirms, commits the stock and writes the outbox", async () => {
    const pid = await productIds();
    const booking = await created(garbaBooking(pid));

    const declined = await useCases.payBooking(booking.bookingId, { outcome: "decline" });
    expect(declined.ok ? null : declined.error).toEqual({ kind: "payment_declined" });
    expect(await remaining("GARBA")).toBe(0);

    const paid = await useCases.payBooking(booking.bookingId, { outcome: "succeed" });
    expect(paid.ok && paid.value.confirmationCode).toMatch(/^SU-[A-Z2-9]{8}$/);

    // Paying again is a no-op that returns the same code.
    const again = await useCases.payBooking(booking.bookingId, { outcome: "succeed" });
    expect(again).toEqual(paid);

    // Confirmed stock is never released, however late the cleanup runs.
    clock.advanceMinutes(60);
    await useCases.expireHolds();
    expect(await remaining("GARBA")).toBe(0);

    const details = await useCases.getBooking(booking.bookingId, booking.accessToken);
    expect(details.ok && details.value).toMatchObject({
      status: "confirmed",
      qrPayload: paid.ok ? paid.value.confirmationCode : "",
      totalCents: booking.quote.totalCents,
    });
    expect(await count("payments")).toBe(2);
    expect(await count("outbox")).toBe(1);
  });

  it("the confirmation needs the right token", async () => {
    const pid = await productIds();
    const booking = await created(garbaBooking(pid));
    const wrong = await useCases.getBooking(booking.bookingId, "not-the-token");
    expect(wrong.ok ? null : wrong.error).toEqual({ kind: "not_found", resource: "booking" });
  });
});

describe("promo limits under concurrency (§5.5)", () => {
  it("a code with one use left is applied to exactly one of four simultaneous bookings", async () => {
    const pid = await productIds();
    await db
      .update(promoCodes)
      .set({ maxRedemptions: 1, redemptions: 0 })
      .where(eq(promoCodes.code, "SEVA10"));

    const results = await Promise.all(
      ["a", "b", "c", "d"].map((id) =>
        created(bookingRequest([adult(pid, id, ["2026-11-12"])], [], "SEVA10")),
      ),
    );

    const applied = results.filter((r) => r.quote.promo.status === "applied");
    expect(applied).toHaveLength(1);
    expect(applied[0]?.quote.totalCents).toBe(1350);
    // The others still booked, re-priced at full price with the reason shown (D15).
    for (const other of results.filter((r) => r.quote.promo.status !== "applied")) {
      expect(other.quote.promo).toEqual({ status: "exhausted", code: "SEVA10" });
      expect(other.quote.totalCents).toBe(1500);
    }
    expect(await promoRedemptions("SEVA10")).toBe(1);
  });
});

describe("special cases", () => {
  it("D10: a $0 booking is confirmed straight away and still uses stock", async () => {
    const pid = await productIds();
    const booking = await created(
      bookingRequest([adult(pid, "solo", ["2026-11-10"])], [], "FLAT20"),
    );
    expect(booking).toMatchObject({
      status: "confirmed",
      holdExpiresAt: null,
      payment: { required: false },
    });
    expect(booking.confirmationCode).toMatch(/^SU-/);
    expect(await remaining("DAY_ADULT")).toBe(379);
    expect(await count("inventory_holds")).toBe(0);
    expect(await count("outbox")).toBe(1);
  });

  it("stores family passes with their members and links the line to the group", async () => {
    const pid = await productIds();
    const member = (clientId: string, dateOfBirth: string) => ({
      clientId,
      firstName: clientId,
      lastName: "Shah",
      dateOfBirth,
      entry: { kind: "family_pass" as const },
    });
    const request = {
      ...bookingRequest([
        member("mum", "1985-01-01"),
        member("dad", "1984-01-01"),
        member("son", "2017-01-01"),
        member("girl", "2019-01-01"),
      ]),
      familyGroups: [
        {
          id: "fam",
          productId: pid.FAMILY ?? "",
          date: "2026-11-12",
          attendeeClientIds: ["mum", "dad", "son", "girl"],
        },
      ],
    };
    const booking = await created(request);
    expect(booking.quote.totalCents).toBe(4000);
    expect(await remaining("FAMILY")).toBe(94);
    expect(await count("booking_family_group_members")).toBe(4);
    const linked = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from booking_lines where family_group_id is not null`,
    );
    expect(linked.rows[0]?.n).toBe(1);
  });
});

describe("listing events", () => {
  it("drops an event once its last day has passed in its own timezone", async () => {
    expect((await useCases.listEvents()).events).toHaveLength(1);
    // 15 Nov, 00:30 in Texas (06:30 UTC): the festival ended on the 14th.
    clock.current = new Date("2026-11-15T06:30:00Z");
    expect((await useCases.listEvents()).events).toHaveLength(0);
    // Still the 14th in Texas at 05:30 UTC: the last day is under way.
    clock.current = new Date("2026-11-15T05:30:00Z");
    expect((await useCases.listEvents()).events).toHaveLength(1);
  });
});
