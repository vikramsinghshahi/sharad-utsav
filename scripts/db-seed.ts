// Seeds the Sharad Utsav 2026 catalog into whatever DATABASE_URL points at.
// Safe to re-run: never resets remaining stock or promo redemptions.
import "./load-env";
import { env } from "@/lib/env";
import { createDb } from "@/infrastructure/db/client";
import { seed } from "@/infrastructure/db/seed";
import { describeDatabase } from "./db-common";

async function main() {
  const handle = createDb(env.DATABASE_URL);
  console.log(`Seeding ${describeDatabase(env.DATABASE_URL)} (driver: ${handle.driver})…`);
  try {
    await seed(handle.db);
    console.log("Seed complete.");
  } finally {
    await handle.close();
  }
}

main().catch((error: unknown) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
