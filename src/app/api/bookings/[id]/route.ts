import { z } from "zod";
import { getUseCases } from "@/infrastructure/container";
import { route } from "../../_lib/handler";
import { problem, respond, toStored } from "../../_lib/problem";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/bookings/{id}?token=… — confirmation page data (SPEC §7).
export const GET = route<Ctx>("booking.get", async (request, { params }, meta) => {
  const { id } = await params;
  const token = new URL(request.url).searchParams.get("token") ?? "";
  // Malformed ids and missing tokens look the same as an unknown booking.
  if (!z.uuid().safeParse(id).success || token === "") {
    return problem(404, "BOOKING_NOT_FOUND", "Booking not found", meta);
  }
  const response = respond(
    toStored(await getUseCases().getBooking(id, token), 200, meta.requestId),
  );
  response.headers.set("cache-control", "private, no-store");
  return response;
});
