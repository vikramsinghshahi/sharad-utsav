import { describe, expect, it } from "vitest";
import { validateBooker } from "@/domain/eligibility";
import type { DomainErrorCode } from "@/domain/errors";
import {
  ALL_DAYS,
  BEFORE_FESTIVAL,
  allDays,
  buildCatalog,
  clockAt,
  dayPass,
  DOB,
  draft,
  familyEntry,
  mustValidate,
  noEntry,
  person,
  validate,
} from "../fixtures/booking";

function codes(result: ReturnType<typeof validate>): DomainErrorCode[] {
  return result.ok ? [] : result.issues.map((i) => i.code);
}

function firstIssue(result: ReturnType<typeof validate>) {
  if (result.ok) throw new Error("expected issues");
  return result.issues[0];
}

const adult = (dates = ["2026-11-10"]) => person(DOB.adult40, dayPass("DAY_ADULT", dates));
const child = (dates = ["2026-11-10"]) => person(DOB.child7, dayPass("DAY_CHILD", dates));

describe("a normal family booking", () => {
  it("passes and derives ages on day one", () => {
    const booking = mustValidate(
      draft({ attendees: [adult(), adult(), child(), person(DOB.infant2, noEntry)] }),
    );
    expect(booking.attendees.map((a) => [a.age, a.ageBand])).toEqual([
      [40, "adult"],
      [40, "adult"],
      [7, "child"],
      [2, "infant"],
    ]);
  });
});

describe("age rules (§5.1)", () => {
  it("A3: rejects an adult ticket for a 7-year-old", () => {
    const result = validate(
      draft({ attendees: [adult(), person(DOB.child7, dayPass("DAY_ADULT", ["2026-11-10"]))] }),
    );
    expect(firstIssue(result)).toEqual({
      code: "AGE_BAND_MISMATCH",
      path: ["attendees", 1, "entry", "productId"],
      params: { age: 7, ageBand: "child", onDate: "2026-11-10" },
    });
  });

  it("A4: rejects a child ticket for a 13-year-old", () => {
    const result = validate(
      draft({ attendees: [adult(), person(DOB.teen13, dayPass("DAY_CHILD", ["2026-11-10"]))] }),
    );
    expect(codes(result)).toEqual(["AGE_BAND_MISMATCH"]);
  });

  it("A2: rejects a ticket for an infant", () => {
    const result = validate(
      draft({ attendees: [adult(), person(DOB.infant2, dayPass("DAY_CHILD", ["2026-11-10"]))] }),
    );
    expect(codes(result)).toEqual(["INFANT_MUST_NOT_HAVE_TICKET"]);
  });

  it("E1: requires a ticket for anyone 5 or over", () => {
    expect(codes(validate(draft({ attendees: [adult(), person(DOB.child7, noEntry)] })))).toEqual([
      "ENTRY_REQUIRED",
    ]);
  });

  it("A6: rejects nonsense dates of birth", () => {
    const result = validate(
      draft({ attendees: [person("seven", dayPass("DAY_ADULT", ["2026-11-10"]))] }),
    );
    expect(codes(result)).toEqual(["INVALID_DOB"]);
  });

  it("D1: a child turning 12 during the festival stays on a child ticket", () => {
    const booking = mustValidate(
      draft({
        attendees: [adult(), person("2014-11-12", dayPass("DAY_CHILD", ["2026-11-10"]))],
      }),
    );
    expect(booking.attendees[1]?.ageBand).toBe("child");
  });

  it("reports every problem at once", () => {
    const result = validate(
      draft({
        attendees: [
          person(DOB.child7, dayPass("DAY_ADULT", ["2026-11-10"])),
          person(DOB.infant2, allDays("ALLDAY_CHILD")),
          person("2030-01-01", noEntry),
        ],
      }),
    );
    expect(codes(result)).toEqual([
      "AGE_BAND_MISMATCH",
      "INFANT_MUST_NOT_HAVE_TICKET",
      "INVALID_DOB",
    ]);
  });
});

