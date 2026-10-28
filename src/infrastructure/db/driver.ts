export type DbDriver = "neon" | "pg";

// Neon hosts get the serverless WebSocket driver (supports multi-statement
// transactions on Vercel); everything else, e.g. local Postgres, gets node-postgres.
export function resolveDriver(databaseUrl: string): DbDriver {
  const { hostname } = new URL(databaseUrl);
  return hostname === "neon.tech" || hostname.endsWith(".neon.tech") ? "neon" : "pg";
}
