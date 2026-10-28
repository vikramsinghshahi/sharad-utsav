import { describe, expect, it } from "vitest";
import { MAX_ATTENDEES } from "@/domain/booking";
import { reusableCreateKey, reusablePayKey } from "@/features/booking/state/reducer";
import type { Action } from "@/features/booking/state/types";
import { DOB, IDS, loaded, person, run } from "./helpers";

const dayPass = (clientId: string, productId: string, dates: string[]): Action => ({
  type: "SET_ENTRY",
  clientId,
  entry: { kind: "day_pass", productId, dates },
});

describe("people and tickets", () => {
  it("removing a person removes their entry, family membership and extras", () => {
    const state = run([
      loaded,
      ...person("a", "Priya", DOB.adult40),
      ...person("c", "Aarav", DOB.child7),
      { type: "ADD_FAMILY_GROUP", id: "g1", productId: IDS.family, date: "2026-11-11" },
      { type: "SET_FAMILY_GROUP", id: "g1", clientId: "a", member: true },
      { type: "SET_FAMILY_GROUP", id: "g1", clientId: "c", member: true },
      { type: "TOGGLE_EXTRA_DAY", productId: IDS.dinner, clientId: "c", date: "2026-11-11" },
      { type: "REMOVE_ATTENDEE", clientId: "c" },
    ]);
    expect(state.attendees.map((a) => a.clientId)).toEqual(["a"]);
    expect(state.familyGroups[0]?.attendeeClientIds).toEqual(["a"]);
    expect(state.attendeeExtras).toEqual([]);
  });

  it("never holds more than the maximum number of people", () => {
    const actions = Array.from({ length: MAX_ATTENDEES + 3 }, (_, i): Action => ({
      type: "ADD_ATTENDEE",
      clientId: `p${i}`,
    }));
    expect(run(actions).attendees).toHaveLength(MAX_ATTENDEES);
  });

  it("a DOB that makes an adult a child clears the adult ticket and says why", () => {
    const state = run([
      loaded,
      ...person("c", "Aarav", DOB.adult40),
      dayPass("c", IDS.dayAdult, ["2026-11-11"]),
      { type: "SET_DOB", clientId: "c", dateOfBirth: DOB.child7 },
    ]);
    expect(state.attendees[0]?.entry).toEqual({ kind: "none" });
    expect(state.notices.at(-1)?.text).toBe(
      "Aarav is 7 on Tue 10 Nov, so the adult day pass was removed. Please choose a child ticket.",
    );
  });

  it("a DOB change within the same band keeps the ticket", () => {
    const state = run([
      loaded,
      ...person("a", "Priya", DOB.adult40),
      dayPass("a", IDS.dayAdult, ["2026-11-11"]),
      { type: "SET_DOB", clientId: "a", dateOfBirth: "1980-01-01" },
    ]);
    expect(state.attendees[0]?.entry.kind).toBe("day_pass");
    expect(state.notices).toEqual([]);
  });

  it("becoming under 5 clears the ticket, family place and Garba", () => {
    const state = run([
      loaded,
      ...person("a", "Priya", DOB.adult40),
      ...person("c", "Aarav", DOB.child7),
      dayPass("a", IDS.dayAdult, ["2026-11-11"]),
      dayPass("c", IDS.dayChild, ["2026-11-11"]),
      { type: "TOGGLE_EXTRA_DAY", productId: IDS.garba, clientId: "c", date: "2026-11-11" },
      { type: "TOGGLE_EXTRA_DAY", productId: IDS.dinner, clientId: "c", date: "2026-11-11" },
      { type: "SET_DOB", clientId: "c", dateOfBirth: DOB.toddler2 },
    ]);
    expect(state.attendees[1]?.entry).toEqual({ kind: "none" });
    // Dinner stays: under-5s may eat on days an adult attends (D12). Garba doesn't (D14).
    expect(state.attendeeExtras).toEqual([
      { productId: IDS.dinner, attendeeClientId: "c", dates: ["2026-11-11"] },
    ]);
    expect(state.notices.some((n) => n.text.includes("Under-5s come free"))).toBe(true);
  });
});

