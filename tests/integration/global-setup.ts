// Relative imports: global setup runs outside the test module graph, where the
// "@/" alias is not applied.
import { createDb } from "../../src/infrastructure/db/client";
import { runMigrations } from "../../src/infrastructure/db/migrate";
import { testDatabaseUrl } from "./test-database";

export default async function setup() {
  const handle = createDb(testDatabaseUrl());
  try {
    await runMigrations(handle);
  } finally {
    await handle.close();
  }
}
