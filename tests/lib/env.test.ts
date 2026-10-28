import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";

describe("parseEnv", () => {
  it("accepts postgres and postgresql URLs", () => {
    expect(parseEnv({ DATABASE_URL: "postgres://me@localhost:5432/db" }).DATABASE_URL).toBe(
      "postgres://me@localhost:5432/db",
    );
    expect(() => parseEnv({ DATABASE_URL: "postgresql://u:p@x.neon.tech/db" })).not.toThrow();
  });

  it("fails fast with a readable message when DATABASE_URL is missing or not Postgres", () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
    expect(() => parseEnv({ DATABASE_URL: "mysql://localhost/db" })).toThrow(/DATABASE_URL/);
    expect(() => parseEnv({ DATABASE_URL: "not a url" })).toThrow(/DATABASE_URL/);
  });

  it("never echoes the connection string in the error", () => {
    expect(() => parseEnv({ DATABASE_URL: "mysql://user:s3cret@host/db" })).not.toThrow(/s3cret/);
  });
});
