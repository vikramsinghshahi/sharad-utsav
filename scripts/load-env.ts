// Side-effect import: load .env* files the same way Next.js does, before
// anything reads process.env. Must be the first import in a script.
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());
