import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    // Integration tests need a database: `pnpm test:integration`.
    exclude: ["tests/integration/**", "**/node_modules/**"],
    environment: "node",
  },
});
