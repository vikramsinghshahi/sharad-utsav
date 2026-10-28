import { createDb, type DbHandle } from "@/infrastructure/db/client";
import { getEnv } from "@/lib/env";

// host/database only — never print credentials.
export function describeDatabase(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  return `${url.hostname}${url.port ? `:${url.port}` : ""}${url.pathname}`;
}

// Opens a connection to DATABASE_URL, runs `task`, always closes, and sets the exit code.
export async function runDbScript(
  label: string,
  task: (handle: DbHandle) => Promise<void>,
): Promise<void> {
  const { DATABASE_URL } = getEnv();
  const handle = createDb(DATABASE_URL);
  console.log(`${label} ${describeDatabase(DATABASE_URL)} (driver: ${handle.driver})…`);
  try {
    await task(handle);
    console.log(`${label} done.`);
  } catch (error) {
    console.error(`${label} failed:`, error);
    process.exitCode = 1;
  } finally {
    await handle.close();
  }
}
