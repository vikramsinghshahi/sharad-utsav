import { loadEnvConfig } from "@next/env";

// The integration tests wipe the database they run against, so refuse anything
// that doesn't look like a dedicated test database.
export function testDatabaseUrl(): string {
  loadEnvConfig(process.cwd());
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("Set TEST_DATABASE_URL (see .env.example) to run integration tests.");
  const name = new URL(url).pathname.replace(/^\//, "");
  if (!name.includes("test")) {
    throw new Error(
      `Refusing to run against "${name}": the test database name must contain "test".`,
    );
  }
  return url;
}
