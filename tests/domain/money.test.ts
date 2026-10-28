import { describe, expect, it } from "vitest";
import {
  addCents,
  allocate,
  minCents,
  multiplyCents,
  percentOf,
  subtractCents,
  sumCents,
  toCents,
  type Cents,
} from "@/domain/money";

const c = (values: number[]): Cents[] => values.map(toCents);

describe("toCents", () => {
  it("accepts non-negative integers", () => {
    expect(toCents(0)).toBe(0);
    expect(toCents(14670)).toBe(14670);
  });

  it("rejects floats, negatives, NaN and unsafe integers", () => {
    for (const bad of [146.7, -1, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53]) {
      expect(() => toCents(bad)).toThrow(RangeError);
    }
  });
});

describe("arithmetic", () => {
  it("adds and sums exactly", () => {
    expect(addCents(toCents(1500), toCents(800), toCents(1200))).toBe(3500);
    expect(sumCents([])).toBe(0);
  });

  it("never produces the classic float total", () => {
    // 0.1 + 0.2 style drift cannot happen in cents.
    expect(addCents(toCents(10), toCents(20))).toBe(30);
    expect(multiplyCents(toCents(1467), 10)).toBe(14670);
  });

  it("refuses to go negative (D10)", () => {
    expect(subtractCents(toCents(2000), toCents(1500))).toBe(500);
    expect(() => subtractCents(toCents(1500), toCents(2000))).toThrow(RangeError);
  });

  it("multiplies by whole quantities only", () => {
    expect(multiplyCents(toCents(1500), 5)).toBe(7500);
    expect(() => multiplyCents(toCents(1500), 1.5)).toThrow(RangeError);
    expect(() => multiplyCents(toCents(1500), -1)).toThrow(RangeError);
  });

  it("caps with minCents (FLAT20 on a $15 booking)", () => {
    expect(minCents(toCents(2000), toCents(1500))).toBe(1500);
  });
});

describe("percentOf", () => {
  it("10% of 14670 is 1467", () => {
    expect(percentOf(toCents(14670), 10)).toBe(1467);
  });

  it("rounds half up, once", () => {
    expect(percentOf(toCents(5), 10)).toBe(1); // 0.5 → 1
    expect(percentOf(toCents(4), 10)).toBe(0); // 0.4 → 0
    expect(percentOf(toCents(14675), 10)).toBe(1468); // 1467.5 → 1468
    expect(percentOf(toCents(14674), 10)).toBe(1467); // 1467.4 → 1467
  });

  it("handles 0% and 100%", () => {
    expect(percentOf(toCents(9999), 0)).toBe(0);
    expect(percentOf(toCents(9999), 100)).toBe(9999);
  });

  it("rejects non-integer or out-of-range percents", () => {
    expect(() => percentOf(toCents(100), 10.5)).toThrow(RangeError);
    expect(() => percentOf(toCents(100), 101)).toThrow(RangeError);
    expect(() => percentOf(toCents(100), -5)).toThrow(RangeError);
  });
});

describe("allocate (largest remainder)", () => {
  it("parts always sum exactly to the total", () => {
    const weights = c([1500, 1500, 800, 1200, 2000]);
    for (const total of [0, 1, 7, 700, 699, 2000, 7000]) {
      expect(sumCents(allocate(toCents(total), weights))).toBe(total);
    }
  });

  it("splits proportionally and gives leftovers to the largest remainders", () => {
    // 10 split over 1:1:1 → 3.33 each → one line gets the extra cent (earliest on a tie).
    expect(allocate(toCents(10), c([100, 100, 100]))).toEqual([4, 3, 3]);
    // 100 over 1:2 → 33.33 / 66.67 → the larger remainder (second) gets the cent.
    expect(allocate(toCents(100), c([100, 200]))).toEqual([33, 67]);
  });

  it("never gives a line more than its own amount", () => {
    const weights = c([1, 1, 9998]);
    const parts = allocate(toCents(9999), weights);
    parts.forEach((part, i) => expect(part).toBeLessThanOrEqual(weights[i] ?? 0));
    expect(sumCents(parts)).toBe(9999);
  });

  it("gives zero-weight lines nothing", () => {
    expect(allocate(toCents(500), c([0, 1000, 0]))).toEqual([0, 500, 0]);
  });

  it("allocates the full amount when total equals the weights", () => {
    expect(allocate(toCents(3500), c([1500, 800, 1200]))).toEqual([1500, 800, 1200]);
  });

  it("handles all-zero weights and empty input", () => {
    expect(allocate(toCents(0), c([0, 0]))).toEqual([0, 0]);
    expect(allocate(toCents(0), [])).toEqual([]);
  });

  it("refuses to allocate more than the weights add up to", () => {
    expect(() => allocate(toCents(101), c([50, 50]))).toThrow(RangeError);
  });
});
