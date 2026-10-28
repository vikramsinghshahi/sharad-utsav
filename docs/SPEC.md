# Sharad Utsav 2026 — Booking System Design Spec

> **Source brief:** [assessment-senior-fullstack-ticketing.md](../assessment-senior-fullstack-ticketing.md)
> **Status:** Draft v1 · 26 Oct 2026
> **Note:** This is the working engineering spec. The brief asks for a separate **one-page `DESIGN.md` written in your own words**. Write that from this spec, commit it first, and do not edit it later.

---

## How to read this document

| If you want to know… | Go to |
| --- | --- |
| What we are building, in one minute | §1 |
| The big architecture picture | §2 |
| How tickets, people, prices are modelled | §3, §4 |
| Every business rule, and the decisions on the gaps | §5, §6 |
| The API contract | §7 |
| How stock and payments stay correct under load | §8 |
| The UI flow | §9 |
| **What gets built in which phase, and how long each takes** | **§11** |
| How to add a new rule later (interview prep) | §12 |
| What we are deliberately *not* doing | §13 |

---

## 1. Summary

A family books festival tickets in one go: who is coming, which days, which passes, extras, a promo code, payment, and confirmation.

**Three things must never break:**

1. **The price is always right.** The server calculates it from its own data in integer cents. The browser's numbers are never trusted.
2. **The rules always hold.** Age, eligibility, days, and promo checks run on the server for every request, whatever sends it.
3. **Stock is never oversold.** Stock is decremented atomically in the database. If two people try to buy the last workshop place at the same moment, only one succeeds.

**Foundation goal:** everything is scoped to an *event*, and rules come from data and config, not hard-coded names. A second festival, a new ticket type, or a new committee rule should be a data change or one small file, not a rewrite.

---

## 2. Architecture

### 2.1 Stack

| Layer | Choice | Why |
| --- | --- | --- |
| App | **Next.js 15 (App Router) + TypeScript (strict)** | One deployable; route handlers as the API; runs on Vercel |
| Validation | **Zod** | One schema gives both runtime validation and TS types at the API edge |
| Database | **Postgres (Neon, serverless driver)** | Real transactions and row locks for stock; survives serverless cold starts. **Use the WebSocket `Pool` driver (`drizzle-orm/neon-serverless`), not `neon-http`**, because the HTTP driver cannot run the multi-statement transactions the stock hold needs. |
| ORM / migrations | **Drizzle** | Typed SQL, plain migrations, no heavy runtime |
| Payments | Simulated provider first, **Stripe test mode** as an add-on | Same `PaymentProvider` interface for both |
| Tests | **Vitest** (unit + integration), Playwright (1 smoke e2e, optional) | Pin down money and age logic |
| Styling | Tailwind with brand tokens | Fast; tokens map 1:1 to the brief's colour table |
| Hosting | Vercel (prod) + Neon (prod branch) | As required by the brief |

> **Why not in-memory or a JSON file for stock?** Vercel runs each request in a short-lived serverless instance. Memory is not shared and files are not persisted. A booking made at 9am would vanish by 9pm. Stock must live in a real database.

### 2.2 Layered modules (business rules stay out of the UI)

```
┌──────────────────────────────────────────────────────────────┐
│  UI (app/, components/)       React, reducer-driven flow     │  ← no pricing / rule logic
├──────────────────────────────────────────────────────────────┤
│  API (app/api/**/route.ts)    parse → call use-case → map    │  ← thin; Zod in, JSON out
├──────────────────────────────────────────────────────────────┤
│  Application (use-cases)      quoteBooking, createBooking,   │  ← orchestrates; owns transactions
│                               confirmPayment, expireHolds    │
├──────────────────────────────────────────────────────────────┤
│  Domain (pure TypeScript)     money, age, eligibility,       │  ← NO I/O. 100% unit-testable.
│                               pricing pipeline, promo rules  │     Same code reused by UI for previews
├──────────────────────────────────────────────────────────────┤
│  Infrastructure               Postgres repos, payment        │  ← swappable adapters
│                               provider, email, clock         │
└──────────────────────────────────────────────────────────────┘
```

**Rule of thumb:** if code decides *money* or *who is allowed*, it lives in `domain/` and has a test.

### 2.3 Folder structure

```
src/
  app/
    (booking)/events/[slug]/book/page.tsx      # booking flow
    (booking)/bookings/[id]/page.tsx           # confirmation
    api/
      events/[slug]/route.ts                   # GET catalog
      events/[slug]/quotes/route.ts            # POST quote
      bookings/route.ts                        # POST create (hold stock)
      bookings/[id]/route.ts                   # GET booking
      bookings/[id]/pay/route.ts               # POST simulated payment
      webhooks/stripe/route.ts                 # (optional) Stripe
      cron/expire-holds/route.ts               # Vercel cron (daily safety net; see D16)
  domain/
    money.ts            # Cents type, add, percentOf, allocate
    age.ts              # ageOn(dob, date), ageBand(age)
    catalog.ts          # Product, PassRule, ExtraRule types
    eligibility.ts      # validateGroup(): who may hold which product
    promo.ts            # evaluatePromo(): valid / expired / exhausted / n/a
    pricing/
      pipeline.ts       # runs the pricing steps in order
      steps/*.ts        # one file per step (see §5.6)
    errors.ts           # DomainError codes (a typed union)
  application/
    quote-booking.ts
    create-booking.ts
    confirm-payment.ts
    expire-holds.ts
  infrastructure/
    db/schema.ts, db/client.ts, db/seed.ts
    repositories/*.ts
    payments/simulated.ts, payments/stripe.ts
  features/booking/     # UI: reducer, steps, components
  lib/                  # env parsing, logger, http helpers
tests/
  domain/*.test.ts
  integration/*.test.ts   # concurrency, idempotency against a test DB
```