describe("days and extras", () => {
  it("removing a day removes that person's dinner and Garba on that day", () => {
    const state = run([
      loaded,
      ...person("a", "Priya", DOB.adult40),
      dayPass("a", IDS.dayAdult, ["2026-11-11", "2026-11-12"]),
      { type: "TOGGLE_EXTRA_DAY", productId: IDS.dinner, clientId: "a", date: "2026-11-11" },
      { type: "TOGGLE_EXTRA_DAY", productId: IDS.dinner, clientId: "a", date: "2026-11-12" },
      { type: "TOGGLE_EXTRA_DAY", productId: IDS.garba, clientId: "a", date: "2026-11-11" },
      { type: "TOGGLE_DAY", clientId: "a", date: "2026-11-11" },
    ]);
    expect(state.attendees[0]?.entry).toEqual({
      kind: "day_pass",
      productId: IDS.dayAdult,
      dates: ["2026-11-12"],
    });
    expect(state.attendeeExtras).toEqual([
      { productId: IDS.dinner, attendeeClientId: "a", dates: ["2026-11-12"] },
    ]);
    expect(state.notices.at(-1)?.text).toBe(
      "Priya's extras on Wed 11 Nov were removed, as they're no longer coming then.",
    );
  });

  it("an extra can't be added on a day the person isn't coming", () => {
    const state = run([
      loaded,
      ...person("a", "Priya", DOB.adult40),
      dayPass("a", IDS.dayAdult, ["2026-11-12"]),
      { type: "TOGGLE_EXTRA_DAY", productId: IDS.dinner, clientId: "a", date: "2026-11-11" },
    ]);
    expect(state.attendeeExtras).toEqual([]);
  });

  it("a toddler's dinner follows the days an 18+ adult attends", () => {
    const state = run([
      loaded,
      ...person("a", "Priya", DOB.adult40),
      ...person("t", "Maya", DOB.toddler2),
      dayPass("a", IDS.dayAdult, ["2026-11-11", "2026-11-12"]),
      { type: "TOGGLE_EXTRA_DAY", productId: IDS.dinner, clientId: "t", date: "2026-11-12" },
      { type: "TOGGLE_DAY", clientId: "a", date: "2026-11-12" },
    ]);
    expect(state.attendeeExtras).toEqual([]);
    expect(state.notices.at(-1)?.text).toContain("Maya's extras on Thu 12 Nov");
  });

  it("Dandiya quantity is a whole number and 0 removes it", () => {
    const set = (quantity: number): Action => ({
      type: "SET_EXTRA_QUANTITY",
      productId: IDS.dandiya,
      quantity,
    });
    expect(run([set(3.7)]).bookingExtras).toEqual([{ productId: IDS.dandiya, quantity: 3 }]);
    expect(run([set(3), set(0)]).bookingExtras).toEqual([]);
  });
});

describe("family passes", () => {
  it("ticking someone into a family pass replaces their other ticket, with a note", () => {
    const state = run([
      loaded,
      ...person("a", "Priya", DOB.adult40),
      dayPass("a", IDS.dayAdult, ["2026-11-11"]),
      { type: "ADD_FAMILY_GROUP", id: "g1", productId: IDS.family, date: "2026-11-11" },
      { type: "SET_FAMILY_GROUP", id: "g1", clientId: "a", member: true },
    ]);
    expect(state.attendees[0]?.entry).toEqual({ kind: "family_pass" });
    expect(state.notices.at(-1)?.text).toBe(
      "Priya's adult day pass was replaced by the family pass.",
    );
  });

  it("choosing another ticket takes the person out of their family passes", () => {
    const state = run([
      loaded,
      ...person("a", "Priya", DOB.adult40),
      { type: "ADD_FAMILY_GROUP", id: "g1", productId: IDS.family, date: "2026-11-11" },
      { type: "SET_FAMILY_GROUP", id: "g1", clientId: "a", member: true },
      dayPass("a", IDS.dayAdult, ["2026-11-12"]),
    ]);
    expect(state.familyGroups[0]?.attendeeClientIds).toEqual([]);
  });

  it("switching a family pass to day passes gives each member that day", () => {
    const state = run([
      loaded,
      ...person("a", "Priya", DOB.adult40),
      ...person("c", "Aarav", DOB.child7),
      { type: "ADD_FAMILY_GROUP", id: "g1", productId: IDS.family, date: "2026-11-13" },
      { type: "SET_FAMILY_GROUP", id: "g1", clientId: "a", member: true },
      { type: "SET_FAMILY_GROUP", id: "g1", clientId: "c", member: true },
      {
        type: "SPLIT_FAMILY_GROUP",
        id: "g1",
        passes: [
          { clientId: "a", productId: IDS.dayAdult },
          { clientId: "c", productId: IDS.dayChild },
        ],
      },
    ]);
    expect(state.familyGroups).toEqual([]);
    expect(state.attendees.map((a) => a.entry)).toEqual([
      { kind: "day_pass", productId: IDS.dayAdult, dates: ["2026-11-13"] },
      { kind: "day_pass", productId: IDS.dayChild, dates: ["2026-11-13"] },
    ]);
  });
});

