# Sharad Utsav 2026 tickets

Live: **https://sharad-utsav-rho.vercel.app**

A booking page for the Sharad Utsav festival at Radha Krishna Temple, Allen, Texas (10 to 14 Nov 2026). A family adds everyone who's coming, picks days and passes, adds extras, tries a promo code, pays (simulated) and gets a confirmation with a QR code for the door.

No login is needed. Open the link and click "Book tickets".

Other documents:

- [docs/DESIGN.md](docs/DESIGN.md): my design note, written before the domain code. I haven't changed it since.
- [docs/SPEC.md](docs/SPEC.md): the longer working plan I built from.
- [TEST-CASES.md](TEST-CASES.md): the edge cases I checked and what the app does in each.

Stack: Next.js 15 (App Router, route handlers for the API), TypeScript, Zod, Drizzle, Postgres on Neon, Vitest, Tailwind. Deployed on Vercel.

## Run locally

Requirements: Node >= 20.9, pnpm, and Postgres (15+).

```bash
pnpm install
createdb sharad_utsav_dev            # once
cp .env.example .env.local           # then set DATABASE_URL
pnpm db:setup                        # create tables + seed catalog
pnpm dev                             # http://localhost:3000 (or the next free port)
```

Check it works: `GET /api/health` should return `{"status":"ok","database":{"driver":"pg","reachable":true}}`.

### Tests

```bash
pnpm test                 # unit tests: money, age, eligibility, promo, pricing
pnpm test:integration     # API + Postgres: races, idempotency, expiry (needs TEST_DATABASE_URL)
pnpm check                # typecheck + lint + format + unit tests
```

For integration tests: `createdb sharad_utsav_test`, then put
`TEST_DATABASE_URL=postgres://<user>@localhost:5432/sharad_utsav_test` in `.env.test.local`.
The tests wipe that database, so its name must contain `test`.

## Environment variables

| Variable                       | Where                | Required | Purpose                                                                                                              |
| ------------------------------ | -------------------- | -------- | -------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                 | `.env.local`, Vercel | yes      | Postgres connection string. A `*.neon.tech` host uses the Neon serverless driver; any other host uses node-postgres. |
| `CRON_SECRET`                  | `.env.local`, Vercel | prod     | Bearer secret Vercel sends to `/api/cron/expire-holds`. Without it the cron endpoint refuses every call.             |
| `PORT`                         | `.env.local`         | no       | Preferred port for `pnpm dev` / `pnpm start` (local only; Vercel ignores it).                                        |
| `TEST_DATABASE_URL`            | `.env.test.local`    | tests    | Separate database for `pnpm test:integration`. Never point it at real data.                                          |
| `NEXT_PUBLIC_SITE_NAME`        | `.env.local`, Vercel | no       | Site title and heading (default "Festival tickets"). Events themselves come from the database.                       |
| `NEXT_PUBLIC_SITE_DESCRIPTION` | `.env.local`, Vercel | no       | One-line site description under the heading and in page metadata.                                                    |

## Using Neon

Only `DATABASE_URL` changes:

```bash
DATABASE_URL='postgresql://…neon.tech/…?sslmode=require' pnpm db:setup
```

Then set the same `DATABASE_URL` (and `CRON_SECRET`) in Vercel → Project → Settings → Environment Variables (Production).

On Vercel, Production needs `DATABASE_URL` (the Neon pooled connection string) and `CRON_SECRET` (at least 16 characters, used by the daily cleanup job). The two `NEXT_PUBLIC_SITE_*` variables are optional.

## API contract

JSON in and out. Money is always integer cents (`…Cents`). Dates are `YYYY-MM-DD` in the event timezone (`America/Chicago`). The server ignores any price or total a client sends.

