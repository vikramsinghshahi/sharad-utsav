import { describe, expect, it } from "vitest";
import type { Quote } from "@/domain/pricing/types";
import {
  ALL_DAYS,
  allDays,
  buildCatalog,
  dayPass,
  DOB,
  draft,
  familyEntry,
  noEntry,
  person,
  quote,
} from "../fixtures/booking";

const adult = (dates: string[]) => person(DOB.adult40, dayPass("DAY_ADULT", dates));
const child = (dates: string[]) => person(DOB.child7, dayPass("DAY_CHILD", dates));
const N10 = ["2026-11-10"];

function expectConsistent(q: Quote) {
  const lineSum = q.lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
  expect(lineSum).toBe(q.totalCents);
  expect(q.totalCents).toBe(q.subtotalCents - q.discountCents);
  for (const line of q.lines) {
    expect(line.lineTotalCents).toBe(line.qty * line.unitPriceCents - line.discountCents);
    expect(line.lineTotalCents).toBeGreaterThanOrEqual(0);
  }
}

function family(ids: string[], date = "2026-11-10", id = "f1") {
  return { id, productId: "FAMILY", date, attendeeClientIds: ids };
}

describe("lines and subtotal", () => {
  it("prices day passes per person per day", () => {
    const q = quote(
      draft({
        attendees: [
          adult(["2026-11-10", "2026-11-11", "2026-11-12"]),
          child(["2026-11-10", "2026-11-11"]),
        ],
      }),
    );
    expect(q.lines).toHaveLength(5);
    expect(q.subtotalCents).toBe(3 * 1500 + 2 * 800);
    expect(q.totalCents).toBe(6100);
    expectConsistent(q);
  });

  it("infants are free and produce no line", () => {
    const q = quote(draft({ attendees: [adult(N10), person(DOB.infant2, noEntry)] }));
    expect(q.lines).toHaveLength(1);
    expect(q.totalCents).toBe(1500);
  });

  it("prices all-day passes flat and extras per person per day", () => {
    const a = person(DOB.adult40, dayPass("DAY_ADULT", ALL_DAYS)); // the child needs an adult every day
    const c = person(DOB.child7, allDays("ALLDAY_CHILD"));
    const q = quote(
      draft({
        attendees: [a, c],
        extras: [
          {
            productId: "DINNER",
            attendeeClientId: a.clientId,
            dates: ["2026-11-11", "2026-11-13"],
          },
          { productId: "GARBA", attendeeClientId: a.clientId, dates: ["2026-11-13"] },
          { productId: "DANDIYA", quantity: 3 },
        ],
      }),
    );
    // 5×$15 + $30 + 2×$12 + $20 + 3×$5
    expect(q.subtotalCents).toBe(7500 + 3000 + 2400 + 2000 + 1500);
    expect(q.lines.find((l) => l.productCode === "DANDIYA")).toMatchObject({
      qty: 3,
      lineTotalCents: 1500,
    });
    expectConsistent(q);
  });

  it("D20: a family pass on two days is two $40 passes", () => {
    const [a, c] = [person(DOB.adult40, familyEntry), person(DOB.child7, familyEntry)];
    const ids = [a.clientId, c.clientId];
    const q = quote(
      draft({
        attendees: [a, c],
        familyGroups: [family(ids, "2026-11-10", "f1"), family(ids, "2026-11-12", "f2")],
      }),
    );
    expect(q.lines.map((l) => [l.productCode, l.date, l.lineTotalCents])).toEqual([
      ["FAMILY", "2026-11-10", 4000],
      ["FAMILY", "2026-11-12", 4000],
    ]);
  });
});

