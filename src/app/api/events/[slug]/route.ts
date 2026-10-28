import { getUseCases } from "@/infrastructure/container";
import { route } from "../../_lib/handler";
import { respond, toStored } from "../../_lib/problem";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

// GET /api/events/{slug} — catalog with live availability (SPEC §7).
export const GET = route<Ctx>("catalog.get", async (_request, { params }, meta) => {
  const { slug } = await params;
  const result = await getUseCases().getCatalog(slug);
  const response = respond(toStored(result, 200, meta.requestId));
  // Stock changes with every booking; never serve a cached copy.
  response.headers.set("cache-control", "no-store");
  return response;
});
