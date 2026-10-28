// Seeds the Sharad Utsav 2026 catalog into whatever DATABASE_URL points at.
// Safe to re-run: never resets remaining stock or promo redemptions.
import "./load-env";
import { seed } from "@/infrastructure/db/seed";
import { runDbScript } from "./db-common";

void runDbScript("Seeding", (handle) => seed(handle.db));
