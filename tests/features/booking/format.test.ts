import { describe, expect, it } from "vitest";
import { formatCountdown, formatDay, formatLongDate, formatMoney } from "@/features/booking/format";

describe("format", () => {
  it("prints cents as US dollars", () => {
    expect(formatMoney(14670)).toBe("$146.70");
    expect(formatMoney(0)).toBe("$0.00");
  });

  it("prints ISO dates without shifting the day", () => {
    expect(formatDay("2026-11-10")).toBe("Tue 10 Nov");
    expect(formatLongDate("2026-09-30")).toBe("30 Sep 2026");
  });

  it("prints a countdown as mm:ss and never below zero", () => {
    expect(formatCountdown(14 * 60_000 + 59_500)).toBe("15:00");
    expect(formatCountdown(61_000)).toBe("01:01");
    expect(formatCountdown(-5)).toBe("00:00");
  });
});
