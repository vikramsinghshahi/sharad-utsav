import { describe, expect, it } from "vitest";
import { bookingDraftSchema, createBookingRequestSchema } from "@/contracts/requests";
import { fieldTargetFor } from "@/features/booking/state/field-targets";
import { problemIssues } from "@/features/booking/state/step-checks";
import {
  extraAt,
  requestFingerprint,
  toBookingDraft,
  toCreateBookingRequest,
} from "@/features/booking/state/to-request";
import { DOB, IDS, loaded, person, run } from "./helpers";

const family = run([
  loaded,
  ...person("a", " Priya ", DOB.adult40),
  ...person("c", "Aarav", DOB.child7),
  ...person("t", "Maya", DOB.toddler2),
  {
    type: "SET_ENTRY",
    clientId: "a",
    entry: { kind: "day_pass", productId: IDS.dayAdult, dates: ["2026-11-12", "2026-11-11"] },
  },
  { type: "SET_ENTRY", clientId: "c", entry: { kind: "all_days", productId: IDS.allDaysChild } },
  { type: "TOGGLE_EXTRA_DAY", productId: IDS.dinner, clientId: "t", date: "2026-11-12" },
  { type: "TOGGLE_EXTRA_DAY", productId: IDS.dinner, clientId: "a", date: "2026-11-11" },
  { type: "SET_EXTRA_QUANTITY", productId: IDS.dandiya, quantity: 2 },
  { type: "SET_PROMO", code: "  seva10 " },
  {
    type: "SET_BOOKER",
    patch: {
      firstName: "Priya",
      lastName: "Sharma",
      email: "priya@example.com",
      phone: "+1 972 555 0100",
      dateOfBirth: DOB.adult40,
      isAttending: true,
    },
  },
]);

describe("toBookingDraft", () => {
  it("maps the state to the contract's BookingDraft", () => {
    const draft = toBookingDraft(family);
    expect(bookingDraftSchema.safeParse(draft).success).toBe(true);
    expect(draft).toEqual({
      attendees: [
        {
          clientId: "a",
          firstName: "Priya",
          lastName: "Sharma",
          dateOfBirth: DOB.adult40,
          entry: { kind: "day_pass", productId: IDS.dayAdult, dates: ["2026-11-11", "2026-11-12"] },
        },
        {
          clientId: "c",
          firstName: "Aarav",
          lastName: "Sharma",
          dateOfBirth: DOB.child7,
          entry: { kind: "all_days", productId: IDS.allDaysChild },
        },
        {
          clientId: "t",
          firstName: "Maya",
          lastName: "Sharma",
          dateOfBirth: DOB.toddler2,
          entry: { kind: "none" },
        },
      ],
      familyGroups: [],
      extras: [
        { productId: IDS.dinner, attendeeClientId: "t", dates: ["2026-11-12"] },
        { productId: IDS.dinner, attendeeClientId: "a", dates: ["2026-11-11"] },
        { productId: IDS.dandiya, quantity: 2 },
      ],
      promoCode: "seva10",
    });
  });

  it("sends no promo code when the field is empty, and no prices or totals ever", () => {
    const draft = toBookingDraft({ ...family, promoCode: "   " });
    expect("promoCode" in draft).toBe(false);
    expect(JSON.stringify(draft)).not.toMatch(/cents|price|total/i);
  });

  it("includes family groups with their members", () => {
    const state = run(
      [
        { type: "ADD_FAMILY_GROUP", id: "g1", productId: IDS.family, date: "2026-11-13" },
        { type: "SET_FAMILY_GROUP", id: "g1", clientId: "a", member: true },
      ],
      family,
    );
    const draft = toBookingDraft(state);
    expect(draft.familyGroups).toEqual([
      { id: "g1", productId: IDS.family, date: "2026-11-13", attendeeClientIds: ["a"] },
    ]);
    expect(draft.attendees[0]?.entry).toEqual({ kind: "family_pass" });
  });
});

describe("toCreateBookingRequest", () => {
  it("adds the event and the booker, matching the contract schema", () => {
    const body = toCreateBookingRequest(family, "sharad-utsav-2026");
    expect(createBookingRequestSchema.safeParse(body).success).toBe(true);
    expect(body.eventSlug).toBe("sharad-utsav-2026");
    expect(body.booker).toEqual({
      firstName: "Priya",
      lastName: "Sharma",
      email: "priya@example.com",
      phone: "+1 972 555 0100",
      dateOfBirth: DOB.adult40,
      isAttending: true,
    });
  });

  it("gives the same fingerprint for the same body and a new one when it changes", () => {
    const a = requestFingerprint(toCreateBookingRequest(family, "s"));
    const b = requestFingerprint(toCreateBookingRequest({ ...family }, "s"));
    const c = requestFingerprint(toCreateBookingRequest({ ...family, promoCode: "FLAT20" }, "s"));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe("error paths back to fields", () => {
  it("finds which extra row an `extras[i]` path means", () => {
    expect(extraAt(family, 1)).toEqual({ productId: IDS.dinner, attendeeClientId: "a" });
    expect(extraAt(family, 2)).toEqual({ productId: IDS.dandiya, attendeeClientId: null });
    expect(extraAt(family, 9)).toBeNull();
  });

  it("maps server paths to the step and field to fix", () => {
    expect(fieldTargetFor(family, ["attendees", 1, "entry", "productId"])).toEqual({
      step: "passes",
      fieldId: "attendee-c-entry",
    });
    expect(fieldTargetFor(family, ["attendees", 0, "dateOfBirth"])).toEqual({
      step: "who",
      fieldId: "attendee-a-dateOfBirth",
    });
    expect(fieldTargetFor(family, ["extras", 0, "dates", 0])).toEqual({
      step: "extras",
      fieldId: "extra-p-dinner-t",
    });
    expect(fieldTargetFor(family, ["booker", "dateOfBirth"])).toEqual({
      step: "pay",
      fieldId: "booker-dateOfBirth",
    });
  });
});

describe("problemIssues", () => {
  it("places each detail on its field and prints dates for people", () => {
    const issues = problemIssues(family, {
      type: "/problems/validation-failed",
      title: "Some details need attention",
      status: 422,
      code: "VALIDATION_FAILED",
      details: [
        {
          path: ["attendees", 1],
          code: "CHILD_UNACCOMPANIED",
          message: "Aarav needs someone aged 18 or over with them on 2026-11-10, 2026-11-13.",
        },
      ],
    });
    expect(issues).toEqual([
      {
        step: "passes",
        fieldId: "attendee-c",
        message: "Aarav needs someone aged 18 or over with them on Tue 10 Nov, Fri 13 Nov.",
      },
    ]);
  });
});