describe("days (E2, E5, D9)", () => {
  it.each([
    [[], "empty"],
    [["2026-11-09"], "outside_festival"],
    [["2026-11-10", "2026-11-10"], "duplicate"],
    [["10 Nov"], "format"],
  ])("rejects day pass dates %j (%s)", (dates, reason) => {
    const issue = firstIssue(validate(draft({ attendees: [adult(dates)] })));
    expect(issue?.code).toBe("INVALID_DAYS");
    expect(issue?.params?.reason).toBe(reason);
  });

  it("stops selling a day at 6 pm local time on that day", () => {
    const beforeCutoff = clockAt("2026-11-11T17:59:00-06:00");
    const afterCutoff = clockAt("2026-11-11T18:00:00-06:00");
    const booking = draft({ attendees: [adult(["2026-11-11"])] });
    expect(validate(booking, buildCatalog(), beforeCutoff).ok).toBe(true);
    expect(codes(validate(booking, buildCatalog(), afterCutoff))).toEqual(["DAY_NOT_ON_SALE"]);
  });

  it("never sells a day in the past", () => {
    const duringFestival = clockAt("2026-11-12T10:00:00-06:00");
    const booking = draft({ attendees: [adult(["2026-11-10", "2026-11-13"])] });
    expect(firstIssue(validate(booking, buildCatalog(), duringFestival))).toMatchObject({
      code: "DAY_NOT_ON_SALE",
      params: { date: "2026-11-10" },
    });
  });

  it("stops selling all-day passes once day one begins", () => {
    const dayOne = clockAt("2026-11-10T09:00:00-06:00");
    const booking = draft({ attendees: [adult(), person(DOB.child7, allDays("ALLDAY_CHILD"))] });
    expect(codes(validate(booking, buildCatalog(), dayOne))).toEqual(["DAY_NOT_ON_SALE"]);
  });
});

describe("products (E6)", () => {
  it("rejects unknown and inactive products", () => {
    expect(
      codes(
        validate(
          draft({ attendees: [person(DOB.adult40, dayPass("NOPE" as "DAY_ADULT", ALL_DAYS))] }),
        ),
      ),
    ).toEqual(["PRODUCT_UNAVAILABLE"]);
    const inactive = buildCatalog({ DAY_ADULT: { active: false } });
    expect(codes(validate(draft({ attendees: [adult()] }), inactive))).toEqual([
      "PRODUCT_UNAVAILABLE",
    ]);
  });

  it("rejects a product used as the wrong kind of entry", () => {
    const entry = { kind: "day_pass" as const, productId: "FAMILY", dates: ["2026-11-10"] };
    expect(codes(validate(draft({ attendees: [person(DOB.adult40, entry)] })))).toEqual([
      "PRODUCT_UNAVAILABLE",
    ]);
  });
});

describe("group rules", () => {
  it("E7/D5: a booking of only infants is rejected", () => {
    expect(codes(validate(draft({ attendees: [person(DOB.infant2, noEntry)] })))).toEqual([
      "EMPTY_BOOKING",
    ]);
  });

  it("D6: a 13-year-old cannot be the only grown-up with a 7-year-old", () => {
    const result = validate(
      draft({ attendees: [person(DOB.teen13, dayPass("DAY_ADULT", ["2026-11-10"])), child()] }),
    );
    expect(firstIssue(result)).toMatchObject({
      code: "CHILD_UNACCOMPANIED",
      path: ["attendees", 1],
      params: { dates: "2026-11-10" },
    });
  });

  it("E8: every day a child attends needs an 18+ that day", () => {
    const result = validate(
      draft({ attendees: [adult(["2026-11-11"]), child(["2026-11-11", "2026-11-12"])] }),
    );
    expect(firstIssue(result)?.params?.dates).toBe("2026-11-12");
  });

  it("an 18-year-old counts as the responsible adult", () => {
    const booking = draft({
      attendees: [person(DOB.adult18, dayPass("DAY_ADULT", ["2026-11-10"])), child()],
    });
    expect(validate(booking).ok).toBe(true);
  });

  it("D5: infants attend the days their 18+ adults attend", () => {
    const booking = mustValidate(
      draft({ attendees: [adult(["2026-11-11", "2026-11-13"]), person(DOB.infant2, noEntry)] }),
    );
    expect(booking.attendees[1]?.attendanceDates).toEqual(["2026-11-11", "2026-11-13"]);
  });

  it("D5: an infant with only a 13-year-old is unaccompanied", () => {
    const result = validate(
      draft({
        attendees: [
          person(DOB.teen13, dayPass("DAY_ADULT", ["2026-11-10"])),
          person(DOB.infant2, noEntry),
        ],
      }),
    );
    expect(codes(result)).toEqual(["CHILD_UNACCOMPANIED"]);
  });

  it("E9: more than 20 people is too large", () => {
    const attendees = Array.from({ length: 21 }, () => adult());
    expect(codes(validate(draft({ attendees })))).toEqual(["GROUP_TOO_LARGE"]);
  });

  it("rejects repeated client ids", () => {
    const a = adult();
    expect(codes(validate(draft({ attendees: [a, { ...a }] })))).toEqual(["DUPLICATE_ID"]);
  });

  it("D18: warns, but does not block, on the same name and date of birth", () => {
    const a = adult();
    const twin = { ...a, clientId: "twin", firstName: ` ${a.firstName.toUpperCase()} ` };
    const booking = mustValidate(draft({ attendees: [a, twin] }));
    expect(booking.warnings).toEqual([
      { code: "POSSIBLE_DUPLICATE_ATTENDEE", path: ["attendees", 1], params: { duplicateOf: 0 } },
    ]);
  });
});

