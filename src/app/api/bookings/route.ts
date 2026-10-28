import { createBookingRequestSchema } from "@/contracts/requests";
import { getUseCases } from "@/infrastructure/container";
import { readJson, route } from "../_lib/handler";
import { idempotent } from "../_lib/idempotency";
import { toStored } from "../_lib/problem";

export const dynamic = "force-dynamic";

// POST /api/bookings — validate, re-price, hold stock, reserve promo (SPEC §7, §8.2).
export const POST = route("booking.create", async (request, _ctx, meta) => {
  const body = await readJson(request, createBookingRequestSchema, meta);
  if (!body.ok) return body.response;
  const useCases = getUseCases();
  return idempotent(request, "bookings.create", body.data, useCases.idempotency, meta, async () =>
    toStored(await useCases.createBooking(body.data), 201, meta.requestId),
  );
});
