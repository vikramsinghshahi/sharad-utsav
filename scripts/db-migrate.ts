// Applies pending SQL migrations to whatever DATABASE_URL points at
// (local Postgres or Neon). Safe to re-run: applied migrations are skipped.
import "./load-env";
import { migrate as migrateNeon } from "drizzle-orm/neon-serverless/migrator";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { env } from "@/lib/env";
import { createDb } from "@/infrastructure/db/client";
import { describeDatabase, MIGRATIONS_FOLDER } from "./db-common";

async function main() {
  const handle = createDb(env.DATABASE_URL);
  console.log(`Migrating ${describeDatabase(env.DATABASE_URL)} (driver: ${handle.driver})…`);
  try {
    if (handle.driver === "neon") {
      await migrateNeon(handle.db, { migrationsFolder: MIGRATIONS_FOLDER });
    } else {
      await migratePg(handle.db, { migrationsFolder: MIGRATIONS_FOLDER });
    }
    console.log("Migrations applied.");
  } finally {
    await handle.close();
  }
}

main().catch((error: unknown) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
