import { formatMoney } from "../format";
import type { CatalogProduct } from "../state/selectors";

// A catalog price label such as "$15 / day". A label only: totals always come from the quote.
export function priceLabel(product: Pick<CatalogProduct, "priceCents" | "pricing">): string {
  const price = formatMoney(product.priceCents);
  switch (product.pricing) {
    case "per_person_per_day":
      return `${price} / day`;
    case "per_unit":
      return `${price} each`;
    case "flat":
      return price;
  }
}
