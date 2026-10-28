# Sharad Utsav 2026 — Tickets

Festival booking app for Sharad Utsav 2026 (Radha Krishna Temple, Allen, Texas). See [docs/SPEC.md](docs/SPEC.md) for the design.

> Status: domain rules, the booking API and the booking UI are built and tested. Not yet deployed. See [TEST-CASES.md](TEST-CASES.md) for what is checked and how.

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