| Method & path                    | Purpose                                              | Request                                                                   | Success                                                                                                                                                                                                              |
| -------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/events`                | Upcoming events (landing page)                       | —                                                                         | `200 { events[{ slug, name, venue, tagline, timezone, currency, firstDay, lastDay, lowestEntryPriceCents }] }`                                                                                                       |
| `GET /api/events/{slug}`         | Catalog with live stock                              | —                                                                         | `200 { event: { slug, name, venue, tagline, timezone, currency }, days[{ date, cutoffTime, onSale }], allDaysOnSale, products[{ id, code, displayName, category, priceCents, pricing, rule, remaining, soldOut }] }` |
| `POST /api/events/{slug}/quotes` | Price a draft, no side effects                       | `BookingDraft`                                                            | `200 Quote`                                                                                                                                                                                                          |
| `POST /api/bookings`             | Validate, re-price, hold stock 15 min, reserve promo | `BookingDraft` + `eventSlug` + `booker`, header `Idempotency-Key: <uuid>` | `201 { bookingId, accessToken, status, confirmationCode, quote, holdExpiresAt, payment: { provider, required } }`                                                                                                    |
| `POST /api/bookings/{id}/pay`    | Simulated payment                                    | `{ outcome: "succeed" \| "decline" }`, header `Idempotency-Key`           | `200 { status: "confirmed", confirmationCode }`                                                                                                                                                                      |
| `GET /api/bookings/{id}?token=…` | Confirmation page data                               | `token` = `accessToken` from create                                       | `200 { bookingId, event, status, confirmationCode, booker, attendees[], lines[], subtotalCents, discountCents, totalCents, promoCode, qrPayload }`                                                                   |
| `GET /api/cron/expire-holds`     | Release expired holds (daily safety net)             | `Authorization: Bearer <CRON_SECRET>`                                     | `200 { released }`                                                                                                                                                                                                   |
| `GET /api/health`                | Liveness + DB check                                  | —                                                                         | `200 { status, database: { driver, reachable } }`                                                                                                                                                                    |

**`BookingDraft`** (see [src/contracts/requests.ts](src/contracts/requests.ts)):

```ts
{
  attendees: {
    clientId: string;
    firstName: string;
    lastName: string;
    dateOfBirth: "YYYY-MM-DD"; // age is worked out by the server, on 10 Nov
    entry:
      | { kind: "none" } // under-5s
      | { kind: "day_pass"; productId: string; dates: string[] }
      | { kind: "all_days"; productId: string }
      | { kind: "family_pass" }; // membership is in familyGroups
  }[];
  familyGroups: { id: string; productId: string; date: string; attendeeClientIds: string[] }[];
  extras: (
    | { productId: string; quantity: number } // Dandiya
    | { productId: string; attendeeClientId: string; dates: string[] } // Dinner, Garba
  )[];
  promoCode?: string;
}
```

**`Quote`**: `{ lines[{ productId, productCode, attendeeClientId, familyGroupId, date, qty, unitPriceCents, discountCents, lineTotalCents }], subtotalCents, discountCents, totalCents, promo, suggestions[], warnings[] }`. `promo.status` is `applied`, `not_applicable`, `expired`, `not_yet_valid`, `exhausted`, `unknown` or `none`. An invalid code never blocks a booking.

**Errors** are `application/problem+json`: `{ type, title, status, code, detail?, details?: [{ path, code, message, params? }], requestId }`. `message` is written for people (dates formatted, products named); `params` carries the raw values (e.g. `productId`, `remaining`, ISO `date`) for clients that need them.

| Status | `code`                                                           | When                                                                             |
| ------ | ---------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 400    | `INVALID_JSON`, `INVALID_REQUEST`, `IDEMPOTENCY_KEY_REQUIRED`    | Malformed body, wrong shape, missing/invalid key                                 |
| 402    | `PAYMENT_DECLINED`                                               | Card declined; the hold stays, retry is allowed                                  |
| 404    | `EVENT_NOT_FOUND`, `BOOKING_NOT_FOUND`                           | Unknown slug or booking, or wrong confirmation token                             |
| 409    | `SOLD_OUT`, `INSUFFICIENT_STOCK`                                 | Not enough left; nothing is held                                                 |
| 409    | `IDEMPOTENCY_KEY_REUSED`, `REQUEST_IN_PROGRESS`, `INVALID_STATE` | Key reused with a different body; duplicate still running; booking can't be paid |
| 410    | `HOLD_EXPIRED`                                                   | The 15-minute hold ran out; stock was released                                   |
| 422    | `VALIDATION_FAILED`                                              | A booking rule failed; `details[].code` is the rule (e.g. `AGE_BAND_MISMATCH`)   |

Repeating a `POST` with the same `Idempotency-Key` and body returns the original response (header `idempotent-replayed: true`) instead of creating a second booking or charge.

## Decisions I made

The brief leaves a lot open on purpose. These are the situations I found and what I chose. Each has a code (D1 to D21) that matches [docs/SPEC.md](docs/SPEC.md) §6 and the tests.

**Age and who's in the group**

- **D1. Birthday during the festival.** Everyone's age is worked out on the first day, 10 Nov, in Texas time. A child who turns 12 on 12 Nov pays the child price all week. That gives one answer per person, and the door volunteers can check it.
- **D5. Under-5s.** They're free and get no ticket, but I still take their name and date of birth, because the door needs a list of who's inside. A booking that is only toddlers, or toddlers with no one aged 18 or over, is refused.
- **D6. Children with no grown-up.** "Adult price" starts at 12, but I don't think a 13-year-old should be the only one looking after a 6-year-old. Every day an under-12 attends needs someone aged 18 or over in the same booking on that day.
- **D7. The person paying isn't coming.** For example, a son booking for his parents. There's an "I'm also attending" box. The payer is only counted as a guest if they tick it, so nobody pays for a ticket they won't use.
- **D18. Same person entered twice.** Same name and same date of birth shows a warning but doesn't block the booking. Twins exist; typos are more common.
- **Details per person.** Everyone gives a first name, a last name and a date of birth. Only the person paying gives an email and a phone number. A nine-year-old doesn't need an email address.

**Tickets and stock**

- **D2. Adult all-day pass is sold out.** An adult who wants all five days can still come, on five day passes at $75. The page says plainly that this costs more than the $60 pass would have.
- **D3. Family pass that isn't exactly 2 + 2.** I allow 1 or 2 adults (12+) and up to 2 children (5 to 11). If separate day passes would be cheaper for that group, the page says so and offers to switch, but never does it on its own.
- **D4. A child on five day passes ($40) when the child all-day pass is $30.** The quote suggests the switch ("Save $10") with one click. I don't switch silently.
- **D20. Family pass on more than one day.** Allowed. Each day is its own $40 pass and uses one unit of stock.
- **D8. Is 380 day passes 380 people or 380 person-days?** Person-days. Price is per day, so I treated capacity as per day too.
- **D13. Garba workshop stock of 2.** One shared pool of 2 across both sessions (11 and 13 Nov), since that's how the stock table reads.
- **D14. Garba for under-5s.** Not allowed. Places are scarce and it isn't meaningful for a toddler.
- **D12. Dinner for under-5s.** Optional, full price, off by default. Food costs money; parents decide.
- **D9. Booking a day that's already started.** A day can be booked until 6 pm Central on that day. After that it's shown as closed. All-day passes stop selling once day 1 begins, because a five-day pass bought on day 4 is poor value at full price.

**Money and promo codes**

- **D10. FLAT20 on a booking under $20.** The discount stops at the subtotal, so the total can never go below $0. A $0 booking skips payment and confirms straight away, and still uses up stock.
- **D11. KIDSFREE.** It makes child day passes and child all-day passes free. It doesn't touch the family pass (that's a bundle, not a child ticket), dinners or workshops. With no child tickets in the booking, the page explains why it didn't apply.
- **SEVA10 rounding.** 10% is worked out once on the whole booking and rounded to the cent, then split across the lines so the line discounts add up exactly to the total discount. Everything is integer cents.
- **EXPIRED5 and MAXEDOUT.** Both are real codes that no longer work: one expired on 30 Sep 2026, the other has hit its limit. The page names the reason instead of saying "invalid". A wrong or used-up code never blocks the booking; it just isn't applied.
- **D21. Which time zone decides that a code has expired?** The event's, `America/Chicago`. A code is valid until 23:59:59 on its last day in Texas, not five hours early because the server runs in UTC.
- **D19. Tax and fees.** None. The price shown is the price charged.

**When things change or go wrong**

- **D15. Price or stock changes between review and payment.** The quote is a preview. When the person continues to payment, the server prices the booking again and holds the stock in the same transaction, and that is the amount charged. If it differs from what they reviewed, the pay step says so before they pay. If a promo code runs out in that gap, the booking goes ahead at full price and says why, rather than failing.
- **D16. Someone leaves at the payment step.** Their places are held for 15 minutes and then released. Release happens lazily: catalog reads, quotes, new bookings, payments and booking reads all clear expired holds first. A Vercel cron also runs once a day as a safety net. The free plan only allows daily crons, so I couldn't rely on it alone.
- **D17. Double-click on Pay, or a retry after the network drops.** Creating a booking and paying both need an `Idempotency-Key`. Sending the same request again returns the first result, so you can't get two bookings or two payments. The browser keeps the key for a retry and only makes a new one if the booking changes.

## Where the plan changed

DESIGN.md was my plan before I started. Things that ended up different:

- I added `GET /api/events`, so the home page lists events from the database instead of hard-coding one.
- Family passes became their own "family groups" (a pass, a day and its members). A person on a family pass just points to one. Modelling it that way made D3 and D20 straightforward.
- Toddlers don't pick days. They count as attending the days an 18+ in their booking attends. That is how the toddler dinner (D12) and the "needs a grown-up" rule (D5) check out.
- A promo code that runs out between review and payment no longer fails the booking (D15).
- Opening a booking page also releases an expired hold, so an unpaid booking shows as expired instead of "held".

## How the important parts work

- **Price.** The browser never sends prices. The server reads its own catalog and runs a pricing pipeline (`src/domain/pricing/`), one small step per rule, all in integer cents.
- **Rules.** Every request is checked on the server (`src/domain/eligibility/`), whatever the page sends. Rules read product codes and settings stored as data, never display names, so renaming a ticket can't break a rule.
- **Stock.** In one Postgres transaction, the server takes the promo use and then reduces each stock pool with `UPDATE … WHERE remaining >= qty`, always in the same order. If any pool is short, the whole thing rolls back. A database check also stops `remaining` ever going below zero. Two people booking the last two Garba places at the same moment can't both succeed; an integration test runs six buyers at once and checks that exactly one wins.
- **Layers.** UI → API routes (thin) → use-cases → domain (pure TypeScript, no I/O) → repositories. ESLint (and so CI) fails if a layer imports one it shouldn't.

## Tests

- `pnpm test`: 239 unit tests. They cover money, age bands, eligibility, every promo code, the pricing steps, the booking reducer, error messages and colour contrast.
- `pnpm test:integration`: 22 tests against a real Postgres database. They cover stock races, promo limits under concurrency, idempotent replays, hold expiry, tampered requests and the HTTP error format.

CI runs both on every push (`.github/workflows/ci.yml`).

## Not finished

- Payment is simulated. Stripe test mode was optional and I didn't get to it. The payment code sits behind an interface, so Stripe would be one new adapter plus a webhook route.
- No browser end-to-end tests (Playwright). I checked the UI flows by hand, on a phone-sized screen and on desktop.
- "Sold out" labels don't update on a page that is already open. They catch up on the next stock conflict or refresh.
- Day passes don't warn about low stock before you pick days. You find out when you pick them.
- The Review step lists people from the price lines, so an under-5 with no extras isn't shown there. The confirmation lists everyone.
- No emails. Paying writes an "outbox" row for a future email worker; for now the confirmation page and its private link are the confirmation.
- No admin screens. Prices, stock and codes come from the seed script.
- A note on my git history: DESIGN.md was written before the domain code, but I committed it after the project setup commit, not as the very first commit. Some commits are also bigger than I'd like.

## Running ten festivals

Most of this is already shaped for it. Every product, stock pool, promo code and day belongs to an event. The home page lists events from the database, and nothing in the code names this festival or its dates. Prices, which age band each product is for, per-booking limits and sales cut-offs are data.

What I'd change:

- Move the age limits (5, 12, 18) and the 15-minute hold out of code constants and into each event's settings.
- Let each event choose its pricing steps (for example `event.pricingSteps = ["kids_free", "family_cap"]`). A new committee rule then ships once as a step and is switched on only where it's wanted.
- Add an admin area for products, stock and promo codes, plus a check-in screen that scans the QR code.
- Add per-organisation branding, and rate limiting on the booking endpoints before a big launch.