describe("promos", () => {
  it("SEVA10 takes 10% off tickets and extras, split exactly across lines", () => {
    const a = adult(N10);
    const q = quote(
      draft({
        attendees: [a, child(N10)],
        extras: [
          { productId: "DINNER", attendeeClientId: a.clientId, dates: N10 },
          { productId: "DANDIYA", quantity: 3 },
        ],
        promoCode: "seva10",
      }),
    );
    // 1500 + 800 + 1200 + 1500 = 5000 → 500 off
    expect(q.subtotalCents).toBe(5000);
    expect(q.discountCents).toBe(500);
    expect(q.totalCents).toBe(4500);
    expect(q.promo).toEqual({
      status: "applied",
      code: "SEVA10",
      kind: "percent",
      discountCents: 500,
    });
    expectConsistent(q);
  });

  it("splits an uneven discount across lines so they still add up exactly", () => {
    // $20 off $15 + $8: 1304.35 / 695.65 → largest remainder gets the spare cent.
    const q = quote(draft({ attendees: [adult(N10), child(N10)], promoCode: "FLAT20" }));
    expect(q.lines.map((l) => l.discountCents)).toEqual([1304, 696]);
    expect(q.lines.map((l) => l.lineTotalCents)).toEqual([196, 104]);
    expect(q.totalCents).toBe(300);
    expectConsistent(q);
  });

  it("FLAT20 takes $20 off", () => {
    const q = quote(
      draft({ attendees: [adult(["2026-11-10", "2026-11-11"])], promoCode: "FLAT20" }),
    );
    expect([q.subtotalCents, q.discountCents, q.totalCents]).toEqual([3000, 2000, 1000]);
    expectConsistent(q);
  });

  it("D10: FLAT20 on a $15 booking stops at $0, never negative", () => {
    const q = quote(draft({ attendees: [adult(N10)], promoCode: "FLAT20" }));
    expect([q.subtotalCents, q.discountCents, q.totalCents]).toEqual([1500, 1500, 0]);
    expect(q.promo).toMatchObject({ status: "applied", discountCents: 1500 });
    expectConsistent(q);
  });

  it("KIDSFREE frees child day and all-day passes only", () => {
    const a = adult(ALL_DAYS);
    const q = quote(
      draft({
        attendees: [
          a,
          child(["2026-11-10", "2026-11-11"]),
          person(DOB.child9, allDays("ALLDAY_CHILD")),
        ],
        extras: [{ productId: "DINNER", attendeeClientId: a.clientId, dates: N10 }],
        promoCode: "KIDSFREE",
      }),
    );
    expect(
      q.lines.filter((l) => l.productCode.endsWith("CHILD")).every((l) => l.lineTotalCents === 0),
    ).toBe(true);
    expect(q.discountCents).toBe(2 * 800 + 3000);
    expect(q.totalCents).toBe(7500 + 1200);
    expectConsistent(q);
  });

  it("D11: KIDSFREE does not touch a family pass", () => {
    const [a, c] = [person(DOB.adult40, familyEntry), person(DOB.child7, familyEntry)];
    const q = quote(
      draft({
        attendees: [a, c],
        familyGroups: [family([a.clientId, c.clientId])],
        promoCode: "KIDSFREE",
      }),
    );
    expect(q.totalCents).toBe(4000);
    expect(q.promo).toEqual({
      status: "not_applicable",
      code: "KIDSFREE",
      reason: "no_child_tickets",
    });
  });

  it("KIDSFREE with no children explains why it did not apply", () => {
    const q = quote(draft({ attendees: [adult(N10)], promoCode: "KIDSFREE" }));
    expect(q.totalCents).toBe(1500);
    expect(q.promo).toMatchObject({ status: "not_applicable", reason: "no_child_tickets" });
  });

  it.each([
    ["EXPIRED5", { status: "expired", code: "EXPIRED5", validTo: "2026-09-30" }],
    ["MAXEDOUT", { status: "exhausted", code: "MAXEDOUT" }],
    ["NOTACODE", { status: "unknown", code: "NOTACODE" }],
  ])("%s is reported and ignored, never blocking the booking", (code, outcome) => {
    const q = quote(draft({ attendees: [adult(N10)], promoCode: code }));
    expect(q.totalCents).toBe(1500);
    expect(q.discountCents).toBe(0);
    expect(q.promo).toEqual(outcome);
  });

  it("no code means no promo", () => {
    expect(quote(draft({ attendees: [adult(N10)] })).promo).toEqual({ status: "none" });
  });

  it("totals stay consistent for every promo × mixed booking", () => {
    for (const promoCode of ["SEVA10", "FLAT20", "KIDSFREE", "EXPIRED5", undefined]) {
      const a = adult(["2026-11-11", "2026-11-13"]);
      const q = quote(
        draft({
          attendees: [a, child(["2026-11-11"]), person(DOB.infant2, noEntry)],
          extras: [
            {
              productId: "GARBA",
              attendeeClientId: a.clientId,
              dates: ["2026-11-11", "2026-11-13"],
            },
            { productId: "DANDIYA", quantity: 7 },
          ],
          promoCode,
        }),
      );
      expectConsistent(q);
    }
  });
});

