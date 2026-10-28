import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

loadEnvConfig(process.cwd());

// Used by `pnpm db:generate` (diff schema.ts → new SQL migration) and `pnpm db:studio`.
// Migrations are applied with `pnpm db:migrate`, which picks the right driver from the URL.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/infrastructure/db/schema.ts",
  out: "./src/infrastructure/db/migrations",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true,
  verbose: true,
});