---

## 3. Domain model

### 3.1 Core idea

**The attendee is the source of truth. Tickets hang off attendees.**

Every person in the group gets an `Attendee` record, and every attendee has exactly one `Entry`. So the number of people always matches the number of tickets. That isn't a check we have to remember to run: the data shape makes a mismatch impossible to represent. If someone removes a person, their ticket goes with them. If someone changes a child's date of birth, their ticket is re-evaluated.

```ts
type Cents = number & { readonly __brand: 'Cents' };   // integer only
type EventDayId = string & { readonly __brand: 'EventDayId' };
type ProductId  = string & { readonly __brand: 'ProductId' };

type AgeBand = 'infant' | 'child' | 'adult';            // <5 | 5–11 | 12+

type Entry =
  | { kind: 'none' }                                     // under-5, free, no stock
  | { kind: 'day_pass';    productId: ProductId; dayIds: EventDayId[] }   // ≥1 day
  | { kind: 'all_days';    productId: ProductId }
  | { kind: 'family_pass'; familyGroupIds: string[] };   // one group per day (see D20)

interface Attendee {
  clientId: string;           // stable id from the browser, for diffing
  firstName: string;
  lastName: string;
  dateOfBirth: string;        // ISO date; age is DERIVED, never sent as a number
  entry: Entry;
  // adult-only optional fields (see §4)
}

interface FamilyGroup {
  id: string;
  productId: ProductId;
  dayId: EventDayId;          // a family pass is for ONE day
  attendeeClientIds: string[];
}

interface Booker {             // person paying — may or may not attend
  firstName: string; lastName: string;
  email: string; phone: string;
  dateOfBirth: string;        // must be 18+ on booking date
  isAttending: boolean;       // if true, they also appear in attendees[]
}
```

### 3.2 Products are data, not names

Every rule reads **structured fields**, never a product's display name. An admin renaming "Day Pass – Adult" to "Daily Adult Entry" changes nothing.

```ts
interface Product {
  id: ProductId;
  eventId: string;
  code: string;               // stable machine key, e.g. 'DAY_ADULT' — never shown, never renamed
  displayName: string;        // free to change
  category: 'entry' | 'extra';
  priceCents: Cents;
  pricing: 'per_person_per_day' | 'flat' | 'per_unit';
  rule: PassRule | ExtraRule;
  active: boolean;
}

interface PassRule {
  type: 'pass';
  dayScope: 'chosen_days' | 'all_days' | 'single_day';
  eligibleAgeBand?: AgeBand;              // 'adult' | 'child'; undefined = composite (family)
  covers?: { adult: number; child: number };  // family: { adult: 2, child: 2 }
}

interface ExtraRule {
  type: 'extra';
  scope: 'per_booking' | 'per_attendee_per_day' | 'per_attendee_per_session';
  availableDayIds?: EventDayId[];        // Garba: Nov 11, Nov 13 only
  requiresEntryOnDay: boolean;            // must hold entry for that day
  minAgeBand?: AgeBand;
  maxPerBooking?: number;                 // Dandiya: sensible cap
}
```

### 3.3 Seed data (Sharad Utsav 2026)

| code | price | pricing | rule | stock |
| --- | --- | --- | --- | --- |
| `DAY_ADULT` | 1500 | per_person_per_day | pass, chosen_days, adult | 380 |
| `DAY_CHILD` | 800 | per_person_per_day | pass, chosen_days, child | 260 |
| `ALLDAY_ADULT` | 6000 | flat | pass, all_days, adult | **0** |
| `ALLDAY_CHILD` | 3000 | flat | pass, all_days, child | 140 |
| `FAMILY` | 4000 | flat | pass, single_day, covers 2A+2C | 95 |
| `DANDIYA` | 500 | per_unit | extra, per_booking, max 20 | 900 |
| `DINNER` | 1200 | per_person_per_day | extra, per_attendee_per_day, requiresEntryOnDay | 1700 |
| `GARBA` | 2000 | per_unit | extra, per_attendee_per_session, days [Nov 11, Nov 13], requiresEntryOnDay | **2** |

Event: `sharad-utsav-2026`, timezone `America/Chicago`, days 2026-11-10 → 2026-11-14, currency USD.

### 3.4 Money

- All amounts are **integer cents** (`Cents` branded type). There are no floats anywhere in the money path.
- Percentage discounts use `Math.round` half-up **once at booking level**, then the discount is split across line items by the largest-remainder method so the lines always add up to the total exactly. That split also gives us correct per-line refunds later.
- Formatting to `$146.70` happens only in the UI, via `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })`.

---

## 4. People & data collected

| Field | Booker | Adult attendee (12+) | Child (5–11) | Infant (<5) |
| --- | --- | --- | --- | --- |
| First / last name | ✅ | ✅ | ✅ | ✅ |
| Date of birth | ✅ (must be 18+) | ✅ | ✅ | ✅ |
| Email | ✅ (confirmation) | optional | ❌ | ❌ |
| Phone | ✅ | optional | ❌ | ❌ |
| Emergency contact | — | — | defaults to booker | defaults to booker |

