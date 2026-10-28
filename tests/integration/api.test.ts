import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateBookingResponse, ProblemDetails } from "@/contracts/responses";
import type { UseCases } from "@/application";
import type * as Container from "@/infrastructure/container";
import { POST as createBookingRoute } from "@/app/api/bookings/route";
import { GET as bookingRoute } from "@/app/api/bookings/[id]/route";
import { POST as payRoute } from "@/app/api/bookings/[id]/pay/route";
import { POST as quoteRoute } from "@/app/api/events/[slug]/quotes/route";
import { GET as eventsRoute } from "@/app/api/events/route";
import {
  adult,
  bookingRequest,
  count,
  garbaBooking,
  handle,
  productIds,
  resetDatabase,
  useCases,
} from "./helpers";

// Route handlers use the test database and the fixed test clock. Only
// getUseCases is replaced; the helpers still use the real createDependencies.
const testUseCases = vi.hoisted(() => ({ current: undefined as UseCases | undefined }));
vi.mock("@/infrastructure/container", async (importOriginal) => ({
  ...(await importOriginal<typeof Container>()),
  getUseCases: () => {
    if (!testUseCases.current) throw new Error("test use-cases not set");
    return testUseCases.current;
  },
}));
testUseCases.current = useCases;

beforeEach(resetDatabase);
afterAll(() => handle.close());