describe("idempotency keys (D17)", () => {
  const started = (key: string, fingerprint: string): Action => ({
    type: "CREATE_STARTED",
    attempt: { key, fingerprint },
  });
  const network = { kind: "network", during: "create" } as const;

  it("a create retried after a network failure reuses its key", () => {
    const state = run([
      started("k1", "body-1"),
      { type: "CREATE_FAILED", error: network, definite: false },
    ]);
    expect(reusableCreateKey(state.createAttempt, "body-1")).toBe("k1");
    expect(state.inFlight).toBeNull();
  });

  it("a different body never reuses the key", () => {
    const state = run([started("k1", "body-1")]);
    expect(reusableCreateKey(state.createAttempt, "body-2")).toBeNull();
  });

  it("changing the draft drops the key", () => {
    const state = run([started("k1", "body-1"), { type: "SET_PROMO", code: "SEVA10" }]);
    expect(state.createAttempt).toBeNull();
  });

  it("a definite answer drops the key, so the next try is a fresh request", () => {
    const state = run([
      started("k1", "body-1"),
      {
        type: "CREATE_FAILED",
        error: { kind: "problem", title: "x", detail: null, details: [] },
        definite: true,
      },
    ]);
    expect(state.createAttempt).toBeNull();
  });

  it("pay reuses its key only to retry the same outcome after a network failure", () => {
    const afterNetwork = run([
      { type: "PAY_STARTED", attempt: { key: "p1", outcome: "succeed", awaitingRetry: false } },
      { type: "PAY_FAILED", error: { kind: "network", during: "pay" }, definite: false },
    ]);
    expect(reusablePayKey(afterNetwork.payAttempt, "succeed")).toBe("p1");
    expect(reusablePayKey(afterNetwork.payAttempt, "decline")).toBeNull();

    // While the first attempt is in flight, its key is not up for reuse either.
    const inFlight = run([
      { type: "PAY_STARTED", attempt: { key: "p1", outcome: "succeed", awaitingRetry: false } },
    ]);
    expect(reusablePayKey(inFlight.payAttempt, "succeed")).toBeNull();
  });

  it("a declined card means the next attempt gets a new key", () => {
    const state = run([
      { type: "PAY_STARTED", attempt: { key: "p1", outcome: "decline", awaitingRetry: false } },
      { type: "PAY_FAILED", error: { kind: "declined" }, definite: true },
    ]);
    expect(state.payAttempt).toBeNull();
    expect(state.error).toEqual({ kind: "declined" });
  });
});

describe("holds", () => {
  const hold: Action = {
    type: "CREATE_SUCCEEDED",
    hold: {
      bookingId: "b1",
      accessToken: "t1",
      holdExpiresAt: "2026-10-28T12:15:00Z",
      totalCents: 5400,
      reviewedTotalCents: 5400,
    },
  };

  it("an expired hold sends the user back to Review with fresh keys", () => {
    const state = run([
      { type: "CREATE_STARTED", attempt: { key: "k1", fingerprint: "f" } },
      hold,
      { type: "GO_TO_STEP", step: "pay" },
      { type: "HOLD_RELEASED" },
    ]);
    expect(state.hold).toBeNull();
    expect(state.createAttempt).toBeNull();
    expect(state.step).toBe("review");
    expect(state.error).toEqual({ kind: "released" });
  });

  it("changing the booking after a hold lets the hold go", () => {
    const state = run([
      loaded,
      ...person("a", "Priya", DOB.adult40),
      hold,
      { type: "SET_PROMO", code: "FLAT20" },
    ]);
    expect(state.hold).toBeNull();
    expect(state.notices.at(-1)?.text).toContain("held places were let go");
  });
});