**Why date of birth and not "age"?**

- Age is computed for one fixed reference date (§6, decision D1), so there is no ambiguity about birthdays during the festival.
- A typed "7" is easy to fudge. A DOB is harder to fake consistently, and volunteers can check it at the door.
- It rejects nonsense cleanly: future dates, years before 1900, malformed strings.

We collect infants anyway (name and DOB only, no ticket) because volunteers need an accurate headcount and a safety record.

---

## 5. Business rules (enforced on the server, mirrored in the UI)

Each rule has a stable **error code**. The UI shows a friendly message for each code. Tests assert on codes, never on message text.

### 5.1 Age rules

| # | Rule | Code |
| --- | --- | --- |
| A1 | Age is computed **on the festival's first day (2026-11-10)** in the event timezone | — |
| A2 | Age < 5 → `infant` → `entry.kind` must be `none` (free, no stock) | `INFANT_MUST_NOT_HAVE_TICKET` |
| A3 | Age 5–11 → must be on a child product or inside a family pass as a child | `AGE_BAND_MISMATCH` |
| A4 | Age ≥ 12 → must be on an adult product or inside a family pass as an adult | `AGE_BAND_MISMATCH` |
| A5 | Booker must be ≥ 18 **on the booking date** | `BOOKER_UNDER_18` |
| A6 | DOB must be a real date, not in the future, age ≤ 120 | `INVALID_DOB` |

The UI never offers an adult ticket for a 7-year-old: the product list for each attendee is filtered by age band. The server re-checks anyway.

### 5.2 Entry rules

| # | Rule | Code |
| --- | --- | --- |
| E1 | Every non-infant attendee has exactly one entry kind | `ENTRY_REQUIRED` |
| E2 | Day pass: ≥ 1 day, days unique, days within the festival | `INVALID_DAYS` |
| E3 | All-day pass: always all 5 days; days cannot be chosen | — (shape enforces it) |
| E4 | Family pass: each pass is exactly one day; 1–2 adults and 0–2 children (see D3). A person can be in at most one family pass per day (see D20). | `FAMILY_PASS_COMPOSITION` |
| E5 | A day already in the past (or past the same-day cutoff, D9) cannot be booked | `DAY_NOT_ON_SALE` |
| E6 | Product must be active and belong to this event | `PRODUCT_UNAVAILABLE` |
| E7 | Booking has at least one ticketed attendee | `EMPTY_BOOKING` |
| E8 | Every day with an under-12 attending has at least one attendee aged 18+ that day (D6) | `CHILD_UNACCOMPANIED` |
| E9 | Max 20 attendees per booking (abuse guard; larger groups contact the temple) | `GROUP_TOO_LARGE` |

### 5.3 Extras rules

| # | Rule | Code |
| --- | --- | --- |
| X1 | Dinner: per attendee, per day, only on days that attendee holds entry | `EXTRA_REQUIRES_ENTRY` |
| X2 | Garba: only Nov 11 / Nov 13; attendee must hold entry for that day | `EXTRA_DAY_NOT_ALLOWED` |
| X3 | Dandiya: 1–20 per booking | `QUANTITY_OUT_OF_RANGE` |
| X4 | Quantities are positive integers | `INVALID_QUANTITY` |

### 5.4 Stock rules

| # | Rule | Code |
| --- | --- | --- |
| S1 | Stock units: **day pass and dinner = person-days**; all-day, family, garba, dandiya = units | — |
| S2 | Request > remaining → reject the whole booking (no partial fills) and name the item | `SOLD_OUT` / `INSUFFICIENT_STOCK` |
| S3 | Stock is held when a booking is created, and released if not paid within 15 min | — |
| S4 | Sold-out products appear in the catalog as `soldOut: true` and can't be selected | — |

### 5.5 Promo rules

| Code | Type | Behaviour | Message (UI) |
| --- | --- | --- | --- |
| `SEVA10` | percent 10 | 10% off subtotal (tickets + extras) | "SEVA10 applied — 10% off." |
| `FLAT20` | fixed 2000 | $20 off, **capped at subtotal** (never below $0) | "FLAT20 applied — $20 off." |
| `KIDSFREE` | free child entry | Child **day / all-day** pass lines → $0. Adults, family pass, extras unaffected. Rejected if no child tickets. | "Child tickets are now free." / "This code is for child tickets — your booking has none." |
| `EXPIRED5` | expired | `valid_to` = last month | "This code expired on 30 Sep 2026." |
| `MAXEDOUT` | exhausted | `redemptions >= max_redemptions` | "This code has reached its usage limit." |
| anything else | — | case-insensitive, trimmed lookup fails | "We don't recognise that code." |

- One promo code per booking.
- An invalid code never blocks the booking. It's ignored, and the reason is shown.
- A redemption is **reserved** with the stock hold and **committed** on payment, using an atomic counter, so `max_redemptions` can't be exceeded under concurrency.
- Codes are stored as data (`promo_codes` table), so new codes need no code change.

### 5.6 Pricing pipeline (the single place money is calculated)

