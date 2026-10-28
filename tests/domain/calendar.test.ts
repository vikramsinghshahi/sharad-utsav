import { describe, expect, it } from "vitest";
import { parseIsoDate, todayIn, toIsoDate } from "@/domain/calendar";

describe("parseIsoDate", () => {
  it("accepts real YYYY-MM-DD dates", () => {
    expect(parseIsoDate("2026-11-10")).toBe("2026-11-10");
    expect(parseIsoDate("2024-02-29")).toBe("2024-02-29");
  });

  it("rejects impossible dates and other formats", () => {
    for (const bad of [
      "2026-02-29",
      "2026-02-30",
      "2026-13-01",
      "2026-00-10",
      "2026-11-1",
      "11/10/2026",
      "2026-11-10T00:00:00Z",
      "",
      "seven",
    ]) {
      expect(parseIsoDate(bad)).toBeNull();
    }
  });

  it("toIsoDate throws on invalid input", () => {
    expect(() => toIsoDate("2026-02-30")).toThrow(RangeError);
  });
});

describe("todayIn", () => {
  it("uses the event timezone, not UTC (D21)", () => {
    // 03:00 UTC on 1 Oct is still 30 Sep in Texas (UTC-5 in daylight time).
    const now = new Date("2026-10-01T03:00:00Z");
    expect(todayIn("America/Chicago", now)).toBe("2026-09-30");
    expect(todayIn("UTC", now)).toBe("2026-10-01");
  });

  it("handles the standard-time offset during the festival (UTC-6)", () => {
    expect(todayIn("America/Chicago", new Date("2026-11-10T05:59:00Z"))).toBe("2026-11-09");
    expect(todayIn("America/Chicago", new Date("2026-11-10T06:00:00Z"))).toBe("2026-11-10");
  });
});
