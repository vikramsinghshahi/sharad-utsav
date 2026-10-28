import { z } from "zod";

const envSchema = z.object({
  // Local Postgres or Neon. Switching environments means changing only this URL.
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${problems}\nSee .env.example.`);
  }
  return result.data;
}

export const env = parseEnv();