```
input: validated BookingDraft + catalog + promo + clock
  1. resolveEntries      → entry line items (qty = days or 1)
  2. resolveExtras       → extra line items
  3. subtotal            = Σ line totals
  4. lineLevelPromos     → e.g. KIDSFREE zeroes child entry lines
  5. bookingLevelPromos  → SEVA10 / FLAT20, capped at remaining subtotal
  6. allocateDiscount    → largest-remainder split across lines
  7. total               = subtotal − discount   (assert ≥ 0, integer)
  8. suggestions         → non-binding hints (see D4), computed on the
                           post-promo prices so KIDSFREE never yields a bogus "save $10"
output: Quote { lines[], subtotalCents, discountCents, totalCents, promo, suggestions[], warnings[] }
```

Each step is a pure function `(state) => state`, one per file. Adding a new rule (§12) means adding a step or extending one.

---

## 6. Gaps in the brief → decisions

The brief says there are "at least four" open situations. These are the ones found so far, with a decision for each. All of them go into the README under **"Decisions I made"**.

| # | Situation the brief doesn't cover | Decision | Why |
| --- | --- | --- | --- |
| **D1** | A child has a birthday **during** the festival (e.g. turns 12 on Nov 12). Which age counts? | Age on **first festival day (Nov 10)** for everyone. | One rule, predictable price, checkable at the door. |
| **D2** | **Adult all-day pass is sold out** but an adult wants all 5 days. 5 × $15 = $75 > $60. | Allow 5 day passes at $75. Show a notice: "The adult all-day pass is sold out; 5 day passes cost $75." | We can't sell stock we don't have. Being upfront beats a surprise at checkout. |
| **D3** | **Family pass with fewer than 2+2** (e.g. 2 adults + 1 child, which is $38 on day passes vs $40). | Allow 1–2 adults + 0–2 children, at least 1 adult. If day passes would be cheaper, show a hint, but don't switch silently. | Families aren't always exactly 2+2. Never quietly overcharge. |
| **D4** | **Child picks 5 day passes** ($40) when an all-day child pass ($30) exists. | Quote returns a `suggestion` ("Save $10 with the All-Day Child Pass") and the UI offers a one-click switch. No silent auto-switch. | Customers decide; we make sure they know. |
| **D5** | **Everyone in the group is under 5**, or toddlers come with no adult. | Infants must be in a booking with ≥ 1 ticketed attendee aged 18+ on the same day(s). A booking that is only infants is rejected. | Safety, and the door needs a responsible adult. |
| **D6** | **Unaccompanied children** (a 13-year-old "adult" ticket with a 6-year-old sibling). | Each day with an under-12 must include an attendee aged 18+. | "Adult price" starts at 12, but responsibility starts at 18. |
| **D7** | **Is the booker attending?** (e.g. a son books for his parents) | `booker.isAttending` flag. The booker is only counted as an attendee if they tick it. | Avoids charging the payer for a ticket they don't need. |
| **D8** | **Day-pass stock = people or person-days?** | Person-days. 380 = 380 adult-day admissions. | Price is per day, so capacity is per day. Per-day pools can be added later without a schema change (§8.3). |
| **D9** | **Booking a day that has already started or passed.** | Days are bookable until **6 pm Central on that day**. Past days are hidden. All-day passes stop selling once day 1 begins. | Selling a 5-day pass on day 4 is unfair at the full price. |
| **D10** | **FLAT20 on a booking under $20.** | Discount capped at the subtotal. A $0 total skips payment and confirms directly, still decrementing stock. | Total must never go negative. |
| **D11** | **KIDSFREE + family pass / extras.** | Applies only to child day / all-day pass lines. Family pass, dinner, workshop not included. | The family pass is a bundle, not a child ticket. |
| **D12** | **Dinner for toddlers.** | Optional per infant per day at the full $12. Default off. | Food costs real money. Parents choose. |
| **D13** | **Garba workshop stock (2) — per session or total?** | Total pool of 2 across both days (as given). The UI shows "2 places left". | Matches the stock table. Per-session pools are possible later (§8.3). |
| **D14** | **Garba for infants?** | Not allowed for under-5s. | A workshop place is scarce and not meaningful for toddlers. |
| **D15** | **Price or stock changes between quote and payment.** | Quote is advisory. `POST /bookings` re-prices and holds atomically, and the response is the amount charged. If it differs, the UI shows the new amount before payment. | Server is the source of truth at the moment of commitment. |
| **D16** | **User abandons at payment.** | Holds expire after 15 min. **Lazy cleanup is the primary mechanism**: every catalog read and every `POST /bookings` first releases expired holds in the same transaction. A Vercel cron runs as a safety net. | Prevents phantom sell-outs. The Vercel free (Hobby) plan only allows cron **once a day**, so the cron can't be relied on. |
| **D17** | **Double-click on Pay / retry after network loss.** | `Idempotency-Key` header on create and pay. A repeat returns the original result. | No duplicate bookings or charges. |
| **D18** | **Same person entered twice.** | Warn (same name + DOB) but don't block. | Twins exist, but typos are more common. |
| **D19** | **Taxes / fees.** | None. Prices are final. | Not specified. A temple festival is likely tax-exempt. Easy to add as a pipeline step. |
| **D20** | **A family wants the Family Pass on more than one day.** | Allowed. Each day is a separate $40 Family Pass, using one unit of stock each, and the same people can be in each. It still counts as "one kind" of ticket per person. | "One single day" describes what one pass covers, not a limit on how many a family can buy. |
| **D21** | **Promo code expiry: which time zone?** | All validity dates are checked in the event time zone (`America/Chicago`). A code is valid through 23:59:59 on its last day. | Families are in Texas; a server in UTC shouldn't expire a code 5 hours early. |

