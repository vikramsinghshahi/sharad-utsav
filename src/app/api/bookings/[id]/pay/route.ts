import { z } from "zod";
import { payRequestSchema } from "@/contracts/requests";
import { getUseCases } from "@/infrastructure/container";
import { readJson, route } from "../../../_lib/handler";
import { idempotent } from "../../../_lib/idempotency";
import { problem, toStored } from "../../../_lib/problem";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/bookings/{id}/pay — simulated payment (SPEC §7).
export const POST = route<Ctx>("booking.pay", async (request, { params }, meta) => {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) {
    return problem(404, "BOOKING_NOT_FOUND", "Booking not found", meta);
  }
  const body = await readJson(request, payRequestSchema, meta);
  if (!body.ok) return body.response;
  const useCases = getUseCases();
  return idempotent(
    request,
    `bookings.pay:${id}`,
    body.data,
    useCases.idempotency,
    meta,
    async () => toStored(await useCases.payBooking(id, body.data), 200, meta.requestId),
  );
});
