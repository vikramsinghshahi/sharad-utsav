import { describe, expect, it } from "vitest";
import { resolveDriver } from "@/infrastructure/db/driver";

describe("resolveDriver", () => {
  it("uses node-postgres for local Postgres", () => {
    expect(resolveDriver("postgres://me@localhost:5432/sharad_utsav_dev")).toBe("pg");
    expect(resolveDriver("postgresql://me:pw@127.0.0.1/db")).toBe("pg");
  });

  it("uses the Neon serverless driver for Neon hosts", () => {
    expect(
      resolveDriver(
        "postgresql://u:p@ep-cool-name-123456.us-east-2.aws.neon.tech/db?sslmode=require",
      ),
    ).toBe("neon");
    expect(
      resolveDriver("postgresql://u:p@ep-cool-name-123456-pooler.us-east-2.aws.neon.tech/db"),
    ).toBe("neon");
  });

  it("does not match look-alike hosts", () => {
    expect(resolveDriver("postgres://u@neon.tech.evil.example/db")).toBe("pg");
    expect(resolveDriver("postgres://u@notneon.tech/db")).toBe("pg");
  });
});