---

## 7. API contract

**Conventions**

- JSON in/out. Money is always `…Cents` integers. Dates are ISO `YYYY-MM-DD` in the event timezone.
- Errors use `application/problem+json`: `{ type, title, status, code, details?: [{ path, code, message }] }`.
- Mutating calls require an `Idempotency-Key` (UUID) header.
- The server ignores any price or total a client sends. There are no such fields in the request schemas.
- Versioned by path prefix later (`/api/v1/...`) once there are external consumers.

| Method & path | Purpose | Request | Success response |
| --- | --- | --- | --- |
| `GET /api/events/{slug}` | Catalog | — | `{ event, days[], products[{ id, code, displayName, priceCents, pricing, rule, remaining, soldOut }] }` |
| `POST /api/events/{slug}/quotes` | Price a draft (no side effects) | `BookingDraft` | `200 Quote` or `422 problem` with field-level `details` |
| `POST /api/bookings` | Validate + reprice + hold stock + reserve promo | `BookingDraft` + `Idempotency-Key` | `201 { bookingId, accessToken, status: 'pending_payment', quote, holdExpiresAt, payment: { provider, clientSecret? } }`. `accessToken` is a random secret that goes into the confirmation link. |
| `POST /api/bookings/{id}/pay` | Simulated payment | `{ outcome: 'succeed' \| 'decline' }` + `Idempotency-Key` | `200 { status: 'confirmed', confirmationCode }` / `402 PAYMENT_DECLINED` |
| `GET /api/bookings/{id}?token=` | Confirmation page data | `accessToken` from create (stored hashed; compared in constant time) | `200 Booking` (attendees, lines, totals, QR payload) |
| `POST /api/webhooks/stripe` | (optional) Stripe events | Stripe-signed | `200` |
| `GET /api/cron/expire-holds` | Release expired holds | Vercel cron secret | `200 { released }` |

**`BookingDraft`** (Zod schema, shared type):

```ts
{
  eventSlug: string;
  booker: Booker;
  attendees: Attendee[];          // 1..20
  familyGroups: FamilyGroup[];
  extras: Array<
    | { productId; quantity }                                  // per_booking (Dandiya)
    | { productId; attendeeClientId; dayIds: EventDayId[] }    // per_attendee (Dinner, Garba)
  >;
  promoCode?: string;
}
```

**Status codes:** `400` malformed JSON or schema · `404` unknown event/booking · `409` stock conflict / idempotency key reused with a different body · `410` hold expired · `422` rule violation · `429` rate limited.

---

## 8. Correctness under load (the "million users" part)

### 8.1 Booking state machine

```
         POST /bookings                     pay ok / webhook
 (none) ───────────────▶ PENDING_PAYMENT ─────────────────────▶ CONFIRMED
                              │   │                                  │
             15 min, no pay   │   │ pay declined (can retry          │ (future)
                              ▼   ▼  until hold expires)             ▼
                           EXPIRED  ◀─────────────────────────   REFUNDED / CANCELLED
                       (stock + promo released)
```

Transitions happen only through `application/` use-cases, each in one DB transaction, guarded by `WHERE status = <expected>`. That makes them safe to repeat and safe to race.

### 8.2 Atomic stock hold (no oversell, no locks held across the network)

Inside one transaction in `createBooking`:

```sql
-- for each (pool, qty) in a FIXED ORDER (by pool id) to avoid deadlocks
UPDATE inventory_pools
   SET remaining = remaining - $qty
 WHERE id = $pool AND remaining >= $qty
RETURNING remaining;
-- 0 rows → throw INSUFFICIENT_STOCK → whole transaction rolls back
INSERT INTO inventory_holds (booking_id, pool_id, qty, expires_at) ...
```

- Two buyers, two Garba places left, both want two → exactly one `UPDATE` matches, the other gets `409 INSUFFICIENT_STOCK`.
- Expiry adds `remaining` back and marks the hold released, guarded so it can't run twice.
- Covered by an integration test that fires N parallel `POST /bookings` calls and asserts total sold ≤ stock.

### 8.3 Tables

| Table | Key columns | Notes |
| --- | --- | --- |
| `organizations` | id, name | Multi-tenant ready (one row for now) |
| `events` | id, org_id, slug, timezone, currency, sales_open_at, sales_close_at | |
| `event_days` | id, event_id, date, same_day_cutoff_time | |
| `products` | id, event_id, code, display_name, category, price_cents, pricing, rule (jsonb, Zod-validated), active | `UNIQUE(event_id, code)` |
| `inventory_pools` | id, product_id, event_day_id **NULL = shared across days**, capacity, remaining | `CHECK (remaining >= 0)` — the last line of defence |
| `inventory_holds` | booking_id, pool_id, qty, expires_at, released_at | |
| `promo_codes` | id, event_id, code (citext), kind, value, applies_to, valid_from, valid_to, max_redemptions, redemptions | `CHECK (redemptions <= max_redemptions)` |
| `bookings` | id, event_id, status, booker_* , subtotal_cents, discount_cents, total_cents, promo_code_id, confirmation_code, hold_expires_at, created_at | |
| `booking_attendees` | id, booking_id, first/last name, dob, age_band, entry_kind | |
| `booking_lines` | id, booking_id, product_id, attendee_id?, day_id?, qty, unit_price_cents, discount_cents, line_total_cents | **Price snapshot.** Later catalog changes don't rewrite history. |
| `payments` | id, booking_id, provider, provider_ref, amount_cents, status | |
| `idempotency_keys` | key, request_hash, response_json, created_at | 24h TTL |
| `outbox` | id, type, payload, processed_at | Confirmation emails etc., sent asynchronously |

