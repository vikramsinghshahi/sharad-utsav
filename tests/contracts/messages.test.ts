import { describe, expect, it } from "vitest";
import { formatDateRange, formatDays, formatMoney } from "@/contracts/format";
import { messageFor } from "@/contracts/messages";

// Messages are built only from the issue's params and the domain's rules, so a
// festival with other dates, products or currency needs no copy changes.
describe("messageFor", () => {
  it("uses the reference date it is given, not a fixed festival date", () => {
    expect(
      messageFor({
        code: "AGE_BAND_MISMATCH",
        params: { age: 7, ageBand: "child", onDate: "2027-03-02" },
      }),
    ).toBe("They are 7 on Tue 2 Mar, so they need a child ticket.");
  });

  it("names the festival's own first and last day", () => {
    expect(
      messageFor({
        code: "INVALID_DAYS",
        params: { reason: "outside_festival", firstDate: "2027-03-02", lastDate: "2027-03-04" },
      }),
    ).toBe("Please pick days between Tue 2 Mar and Thu 4 Mar.");
  });

  it("formats ISO dates and names products", () => {
    expect(
      messageFor({
        code: "CHILD_UNACCOMPANIED",
        params: { firstName: "Aarav", dates: "2026-11-10, 2026-11-13" },
      }),
    ).toBe("Aarav needs someone aged 18 or over with them on Tue 10 Nov, Fri 13 Nov.");
    expect(
      messageFor({
        code: "CHILD_UNACCOMPANIED",
        params: { firstName: "Aarav", dates: "2026-11-10, 2026-11-11", festivalDayCount: 2 },
      }),
    ).toBe("Aarav needs someone aged 18 or over with them every day.");
    expect(messageFor({ code: "SOLD_OUT", params: { productName: "Garba Workshop" } })).toBe(
      "Sorry, Garba Workshop has sold out.",
    );
    expect(
      messageFor({
        code: "INSUFFICIENT_STOCK",
        params: { productName: "Dinner Plate", remaining: 3 },
      }),
    ).toBe("Only 3 left for Dinner Plate. Please reduce the quantity.");
  });

  it("has a sensible sentence even without params", () => {
    expect(messageFor({ code: "SOLD_OUT" })).toBe("Sorry, this has sold out.");
    expect(messageFor({ code: "DAY_NOT_ON_SALE" })).toBe("That day is no longer on sale.");
  });
});

describe("shared formatting", () => {
  it("prints money in the event's currency", () => {
    expect(formatMoney(14670, "USD")).toBe("$146.70");
    expect(formatMoney(14670, "EUR")).toBe("€146.70");
  });

  it("prints date ranges within and across months", () => {
    expect(formatDateRange("2026-11-10", "2026-11-14")).toBe("Tue 10 – Sat 14 Nov 2026");
    expect(formatDateRange("2026-11-30", "2026-12-01")).toBe("Mon 30 Nov – Tue 1 Dec 2026");
    expect(formatDays("2026-11-10,2026-11-11")).toBe("Tue 10 Nov, Wed 11 Nov");
  });
});
