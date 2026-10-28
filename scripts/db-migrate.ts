// Applies pending SQL migrations to whatever DATABASE_URL points at
// (local Postgres or Neon). Safe to re-run: applied migrations are skipped.
import "./load-env";
import { migrate as migrateNeon } from "drizzle-orm/neon-serverless/migrator";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { MIGRATIONS_FOLDER, runDbScript } from "./db-common";

void runDbScript("Migrating", async (handle) => {
  const config = { migrationsFolder: MIGRATIONS_FOLDER };
  if (handle.driver === "neon") await migrateNeon(handle.db, config);
  else await migratePg(handle.db, config);
});