describe("family pass (E4, D3, D20)", () => {
  const family = (ids: string[], date = "2026-11-10", id = "f1") => ({
    id,
    productId: "FAMILY",
    date,
    attendeeClientIds: ids,
  });
  const member = (dob: string) => person(dob, familyEntry);

  it("accepts 2 adults + 2 children, and 2 adults + 1 child (D3)", () => {
    const [a1, a2, c1, c2] = [
      member(DOB.adult40),
      member(DOB.adult40),
      member(DOB.child7),
      member(DOB.child9),
    ];
    const ids = [a1, a2, c1, c2].map((p) => p.clientId);
    expect(validate(draft({ attendees: [a1, a2, c1, c2], familyGroups: [family(ids)] })).ok).toBe(
      true,
    );
    expect(
      validate(draft({ attendees: [a1, a2, c1], familyGroups: [family(ids.slice(0, 3))] })).ok,
    ).toBe(true);
  });

  it("rejects 3 adults, 3 children, or no adult", () => {
    const adults = [member(DOB.adult40), member(DOB.adult40), member(DOB.adult40)];
    const kids = [member(DOB.child7), member(DOB.child7), member(DOB.child9)];
    const cases = [[...adults], [adults[0], ...kids], [kids[0], kids[1]]];
    for (const people of cases) {
      const attendees = people.filter((p) => p !== undefined);
      const result = validate(
        draft({
          attendees: [adult(), ...attendees],
          familyGroups: [family(attendees.map((p) => p.clientId))],
        }),
      );
      expect(codes(result)).toContain("FAMILY_PASS_COMPOSITION");
    }
  });

  it("rejects a family-pass person who is in no group, or a group member with another ticket", () => {
    const loner = member(DOB.adult40);
    expect(firstIssue(validate(draft({ attendees: [loner] })))?.params?.reason).toBe(
      "not_in_group",
    );

    const dayPassHolder = adult();
    const result = validate(
      draft({ attendees: [dayPassHolder], familyGroups: [family([dayPassHolder.clientId])] }),
    );
    expect(firstIssue(result)?.params?.reason).toBe("member_has_other_entry");
  });

  it("D20: the same family can have a pass on two different days, but not two on one day", () => {
    const [a1, c1] = [member(DOB.adult40), member(DOB.child7)];
    const ids = [a1.clientId, c1.clientId];
    const twoDays = draft({
      attendees: [a1, c1],
      familyGroups: [family(ids, "2026-11-10", "f1"), family(ids, "2026-11-11", "f2")],
    });
    expect(mustValidate(twoDays).attendees[0]?.attendanceDates).toEqual([
      "2026-11-10",
      "2026-11-11",
    ]);

    const sameDay = draft({
      attendees: [a1, c1],
      familyGroups: [family(ids, "2026-11-10", "f1"), family(ids, "2026-11-10", "f2")],
    });
    expect(firstIssue(validate(sameDay))?.params?.reason).toBe("two_passes_same_day");
  });

  it("rejects unknown members", () => {
    const a1 = member(DOB.adult40);
    expect(
      codes(validate(draft({ attendees: [a1], familyGroups: [family([a1.clientId, "ghost"])] }))),
    ).toEqual(["UNKNOWN_ATTENDEE"]);
  });
});

