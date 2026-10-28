export const MIGRATIONS_FOLDER = "src/infrastructure/db/migrations";

// host/database only — never print credentials.
export function describeDatabase(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  return `${url.hostname}${url.port ? `:${url.port}` : ""}${url.pathname}`;
}