function post(url: string, body: unknown, key?: string) {
  return new Request(`http://test${url}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(key ? { "idempotency-key": key } : {}) },
    body: JSON.stringify(body),
  });
}

const noCtx = { params: Promise.resolve({}) };
const idCtx = (id: string) => ({ params: Promise.resolve({ id }) });
const slugCtx = { params: Promise.resolve({ slug: "sharad-utsav-2026" }) };

describe("POST /api/bookings idempotency (D17)", () => {
  it("the same key twice returns the original response and creates one booking", async () => {
    const pid = await productIds();
    const body = garbaBooking(pid);
    const key = randomUUID();

    const first = await createBookingRoute(post("/api/bookings", body, key), noCtx);
    const second = await createBookingRoute(post("/api/bookings", body, key), noCtx);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.headers.get("idempotent-replayed")).toBe("true");
    const [a, b] = [
      (await first.json()) as CreateBookingResponse,
      (await second.json()) as CreateBookingResponse,
    ];
    expect(b.bookingId).toBe(a.bookingId);
    expect(await count("bookings")).toBe(1);
  });

  it("a burst of double-clicks with one key still creates one booking", async () => {
    const pid = await productIds();
    const body = garbaBooking(pid);
    const key = randomUUID();
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => createBookingRoute(post("/api/bookings", body, key), noCtx)),
    );
    for (const response of responses) expect([201, 409]).toContain(response.status);
    expect(responses.filter((r) => r.status === 201).length).toBeGreaterThanOrEqual(1);
    expect(await count("bookings")).toBe(1);
  });

  it("reusing a key for a different booking is refused", async () => {
    const pid = await productIds();
    const key = randomUUID();
    await createBookingRoute(post("/api/bookings", garbaBooking(pid), key), noCtx);
    const other = await createBookingRoute(
      post("/api/bookings", bookingRequest([adult(pid, "x", ["2026-11-10"])]), key),
      noCtx,
    );
    expect(other.status).toBe(409);
    expect(((await other.json()) as ProblemDetails).code).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it("requires a UUID Idempotency-Key", async () => {
    const pid = await productIds();
    const response = await createBookingRoute(
      post("/api/bookings", garbaBooking(pid), "abc"),
      noCtx,
    );
    expect(response.status).toBe(400);
    expect(((await response.json()) as ProblemDetails).code).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });
});

describe("the server decides the price", () => {
  it("ignores any price or total the client sends", async () => {
    const pid = await productIds();
    const tampered = {
      ...bookingRequest([adult(pid, "cheapskate", ["2026-11-10", "2026-11-11"])]),
      totalCents: 1,
      subtotalCents: 1,
      lines: [{ productId: pid.DAY_ADULT, unitPriceCents: 1, qty: 2 }],
      priceCents: 1,
    };
    const response = await createBookingRoute(post("/api/bookings", tampered, randomUUID()), noCtx);
    expect(response.status).toBe(201);
    const body = (await response.json()) as CreateBookingResponse;
    expect(body.quote.totalCents).toBe(3000);
    expect(body.quote.lines.every((line) => line.unitPriceCents === 1500)).toBe(true);
  });
});

describe("errors are problem+json with stable codes", () => {
  it("422 with field paths for rule violations", async () => {
    const pid = await productIds();
    const draft = {
      attendees: [
        adult(pid, "mum", ["2026-11-10"]),
        {
          clientId: "kid",
          firstName: "Aarav",
          lastName: "Patel",
          dateOfBirth: "2019-06-01",
          entry: { kind: "day_pass", productId: pid.DAY_ADULT, dates: ["2026-11-10"] },
        },
      ],
      familyGroups: [],
      extras: [],
    };
    const response = await quoteRoute(post("/api/events/sharad-utsav-2026/quotes", draft), slugCtx);
    expect(response.status).toBe(422);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    const body = (await response.json()) as ProblemDetails;
    expect(body.code).toBe("VALIDATION_FAILED");
    expect(body.details?.[0]).toMatchObject({
      code: "AGE_BAND_MISMATCH",
      path: ["attendees", 1, "entry", "productId"],
    });
  });

  it("409 SOLD_OUT names the product, with its id and what's left in params", async () => {
    const pid = await productIds();
    await createBookingRoute(post("/api/bookings", garbaBooking(pid), randomUUID()), noCtx);
    const response = await createBookingRoute(
      post("/api/bookings", garbaBooking(pid), randomUUID()),
      noCtx,
    );
    expect(response.status).toBe(409);
    const body = (await response.json()) as ProblemDetails;
    expect(body.code).toBe("SOLD_OUT");
    expect(body.details?.[0]).toMatchObject({
      code: "SOLD_OUT",
      message: "Sorry, Garba Workshop has sold out.",
      params: { productId: pid.GARBA, productName: "Garba Workshop", remaining: 0 },
    });
  });

  it("400 for the wrong shape and 404 for unknown or malformed booking ids", async () => {
    const bad = await quoteRoute(
      post("/api/events/sharad-utsav-2026/quotes", { attendees: "lots" }),
      slugCtx,
    );
    expect(bad.status).toBe(400);

    const malformed = await payRoute(
      post("/api/bookings/x/pay", { outcome: "succeed" }, randomUUID()),
      idCtx("x"),
    );
    expect(malformed.status).toBe(404);
    const unknown = randomUUID();
    const missing = await payRoute(
      post(`/api/bookings/${unknown}/pay`, { outcome: "succeed" }, randomUUID()),
      idCtx(unknown),
    );
    expect(missing.status).toBe(404);
  });
});

describe("full flow through the API", () => {
  it("create → decline (402) → pay (200) → confirmation", async () => {
    const pid = await productIds();
    const createRes = await createBookingRoute(
      post("/api/bookings", garbaBooking(pid), randomUUID()),
      noCtx,
    );
    const booking = (await createRes.json()) as CreateBookingResponse;

    const declined = await payRoute(
      post(`/api/bookings/${booking.bookingId}/pay`, { outcome: "decline" }, randomUUID()),
      idCtx(booking.bookingId),
    );
    expect(declined.status).toBe(402);

    const paid = await payRoute(
      post(`/api/bookings/${booking.bookingId}/pay`, { outcome: "succeed" }, randomUUID()),
      idCtx(booking.bookingId),
    );
    expect(paid.status).toBe(200);

    const view = await bookingRoute(
      new Request(`http://test/api/bookings/${booking.bookingId}?token=${booking.accessToken}`),
      idCtx(booking.bookingId),
    );
    expect(view.status).toBe(200);
    expect(await view.json()).toMatchObject({ status: "confirmed", totalCents: 4000 + 3000 });
  });
});

describe("everything about the event comes from data", () => {
  it("GET /api/events lists the event with its venue, dates and lowest price", async () => {
    const response = await eventsRoute(new Request("http://test/api/events"), noCtx);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      events: [
        expect.objectContaining({
          slug: "sharad-utsav-2026",
          name: "Sharad Utsav 2026",
          venue: "Radha Krishna Temple, Allen, Texas",
          currency: "USD",
          firstDay: "2026-11-10",
          lastDay: "2026-11-14",
          lowestEntryPriceCents: 800,
        }),
      ],
    });
  });

  it("the confirmation carries its own event, so the page needs no constants", async () => {
    const pid = await productIds();
    const created = (await (
      await createBookingRoute(post("/api/bookings", garbaBooking(pid), randomUUID()), noCtx)
    ).json()) as CreateBookingResponse;
    const view = await bookingRoute(
      new Request(`http://test/api/bookings/${created.bookingId}?token=${created.accessToken}`),
      idCtx(created.bookingId),
    );
    expect(await view.json()).toMatchObject({
      event: { slug: "sharad-utsav-2026", name: "Sharad Utsav 2026", currency: "USD" },
    });
  });
});