describe("extras (§5.3)", () => {
  const dinner = (attendeeClientId: string, dates: string[]) => ({
    productId: "DINNER",
    attendeeClientId,
    dates,
  });
  const garba = (attendeeClientId: string, dates: string[]) => ({
    productId: "GARBA",
    attendeeClientId,
    dates,
  });

  it("X1: dinner only on days the person attends", () => {
    const a = adult(["2026-11-10"]);
    expect(
      validate(draft({ attendees: [a], extras: [dinner(a.clientId, ["2026-11-10"])] })).ok,
    ).toBe(true);
    expect(
      firstIssue(validate(draft({ attendees: [a], extras: [dinner(a.clientId, ["2026-11-11"])] }))),
    ).toMatchObject({ code: "EXTRA_REQUIRES_ENTRY", params: { date: "2026-11-11" } });
  });

  it("D12: an infant can have dinner on a day their adult attends", () => {
    const [a, baby] = [adult(["2026-11-10"]), person(DOB.infant2, noEntry)];
    expect(
      validate(draft({ attendees: [a, baby], extras: [dinner(baby.clientId, ["2026-11-10"])] })).ok,
    ).toBe(true);
    expect(
      codes(
        validate(draft({ attendees: [a, baby], extras: [dinner(baby.clientId, ["2026-11-12"])] })),
      ),
    ).toEqual(["EXTRA_REQUIRES_ENTRY"]);
  });

  it("X2: Garba only runs on 11 and 13 Nov", () => {
    const a = adult(ALL_DAYS);
    expect(
      validate(draft({ attendees: [a], extras: [garba(a.clientId, ["2026-11-11", "2026-11-13"])] }))
        .ok,
    ).toBe(true);
    expect(
      firstIssue(validate(draft({ attendees: [a], extras: [garba(a.clientId, ["2026-11-12"])] }))),
    ).toMatchObject({
      code: "EXTRA_DAY_NOT_ALLOWED",
      params: { date: "2026-11-12" },
    });
  });

  it("D14: no Garba for under-5s", () => {
    const [a, baby] = [adult(["2026-11-11"]), person(DOB.infant2, noEntry)];
    expect(
      codes(
        validate(draft({ attendees: [a, baby], extras: [garba(baby.clientId, ["2026-11-11"])] })),
      ),
    ).toEqual(["EXTRA_AGE_NOT_ALLOWED"]);
  });

  it("X3/X4: Dandiya is 1–20 whole pairs per booking, across lines", () => {
    const a = adult();
    const withDandiya = (...quantities: number[]) =>
      validate(
        draft({
          attendees: [a],
          extras: quantities.map((quantity) => ({ productId: "DANDIYA", quantity })),
        }),
      );
    expect(withDandiya(20).ok).toBe(true);
    expect(codes(withDandiya(21))).toEqual(["QUANTITY_OUT_OF_RANGE"]);
    expect(codes(withDandiya(15, 10))).toEqual(["QUANTITY_OUT_OF_RANGE"]);
    expect(codes(withDandiya(0))).toEqual(["INVALID_QUANTITY"]);
    expect(codes(withDandiya(1.5))).toEqual(["INVALID_QUANTITY"]);
  });

  it("merges Dandiya lines into one quantity", () => {
    const booking = mustValidate(
      draft({
        attendees: [adult()],
        extras: [
          { productId: "DANDIYA", quantity: 3 },
          { productId: "DANDIYA", quantity: 2 },
        ],
      }),
    );
    expect(booking.extras).toMatchObject([{ scope: "per_booking", quantity: 5 }]);
  });

  it("rejects extras in the wrong shape, for unknown people, or booked twice", () => {
    const a = adult(["2026-11-10"]);
    const wrongShape = {
      productId: "DANDIYA",
      attendeeClientId: a.clientId,
      dates: ["2026-11-10"],
    };
    expect(codes(validate(draft({ attendees: [a], extras: [wrongShape] })))).toEqual([
      "PRODUCT_UNAVAILABLE",
    ]);
    expect(
      codes(validate(draft({ attendees: [a], extras: [dinner("ghost", ["2026-11-10"])] }))),
    ).toEqual(["UNKNOWN_ATTENDEE"]);
    expect(
      codes(
        validate(
          draft({
            attendees: [a],
            extras: [dinner(a.clientId, ["2026-11-10"]), dinner(a.clientId, ["2026-11-10"])],
          }),
        ),
      ),
    ).toEqual(["INVALID_DAYS"]);
  });
});

describe("validateBooker (A5)", () => {
  const booker = (dateOfBirth: string) => ({
    firstName: "Asha",
    lastName: "Patel",
    email: "asha@example.com",
    phone: "+1 555 0100",
    dateOfBirth,
    isAttending: false,
  });

  it("accepts an 18+ booker and rejects a 17-year-old", () => {
    expect(validateBooker(booker(DOB.adult40), BEFORE_FESTIVAL).ok).toBe(true);
    const result = validateBooker(booker("2009-01-01"), BEFORE_FESTIVAL);
    expect(result.ok ? null : result.issues[0]?.code).toBe("BOOKER_UNDER_18");
  });

  it("rejects a nonsense date of birth", () => {
    const result = validateBooker(booker("yesterday"), BEFORE_FESTIVAL);
    expect(result.ok ? null : result.issues[0]?.code).toBe("INVALID_DOB");
  });
});
