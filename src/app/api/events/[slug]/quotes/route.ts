import { bookingDraftSchema } from "@/contracts/requests";
import { getUseCases } from "@/infrastructure/container";
import { readJson, route } from "../../../_lib/handler";
import { respond, toStored } from "../../../_lib/problem";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

// POST /api/events/{slug}/quotes — price a draft, no side effects (SPEC §7).
export const POST = route<Ctx>("quote.create", async (request, { params }, meta) => {
  const { slug } = await params;
  const body = await readJson(request, bookingDraftSchema, meta);
  if (!body.ok) return body.response;
  const result = await getUseCases().quoteBooking(slug, body.data);
  return respond(toStored(result, 200, meta.requestId));
});