Indexes: `bookings(status, hold_expires_at)`, `inventory_holds(expires_at) WHERE released_at IS NULL`, `promo_codes(event_id, code)`.

### 8.4 Scaling path (designed now, built when needed)

| Pressure | Now (assessment) | When traffic demands it |
| --- | --- | --- |
| Catalog reads | Server component + short revalidate | CDN cache (ISR, 5–10s), stock fetched separately |
| DB connections | Neon serverless driver / pooled URL | PgBouncer, read replica for reads |
| Hot stock rows (flash sale) | Single-row conditional `UPDATE` | Split counters into N buckets, or a Redis reservation layer with Postgres as the source of truth |
| Traffic spikes | — | Rate limiting (Upstash) per IP + per email; virtual waiting room for on-sale moments |
| Emails / side effects | Outbox row written in the same transaction; sent inline best-effort | Queue worker (QStash / Inngest) draining the outbox with retries |
| Observability | Structured JSON logs with `bookingId`, `requestId` | Sentry + OpenTelemetry traces + alerts on oversell checks and payment failures |
| Multiple festivals | `event_id` on everything, rules as data | Admin UI for products, pools, promos; per-org isolation |

---

## 9. Front-end flow

### 9.1 Steps

| Step | Screen | Key behaviour |
| --- | --- | --- |
| 1 | **Who's coming** | Add people (name + DOB). Age band badge appears live. Infants are marked "Free". Booker toggle "I'm attending". |
| 2 | **Days & passes** | Per person, choose Day pass (pick days) / All-day / Family. Only age-valid products shown; sold-out ones disabled with a label. Family pass groups 1–2 adults + 0–2 children for one day. |
| 3 | **Extras** | Dinner per person per day (only their days). Garba on Nov 11 / 13 ("2 places left"). Dandiya quantity. |
| 4 | **Review** | Server quote: line items, promo field, suggestions ("Save $10…"), total. |
| 5 | **Contact & pay** | Booker details, then `POST /bookings`, which shows the hold countdown. Pay (simulated succeed/decline, or Stripe). The Pay button is disabled while in flight, with an idempotency key. |
| 6 | **Confirmation** | Confirmation code, attendee list, QR for the door, receipt. Reload-safe via `GET /bookings/{id}`. |

### 9.2 State management

- A single `useReducer` with a typed `BookingState` and discriminated-union actions (`ADD_ATTENDEE`, `SET_DOB`, `SET_ENTRY`, `TOGGLE_DINNER`…). No sprawl of `useState`.
- The reducer **cascades**: removing a person removes their entry, family-group membership, and extras. Changing a DOB that changes the age band clears an entry that is no longer valid and tells the user why.
- The draft is saved to `sessionStorage`, so a refresh doesn't lose it.
- The quote is re-fetched (debounced 300ms, aborting stale requests) whenever the draft changes. The UI shows the server's numbers only. Shared pure domain functions give instant inline validation.

### 9.3 UX quality bar

- Mobile-first, works one-handed at 360px wide. Keyboard-navigable. Visible focus rings in `brightGold`.
- **Contrast:** gold `#C99B24` on `#2C2C2C` is ≈ 5.4:1, which passes AA for text. **Never** use white text on a gold button (≈ 2.6:1, fails): use `#291900` (heading) on gold (≈ 6.6:1). Check every pair with a contrast checker.
- Cards: `rgba(255,255,255,0.05)` fill and `rgba(255,255,255,0.2)` border on the dark background. Serif headings (e.g. Cormorant / Playfair) with Inter body text.
- Every async state is designed: loading skeletons, empty group, sold out, offline banner (`navigator.onLine` plus fetch failure), hold expired → "Your places were released — re-check availability".
- Errors are helpful, not scolding: "Aarav is 7 on 10 Nov, so he needs a child ticket ($8/day)."

---

## 10. Testing strategy

| Level | What | Tool | Must-have cases |
| --- | --- | --- | --- |
| Unit — money | add, percent, allocate | Vitest | 10% of 14670 → 1467; allocation sums exactly; no floats |
| Unit — age | `ageOn`, bands | Vitest | Birthday on Nov 10 / Nov 9 / Nov 11; Feb 29 DOB; age 4/5/11/12/17/18; future DOB; garbage strings |
| Unit — eligibility | group validation | Vitest | Adult ticket for 7-year-old; infant with ticket; child unaccompanied; family 3 adults; garba on Nov 12 |
| Unit — pricing | full pipeline | Vitest | Each promo × each product mix; FLAT20 on $15; KIDSFREE with no kids; KIDSFREE + family; 5 adult days with all-day sold out |
| Integration | API + DB | Vitest + test Neon branch | Parallel last-2-garba race; idempotent replay; hold expiry returns stock; MAXEDOUT race; tampered request (extra `totalCents` field ignored) |
| E2E (optional) | happy path on mobile viewport | Playwright | Book family, pay, confirmation |

