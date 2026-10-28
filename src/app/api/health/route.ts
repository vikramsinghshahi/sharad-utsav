import { pingDatabase } from "@/infrastructure/db/client";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// Liveness + DB connectivity check. Never exposes the connection URL.
export async function GET() {
  try {
    const database = await pingDatabase();
    return Response.json({ status: "ok", database });
  } catch (error) {
    logger.error("health.database_unreachable", { error });
    return Response.json({ status: "degraded", database: { reachable: false } }, { status: 503 });
  }
}
