import { sql } from "drizzle-orm";
import { getDbHandle } from "@/infrastructure/db/client";

export const dynamic = "force-dynamic";

// Liveness + DB connectivity check. Reports the driver in use, never the URL.
export async function GET() {
  const { driver, db } = getDbHandle();
  try {
    await db.execute(sql`select 1`);
    return Response.json({ status: "ok", database: { driver, reachable: true } });
  } catch (error) {
    console.error("Health check: database unreachable", error);
    return Response.json(
      { status: "degraded", database: { driver, reachable: false } },
      { status: 503 },
    );
  }
}
