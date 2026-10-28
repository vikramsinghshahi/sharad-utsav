import { describe, expect, it } from "vitest";
import { ageBand, ageOn, checkBookerAge, parseDateOfBirth } from "@/domain/age";
import { toIsoDate } from "@/domain/calendar";

const FESTIVAL_START = toIsoDate("2026-11-10"); // D1: age is measured on day one
const TODAY = toIsoDate("2026-10-28");

describe("ageOn", () => {
  it("counts the birthday on the reference date itself", () => {
    expect(ageOn(toIsoDate("2014-11-10"), FESTIVAL_START)).toBe(12);
  });

  it("is one less the day before the birthday", () => {
    expect(ageOn(toIsoDate("2014-11-11"), FESTIVAL_START)).toBe(11);
  });

  it("D1: a child turning 12 mid-festival is still 11 for the whole festival", () => {
    expect(ageOn(toIsoDate("2014-11-12"), FESTIVAL_START)).toBe(11);
  });

  it("counts a birthday that fell the day before", () => {
    expect(ageOn(toIsoDate("2014-11-09"), FESTIVAL_START)).toBe(12);
  });

  it("treats a 29 Feb birthday as passed from 1 Mar in non-leap years", () => {
    const leapling = toIsoDate("2020-02-29");
    expect(ageOn(leapling, toIsoDate("2025-02-28"))).toBe(4);
    expect(ageOn(leapling, toIsoDate("2025-03-01"))).toBe(5);
    expect(ageOn(leapling, toIsoDate("2024-02-29"))).toBe(4);
  });

  it("is 0 for a baby born on the day", () => {
    expect(ageOn(FESTIVAL_START, FESTIVAL_START)).toBe(0);
  });
});

describe("ageBand", () => {
  it.each([
    [0, "infant"],
    [4, "infant"],
    [5, "child"],
    [11, "child"],
    [12, "adult"],
    [17, "adult"],
    [18, "adult"],
    [90, "adult"],
  ] as const)("age %i → %s", (age, band) => {
    expect(ageBand(age)).toBe(band);
  });

  it("puts a 7-year-old on a child ticket, never adult", () => {
    expect(ageBand(ageOn(toIsoDate("2019-06-01"), FESTIVAL_START))).toBe("child");
  });
});

describe("parseDateOfBirth (A6)", () => {
  it("accepts a plausible past date, trimming whitespace", () => {
    expect(parseDateOfBirth(" 1988-04-12 ", TODAY)).toEqual({ ok: true, value: "1988-04-12" });
  });

  it("accepts someone born today", () => {
    expect(parseDateOfBirth("2026-10-28", TODAY).ok).toBe(true);
  });

  it.each([["seven"], ["7"], [""], ["12/04/1988"], ["1988-02-30"], ["1988-4-12"]])(
    "rejects garbage %j as format",
    (input) => {
      expect(parseDateOfBirth(input, TODAY, ["attendees", 0, "dateOfBirth"])).toEqual({
        ok: false,
        issues: [
          {
            code: "INVALID_DOB",
            path: ["attendees", 0, "dateOfBirth"],
            params: { reason: "format" },
          },
        ],
      });
    },
  );

  it("rejects future dates", () => {
    const result = parseDateOfBirth("2026-10-29", TODAY);
    expect(result.ok ? null : result.issues[0]?.params).toEqual({ reason: "future" });
  });

  it("rejects ages over 120 and years like 1800", () => {
    for (const input of ["1905-10-27", "1800-01-01"]) {
      const result = parseDateOfBirth(input, TODAY);
      expect(result.ok ? null : result.issues[0]?.params).toEqual({ reason: "implausible" });
    }
    expect(parseDateOfBirth("1906-10-28", TODAY).ok).toBe(true); // exactly 120
  });
});

describe("checkBookerAge (A5)", () => {
  it("allows a booker who is 18 on the booking date", () => {
    expect(checkBookerAge(toIsoDate("2008-10-28"), TODAY).ok).toBe(true);
  });

  it("rejects a booker who turns 18 tomorrow, reporting their age", () => {
    expect(checkBookerAge(toIsoDate("2008-10-29"), TODAY)).toEqual({
      ok: false,
      issues: [{ code: "BOOKER_UNDER_18", path: ["booker", "dateOfBirth"], params: { age: 17 } }],
    });
  });

  it("uses the booking date, not the festival date", () => {
    // 18 by 10 Nov, but only 17 today, so they cannot pay yet.
    expect(checkBookerAge(toIsoDate("2008-11-05"), TODAY).ok).toBe(false);
  });
});
