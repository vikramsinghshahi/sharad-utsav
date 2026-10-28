import { migrate as migrateNeon } from "drizzle-orm/neon-serverless/migrator";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import type { DbHandle } from "./client";

export const MIGRATIONS_FOLDER = "src/infrastructure/db/migrations";

// Applies pending migrations with the migrator that matches the driver.
// Safe to re-run: applied migrations are skipped.
export async function runMigrations(handle: DbHandle): Promise<void> {
  const config = { migrationsFolder: MIGRATIONS_FOLDER };
  if (handle.driver === "neon") await migrateNeon(handle.db, config);
  else await migratePg(handle.db, config);
}
