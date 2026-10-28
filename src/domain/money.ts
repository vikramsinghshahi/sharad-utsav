// Money is always a non-negative integer number of cents (SPEC §3.4).
// All arithmetic here is exact integer math: no float can reach a total.
export type Cents = number & { readonly __brand: "Cents" };

export const ZERO_CENTS = toCents(0);

export function toCents(value: number): Cents {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`Cents must be a non-negative safe integer, got ${value}`);
  }
  return value as Cents;
}

export function sumCents(values: readonly Cents[]): Cents {
  return toCents(values.reduce<number>((total, value) => total + value, 0));
}

export function addCents(...values: Cents[]): Cents {
  return sumCents(values);
}

// Throws instead of going negative: a total below $0 is always a bug (D10).
export function subtractCents(from: Cents, amount: Cents): Cents {
  if (amount > from) {
    throw new RangeError(`Cannot subtract ${amount} from ${from}: result would be negative`);
  }
  return toCents(from - amount);
}

export function multiplyCents(unit: Cents, quantity: number): Cents {
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new RangeError(`Quantity must be a non-negative integer, got ${quantity}`);
  }
  return toCents(unit * quantity);
}

export function minCents(a: Cents, b: Cents): Cents {
  return a <= b ? a : b;
}

// `percent` whole percent of `amount`, rounded half-up once (10% of 14670 → 1467).
export function percentOf(amount: Cents, percent: number): Cents {
  if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
    throw new RangeError(`Percent must be an integer from 0 to 100, got ${percent}`);
  }
  const scaled = amount * percent;
  const whole = Math.floor(scaled / 100);
  const remainder = scaled - whole * 100;
  return toCents(remainder * 2 >= 100 ? whole + 1 : whole);
}

// Splits `total` across lines in proportion to `weights` using the
// largest-remainder method. The parts always sum to `total` exactly, and no part
// exceeds its weight when total <= sum(weights). Ties go to the earlier line, so
// the result is deterministic.
export function allocate(total: Cents, weights: readonly Cents[]): Cents[] {
  const weightSum = sumCents(weights);
  if (total > weightSum) {
    throw new RangeError(`Cannot allocate ${total} across weights summing to ${weightSum}`);
  }
  if (weightSum === 0) return weights.map(() => ZERO_CENTS);

  const shares = weights.map((weight, index) => {
    const scaled = total * weight;
    if (!Number.isSafeInteger(scaled)) throw new RangeError("Allocation overflow");
    const whole = Math.floor(scaled / weightSum);
    return { index, whole, remainder: scaled - whole * weightSum };
  });

  let leftover = total - shares.reduce((sum, share) => sum + share.whole, 0);
  const byRemainder = [...shares].sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const share of byRemainder) {
    if (leftover === 0) break;
    share.whole += 1;
    leftover -= 1;
  }

  return shares.map((share) => toCents(share.whole));
}
