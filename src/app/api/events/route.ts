import { getUseCases } from "@/infrastructure/container";
import { route } from "../_lib/handler";

export const dynamic = "force-dynamic";

// GET /api/events — upcoming events for the landing page.
export const GET = route("events.list", async () => {
  const response = Response.json(await getUseCases().listEvents());
  response.headers.set("cache-control", "no-store");
  return response;
});
