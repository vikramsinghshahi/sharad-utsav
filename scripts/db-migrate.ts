// Applies pending SQL migrations to whatever DATABASE_URL points at
// (local Postgres or Neon). Safe to re-run: applied migrations are skipped.
import "./load-env";
import { runMigrations } from "@/infrastructure/db/migrate";
import { runDbScript } from "./db-common";

void runDbScript("Migrating", runMigrations);
