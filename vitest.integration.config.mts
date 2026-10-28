import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Integration tests hit a real Postgres (TEST_DATABASE_URL) and share it, so
// files run one at a time.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    setupFiles: ["tests/integration/setup-env.ts"],
    globalSetup: ["tests/integration/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
