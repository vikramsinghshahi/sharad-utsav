import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import prettier from "eslint-config-prettier";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const DB_DRIVERS = ["drizzle-orm", "drizzle-orm/*", "pg", "@neondatabase/*", "ws"];
const FRAMEWORK = ["next", "next/*", "react", "react-dom"];

// Layer boundaries (SPEC §2.2). Dependencies point downward only:
// UI → API → application → domain; infrastructure implements what the layers above need.
const layer = (files, patterns, message) => ({
  files,
  rules: {
    "no-restricted-imports": ["error", { patterns: [{ group: patterns, message }] }],
  },
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
  layer(
    ["src/domain/**"],
    [
      "@/app/*",
      "@/application/*",
      "@/infrastructure/*",
      "@/features/*",
      ...DB_DRIVERS,
      ...FRAMEWORK,
    ],
    "domain/ is pure TypeScript: no I/O, framework, or outer-layer imports.",
  ),
  layer(
    ["src/application/**"],
    ["@/app/*", "@/features/*", "@/infrastructure/*", ...DB_DRIVERS, ...FRAMEWORK],
    "application/ depends on its own ports (ports.ts); infrastructure implements them.",
  ),
  layer(
    ["src/contracts/**"],
    [
      "@/app/*",
      "@/application/*",
      "@/infrastructure/*",
      "@/features/*",
      ...DB_DRIVERS,
      ...FRAMEWORK,
    ],
    "contracts/ is shared with the browser: only zod and domain types.",
  ),
  layer(
    ["src/app/api/**"],
    ["@/features/*", ...DB_DRIVERS],
    "Route handlers stay thin: call application/infrastructure functions, never a DB driver directly.",
  ),
  layer(
    ["src/features/**", "src/app/**/page.tsx", "src/app/**/layout.tsx"],
    ["@/infrastructure/*", "@/application/*", ...DB_DRIVERS],
    "UI talks to the backend over HTTP (/api/*), never to the DB or use-cases directly.",
  ),
  {
    // Scripts and the structured logger are allowed to print.
    files: ["scripts/**", "src/lib/logger.ts"],
    rules: { "no-console": "off" },
  },
  prettier,
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "src/infrastructure/db/migrations/**",
    ],
  },
];

export default eslintConfig;
