import { timingSafeEqual } from "node:crypto";
import { getUseCases } from "@/infrastructure/container";
import { getEnv } from "@/lib/env";
import { route } from "../../_lib/handler";
import { problem } from "../../_lib/problem";

export const dynamic = "force-dynamic";

// GET /api/cron/expire-holds — daily safety net behind lazy cleanup (D16).
export const GET = route("cron.expire_holds", async (request, _ctx, meta) => {
  const secret = getEnv().CRON_SECRET;
  if (!secret || !isAuthorized(request.headers.get("authorization"), secret)) {
    return problem(401, "UNAUTHORIZED", "Missing or wrong cron secret", meta);
  }
  return Response.json(await getUseCases().expireHolds());
});

function isAuthorized(header: string | null, secret: string): boolean {
  const actual = Buffer.from(header ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
