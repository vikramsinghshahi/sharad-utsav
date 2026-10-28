import { describe, expect, it } from "vitest";
import { toIsoDate } from "@/domain/calendar";
import { evaluatePromo, normalizePromoCode } from "@/domain/promo";
import { promoRow } from "../fixtures/booking";

const TODAY = toIsoDate("2026-10-28");

describe("evaluatePromo (§5.5)", () => {
  it("treats a blank or missing code as no code", () => {
    expect(evaluatePromo(undefined, null, TODAY)).toEqual({ status: "none" });
    expect(evaluatePromo("   ", null, TODAY)).toEqual({ status: "none" });
  });

  it("is case-insensitive and ignores surrounding spaces", () => {
    expect(normalizePromoCode("  seva10 ")).toBe("SEVA10");
    expect(evaluatePromo("  seva10 ", promoRow("SEVA10"), TODAY)).toMatchObject({
      status: "valid",
    });
  });

  it("does not recognise other codes", () => {
    expect(evaluatePromo("FREESTUFF", null, TODAY)).toEqual({
      status: "unknown",
      code: "FREESTUFF",
    });
  });

  it("rejects a row that does not match the entered code", () => {
    expect(evaluatePromo("SEVA1", promoRow("SEVA10"), TODAY)).toEqual({
      status: "unknown",
      code: "SEVA1",
    });
  });

  it("EXPIRED5 expired on 30 Sep", () => {
    expect(evaluatePromo("EXPIRED5", promoRow("EXPIRED5"), TODAY)).toEqual({
      status: "expired",
      code: "EXPIRED5",
      validTo: "2026-09-30",
    });
  });

  it("D21: a code is valid through the whole of its last day in Texas", () => {
    expect(evaluatePromo("EXPIRED5", promoRow("EXPIRED5"), toIsoDate("2026-09-30")).status).toBe(
      "valid",
    );
    expect(evaluatePromo("EXPIRED5", promoRow("EXPIRED5"), toIsoDate("2026-10-01")).status).toBe(
      "expired",
    );
  });

  it("is not valid before its start date", () => {
    expect(evaluatePromo("EXPIRED5", promoRow("EXPIRED5"), toIsoDate("2026-08-31"))).toEqual({
      status: "not_yet_valid",
      code: "EXPIRED5",
      validFrom: "2026-09-01",
    });
  });

  it("MAXEDOUT has reached its usage limit", () => {
    expect(evaluatePromo("MAXEDOUT", promoRow("MAXEDOUT"), TODAY)).toEqual({
      status: "exhausted",
      code: "MAXEDOUT",
    });
    const oneLeft = { ...promoRow("MAXEDOUT"), redemptions: 49 };
    expect(evaluatePromo("MAXEDOUT", oneLeft, TODAY).status).toBe("valid");
  });
});
