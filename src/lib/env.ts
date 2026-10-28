import { z } from "zod";

const envSchema = z.object({
  // Local Postgres or Neon. Switching environments means changing only this URL.
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${problems}\nSee .env.example.`);
  }
  return result.data;
}

let cached: Env | undefined;

// Parsed on first use, not on import, so modules stay importable in tests.
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
