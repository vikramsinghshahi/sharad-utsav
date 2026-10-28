import type { IsoDate } from "../calendar";
import { isChildIndividualPass, type Product } from "../catalog";
import { addCents, multiplyCents, subtractCents, ZERO_CENTS, type Cents } from "../money";
import type { PromoEvaluation } from "../promo";
import type { PricedLine } from "./types";

interface LineFields {
  attendeeClientId?: string;
  familyGroupId?: string;
  date?: IsoDate;
  qty?: number;
}

// The unit price always comes from the server's catalog, never from the request.
export function newLine(product: Product, fields: LineFields = {}): PricedLine {
  return {
    product,
    attendeeClientId: fields.attendeeClientId ?? null,
    familyGroupId: fields.familyGroupId ?? null,
    date: fields.date ?? null,
    qty: fields.qty ?? 1,
    unitPriceCents: product.priceCents,
    discountCents: ZERO_CENTS,
  };
}

export function grossCents(line: PricedLine): Cents {
  return multiplyCents(line.unitPriceCents, line.qty);
}

export function netCents(line: PricedLine): Cents {
  return subtractCents(grossCents(line), line.discountCents);
}

export function withExtraDiscount(line: PricedLine, amount: Cents): PricedLine {
  return { ...line, discountCents: addCents(line.discountCents, amount) };
}

// D11: KIDSFREE frees child day / all-day passes only.
export function isFreedByLinePromo(product: Product, promo: PromoEvaluation): boolean {
  return (
    promo.status === "valid" &&
    promo.promo.kind === "free_child_entry" &&
    isChildIndividualPass(product)
  );
}

// What one unit costs once line-level promos apply. Suggestions compare these,
// so KIDSFREE never produces a bogus "save $10" hint (§5.6 step 8).
export function unitPriceAfterLinePromos(product: Product, promo: PromoEvaluation): Cents {
  return isFreedByLinePromo(product, promo) ? ZERO_CENTS : product.priceCents;
}