`TEST-CASES.md` lists every case as a table: **Situation · Expected behaviour · Where enforced · Test file**.

---

## 11. Delivery plan — phases, tasks, and pace

**Budget:** ~13.5 hours of focused work across 4 days, which fits the brief's 10–14h window. Each phase ends with something **deployed** and **committed**. Commit in small steps; the history is assessed too.

### Overview

| Phase | Goal | Hours | Day | Exit criteria (done means…) |
| --- | --- | --- | --- | --- |
| **P0** Design & skeleton | Plan committed; empty app live on Vercel | 1.5 | Day 1 | `DESIGN.md` committed **first**; Next.js app deploys to Vercel prod URL; Neon connected |
| **P1** Domain core | All money and rule logic as pure, tested functions | 3.0 | Day 1–2 | `pnpm test` green for money, age, eligibility, promo, pricing |
| **P2** Data & API | Real DB, real stock, documented endpoints | 3.0 | Day 2 | Migrations + seed on Neon; all §7 endpoints work via curl; race test passes |
| **P3** Booking UI | Full flow on a phone | 3.5 | Day 3 | Stranger can book end-to-end on the deployed site |
| **P4** Hardening | Edges, failures, accessibility | 1.5 | Day 4 | Every §6 decision works live; double-click / offline / sold-out handled; contrast checked |
| **P5** Ship & document | Submission package | 1.0 | Day 4 | README, TEST-CASES.md, prod URL verified, recording done |
| *Optional* | Stripe test mode | +1.5 | if time | Real test-mode charge + webhook confirms booking |

Speed check: by the **end of Day 2**, P0–P2 must be done, meaning the API is correct even with no UI. If behind, cut P3 polish, never P1/P2 correctness.

### P0 — Design & skeleton (1.5h)

- [ ] Write the one-page `DESIGN.md` in your own words (model, endpoints, tricky cases, non-goals). **Commit before any code.**
- [ ] `create-next-app` (TS, App Router, Tailwind, ESLint); `strict: true`, `noUncheckedIndexedAccess: true`; ban `any` via ESLint. **No unsafe casts:** the only `as` allowed is inside branded-type constructors (`toCents()`, `toProductId()`), and DB `jsonb` columns are parsed with Zod, never cast.
- [ ] Add Vitest, Zod, Drizzle, `@neondatabase/serverless`.
- [ ] `lib/env.ts`: Zod-parse `process.env` so missing vars fail fast at boot.
- [ ] `.gitignore` includes `.env*`; add `.env.example`.
- [ ] Create Neon project; set `DATABASE_URL` locally **and in Vercel**.
- [ ] `vercel --prod` with a placeholder page, and check the **Vercel build log**, not just the local build.

### P1 — Domain core (3h)

- [ ] `money.ts` + tests (branded `Cents`, `percentOf`, `allocate`).
- [ ] `age.ts` + tests (`ageOn(dob, referenceDate, tz)`, `ageBand`).
- [ ] `catalog.ts` types + in-code seed fixture (same data as DB seed).
- [ ] `errors.ts`: `DomainErrorCode` union with every code from §5.
- [ ] `eligibility.ts` + tests: rules A1–A6, E1–E9, X1–X4.
- [ ] `promo.ts` + tests: all 5 codes plus unknown, case and whitespace handling.
- [ ] `pricing/pipeline.ts` + steps + tests: every row of §6 that touches money.

### P2 — Data & API (3h)

- [ ] Drizzle schema (§8.3) + migration + `db/seed.ts` (idempotent upsert).
- [ ] Repositories: catalog, inventory, promo, booking, idempotency.
- [ ] Zod request schemas shared with the UI (`BookingDraft`).
- [ ] `GET /events/{slug}`, `POST /quotes`.
- [ ] `POST /bookings`: one transaction to validate, reprice, hold stock in pool-id order, reserve promo, write lines snapshot, write idempotency record.
- [ ] `POST /bookings/{id}/pay` (simulated) → confirm + commit promo + outbox row; `GET /bookings/{id}`.
- [ ] Hold expiry: lazy release inside catalog reads and `POST /bookings` (primary) + daily Vercel cron in `vercel.json` (safety net; Hobby plan limit).
- [ ] Run migrations + seed against the **production** Neon database, not just local. Use a separate Neon branch for integration tests, never prod.
- [ ] Problem+json error mapper; request-id logging.
- [ ] Integration tests: concurrency race, idempotent replay, tampered body.
- [ ] Write the API table in the README now, while it's fresh.

### P3 — Booking UI (3.5h)

- [ ] Theme tokens in Tailwind config; fonts; base layout (dark background, cream cards).
- [ ] `features/booking/reducer.ts` + types + cascade logic (unit-test the reducer too).
- [ ] Step 1 Who's coming → Step 2 Passes → Step 3 Extras → Step 4 Review/promo → Step 5 Pay → Step 6 Confirmation.
- [ ] Quote hook: debounced, abortable, shows server totals and suggestions.
- [ ] Sold-out and low-stock presentation from catalog data.
- [ ] Deploy and test on a real phone.

### P4 — Hardening (1.5h)

