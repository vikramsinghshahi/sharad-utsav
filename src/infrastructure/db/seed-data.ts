import type { ProductCategory, ProductPricing, ProductRule } from "@/domain/catalog";
import type { PromoKind } from "@/domain/promo";

// Sharad Utsav 2026 catalog (SPEC §3.3, §5.5). Data only: change prices, stock,
// or codes here; the upsert logic lives in seed.ts.

export const ORG_NAME = "Radha Krishna Temple, Allen";

export const EVENT = {
  slug: "sharad-utsav-2026",
  name: "Sharad Utsav 2026",
  venue: "Radha Krishna Temple, Allen, Texas",
  tagline:
    "Five evenings of garba, dandiya and devotion. Book for the whole family in a few minutes — grandparents and little ones included.",
  timezone: "America/Chicago",
  currency: "USD",
} as const;

export const FESTIVAL_DATES = [
  "2026-11-10",
  "2026-11-11",
  "2026-11-12",
  "2026-11-13",
  "2026-11-14",
];

export const SAME_DAY_CUTOFF = "18:00:00"; // D9

export interface ProductSeed {
  code: string;
  displayName: string;
  category: ProductCategory;
  priceCents: number;
  pricing: ProductPricing;
  rule: ProductRule;
  stock: number;
}

export const PRODUCTS: ProductSeed[] = [
  {
    code: "DAY_ADULT",
    displayName: "Day Pass – Adult",
    category: "entry",
    priceCents: 1500,
    pricing: "per_person_per_day",
    rule: { type: "pass", dayScope: "chosen_days", eligibleAgeBand: "adult" },
    stock: 380,
  },
  {
    code: "DAY_CHILD",
    displayName: "Day Pass – Child",
    category: "entry",
    priceCents: 800,
    pricing: "per_person_per_day",
    rule: { type: "pass", dayScope: "chosen_days", eligibleAgeBand: "child" },
    stock: 260,
  },
  {
    code: "ALLDAY_ADULT",
    displayName: "All-Day Pass – Adult",
    category: "entry",
    priceCents: 6000,
    pricing: "flat",
    rule: { type: "pass", dayScope: "all_days", eligibleAgeBand: "adult" },
    stock: 0,
  },
  {
    code: "ALLDAY_CHILD",
    displayName: "All-Day Pass – Child",
    category: "entry",
    priceCents: 3000,
    pricing: "flat",
    rule: { type: "pass", dayScope: "all_days", eligibleAgeBand: "child" },
    stock: 140,
  },
  {
    code: "FAMILY",
    displayName: "Family Pass",
    category: "entry",
    priceCents: 4000,
    pricing: "flat",
    rule: { type: "pass", dayScope: "single_day", covers: { adult: 2, child: 2 } },
    stock: 95,
  },
  {
    code: "DANDIYA",
    displayName: "Dandiya Sticks (pair)",
    category: "extra",
    priceCents: 500,
    pricing: "per_unit",
    rule: { type: "extra", scope: "per_booking", requiresEntryOnDay: false, maxPerBooking: 20 },
    stock: 900,
  },
  {
    code: "DINNER",
    displayName: "Dinner Plate",
    category: "extra",
    priceCents: 1200,
    pricing: "per_person_per_day",
    rule: { type: "extra", scope: "per_attendee_per_day", requiresEntryOnDay: true },
    stock: 1700,
  },
  {
    code: "GARBA",
    displayName: "Garba Workshop",
    category: "extra",
    priceCents: 2000,
    pricing: "per_unit",
    rule: {
      type: "extra",
      scope: "per_attendee_per_session",
      availableDates: ["2026-11-11", "2026-11-13"],
      requiresEntryOnDay: true,
      minAgeBand: "child", // D14: not for under-5s
    },
    stock: 2,
  },
];

export interface PromoSeed {
  code: string;
  kind: PromoKind;
  value: number;
  validFrom: string | null;
  validTo: string | null;
  maxRedemptions: number | null;
  redemptions: number;
}

const OPEN_ENDED = { validFrom: null, validTo: null, maxRedemptions: null, redemptions: 0 };

export const PROMOS: PromoSeed[] = [
  { code: "SEVA10", kind: "percent", value: 10, ...OPEN_ENDED },
  { code: "FLAT20", kind: "fixed", value: 2000, ...OPEN_ENDED },
  { code: "KIDSFREE", kind: "free_child_entry", value: 0, ...OPEN_ENDED },
  // Brief: "a valid code that expired last month". Value not given; 5% assumed from the name.
  {
    ...OPEN_ENDED,
    code: "EXPIRED5",
    kind: "percent",
    value: 5,
    validFrom: "2026-09-01",
    validTo: "2026-09-30",
  },
  // Brief: "already used its maximum number of times". Value and limit not given; assumed.
  {
    ...OPEN_ENDED,
    code: "MAXEDOUT",
    kind: "percent",
    value: 10,
    maxRedemptions: 50,
    redemptions: 50,
  },
];