describe("hints (D2, D3, D4)", () => {
  it("D4: a child on 5 day passes is told the all-day pass saves $10", () => {
    const c = child(ALL_DAYS);
    const q = quote(draft({ attendees: [adult(ALL_DAYS), c] }));
    expect(q.totalCents).toBe(5 * 1500 + 5 * 800); // never switched silently
    expect(q.suggestions).toEqual([
      {
        code: "SWITCH_TO_ALL_DAYS",
        attendeeClientId: c.clientId,
        fromProductId: "DAY_CHILD",
        toProductId: "ALLDAY_CHILD",
        savingsCents: 1000,
      },
    ]);
  });

  it("D4: 4 child days ($32) still beat by the $30 all-day pass", () => {
    const q = quote(draft({ attendees: [adult(ALL_DAYS), child(ALL_DAYS.slice(0, 4))] }));
    expect(q.suggestions).toMatchObject([{ code: "SWITCH_TO_ALL_DAYS", savingsCents: 200 }]);
  });

  it("D4: no bogus hint when KIDSFREE already makes child days free", () => {
    const q = quote(
      draft({ attendees: [adult(ALL_DAYS), child(ALL_DAYS)], promoCode: "KIDSFREE" }),
    );
    expect(q.suggestions).toEqual([]);
  });

  it("D2: the adult all-day pass is sold out, so 5 day passes cost $75 with a notice", () => {
    const a = adult(ALL_DAYS);
    const q = quote(draft({ attendees: [a] }));
    expect(q.totalCents).toBe(7500);
    expect(q.suggestions).toEqual([]);
    expect(q.warnings).toEqual([
      {
        code: "ALL_DAYS_SOLD_OUT",
        path: ["attendees", 0, "entry"],
        params: { productCode: "ALLDAY_ADULT", dayPassTotalCents: 7500, allDaysPriceCents: 6000 },
      },
    ]);
  });

  it("D4 for adults when the all-day pass is back in stock", () => {
    const catalog = buildCatalog({ ALLDAY_ADULT: { remaining: 5 } });
    const q = quote(draft({ attendees: [adult(ALL_DAYS)] }), { catalog });
    expect(q.suggestions).toMatchObject([{ toProductId: "ALLDAY_ADULT", savingsCents: 1500 }]);
  });

  it("D3: a family pass for 2 adults + 1 child is told day passes are $2 cheaper", () => {
    const members = [
      person(DOB.adult40, familyEntry),
      person(DOB.adult40, familyEntry),
      person(DOB.child7, familyEntry),
    ];
    const q = quote(
      draft({ attendees: members, familyGroups: [family(members.map((m) => m.clientId))] }),
    );
    expect(q.totalCents).toBe(4000);
    expect(q.suggestions).toEqual([
      { code: "USE_SEPARATE_DAY_PASSES", familyGroupId: "f1", savingsCents: 200 },
    ]);
  });

  it("D3: no hint when the family pass is the better deal (2+2 = $46 on day passes)", () => {
    const members = [DOB.adult40, DOB.adult40, DOB.child7, DOB.child9].map((dob) =>
      person(dob, familyEntry),
    );
    const q = quote(
      draft({ attendees: members, familyGroups: [family(members.map((m) => m.clientId))] }),
    );
    expect(q.suggestions).toEqual([]);
  });
});