- [ ] Pay button: disabled while in flight. Idempotency key lifecycle: generate one when the user first presses "Continue to pay" for a given draft, keep it in reducer state, and **reuse it on every retry**. Only generate a new key if the draft changes.
- [ ] Offline / network-error banner and retry; hold-expired path; price-changed path (D15).
- [ ] Keyboard pass over every step; labels and `aria-live` for errors and totals.
- [ ] Contrast check of every colour pair used.
- [ ] Walk through every D1–D21 on the **live** site.
- [ ] Write `TEST-CASES.md`.

### P5 — Ship & document (1h)

- [ ] README: prod URL at top · run locally · env vars (what each is for) · API contract · **Decisions I made** (§6) · unfinished work stated plainly · "running 10 festivals" note (§12.2).
- [ ] Final `vercel --prod`; open in a private window, no login prompt.
- [ ] Record the 3–5 min walkthrough on the live site: happy path, adult ticket for a child rejected, Garba sold out after 2, KIDSFREE / EXPIRED5 / MAXEDOUT, double-click Pay.
- [ ] Invite `aditirkt` if the repo is private.
- [ ] Confirm every env var is set in Vercel for **Production** (not only Preview).
- [ ] **Keep the deployment and Neon database live until the interview is over.** Neon's free tier sleeps but doesn't delete; don't delete the project.

### Beyond the assessment — production roadmap

| Phase | Scope | Rough size |
| --- | --- | --- |
| P6 Operations | Admin login; manage products, stock, promos; door check-in app (scan QR, mark attended); real email confirmations via outbox worker | 2–3 weeks |
| P7 Payments+ | Stripe live, refunds and partial cancellations (uses per-line discount allocation), receipts | 1–2 weeks |
| P8 Scale | Rate limiting, waiting room, CDN catalog, sharded hot counters, load test (k6) to target RPS, SLOs and alerts | 2 weeks |
| P9 Multi-tenant | Multiple temples and events, per-org branding, rule config per event, reporting | 3–4 weeks |

---

## 12. Built for change

### 12.1 Recipes for likely committee rules (interview prep)

| New rule | Where it goes | Size |
| --- | --- | --- |
| "Seniors 65+ get 50% off day passes" | Add `senior` band in `age.ts`, then a new pricing step `seniorDiscount.ts` + test | ~20 lines |
| "Garba is 12+ only" | `GARBA.rule.minAgeBand = 'adult'` in seed (data only) | 1 line + test |
| "Early-bird 15% off until 1 Nov" | New promo kind `auto_until_date`, or a pipeline step reading `event.earlyBirdUntil` | small |
| "Max 6 dinner plates per booking" | `DINNER.rule.maxPerBooking = 6` (data) | 1 line |
| "Nov 14 capped at 200 adults" | Add a per-day `inventory_pool` for DAY_ADULT/Nov 14. Hold logic already supports day pools. | data only |
| "Promo can't combine with family pass" | `promo.applies_to` exclusion list in `promo.ts` | small |
| "Booker must attend" | Flip a rule in `eligibility.ts` (`BOOKER_MUST_ATTEND`) | small |

**Rule of thumb:** a new rule means one domain file or one data change, plus one test, and **no UI logic change** beyond showing a new error code's message.

### 12.2 Running ten festivals with ten rule sets

Everything already hangs off `event_id`: products, pools, promos, days. Rule parameters live in `product.rule` / `event` config (Zod-validated JSON). Genuinely new behaviour is a new pipeline step that is **enabled per event** (`event.pricingSteps: string[]`). That way new behaviour ships once and is switched on only where a committee wants it.

---

## 13. Non-goals (and why)

| Not doing | Why |
| --- | --- |
| User accounts / login | Not needed to book. The confirmation link uses a signed token. |
| Admin UI | Seed scripts cover the assessment. Planned for P6. |
| Real emails | Outbox row + confirmation page instead. Sending is a later worker. |
| Refunds / edits after payment | Out of scope. The data model (line snapshots, allocated discounts) already supports them. |
| Multiple currencies, taxes | USD only, no tax (D19). |
| Seat maps / time slots | General admission only. |
| Microservices | A modular monolith with clean layers is right at this size. Boundaries are drawn so services could be split out later. |

---

## 14. Submission checklist (from the brief)

- [ ] `DESIGN.md` — committed first, never rewritten
- [ ] Public GitHub repo (or private with `aditirkt` invited), small honest commits
- [ ] Live **production** Vercel URL, no password, also at top of README
- [ ] README: run locally · env vars · API contract · Decisions I made · unfinished items
- [ ] `TEST-CASES.md`
- [ ] Vitest tests for pricing and age rules, passing
- [ ] 3–5 minute recording on the deployed site, including failure cases
- [ ] Deployment kept live until the interview is complete

### Brief → spec traceability

| Brief section | Covered in spec |
| --- | --- |
| §2 Event, colours, contrast | §3.3, §9.3 |
| §3 Products, extras, stock, promos | §3.2–3.3, §5.3–5.5, §8 |
| §4 Who is coming | §3.1, §4, §9.2 |
| §5 Age rules | §4, §5.1, D1 |
| §6 Server price, server rules, real stock, documented contract, payment | §5.6, §5, §8.2, §7, §7 + P5 |
| §7 Vercel deploy, env vars, serverless data layer | §2.1, P0, P2, P5 |
| §8 Open questions → "Decisions I made" | §6 (D1–D21) |
| §9 Submission items | §14 checklist |
| §10 Assessment criteria + "delighted to see" | §2.2, §3.4, §8, §9, §10, §12.2 |
| §11 Live rule change in the interview | §12.1 |
