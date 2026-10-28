# Test cases

The situations I thought were worth checking, what the app does in each, where that is enforced, and the test that pins it down.

- **Where enforced** names the layer: `domain` (pure rules, `src/domain`), `application` (use-cases), `db` (Postgres constraint or transaction), `API` (route handlers), `UI` (`src/features`). Every rule is enforced on the server; the UI only mirrors rules so people see problems early.
- **Test**: `unit` tests run with `pnpm test`; `integration` tests run against a real Postgres with `pnpm test:integration`. Paths are under `tests/`.
- Decision numbers (D1–D21) refer to "Decisions I made" in the README and `docs/SPEC.md` §6.

## Money

| Situation                                                 | Expected behaviour                                                                | Where enforced                                  | Test                                                                 |
| --------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------- |
| Any total                                                 | Integer cents only; a float, negative or unsafe number throws                     | domain `money.ts`                               | unit `domain/money.test.ts`                                          |
| 10% of $146.70                                            | $14.67, rounded half-up once at booking level                                     | domain `percentOf`                              | unit `domain/money.test.ts`                                          |
| A discount split across lines (e.g. $20 off $15 + $8)     | Largest-remainder split: $13.04 + $6.96, lines always add up to the total exactly | domain `allocate`                               | unit `domain/money.test.ts`, `domain/pricing.test.ts`                |
| Total would go below $0                                   | Impossible: discounts are capped, and a negative result throws                    | domain `subtractCents`, pipeline                | unit `domain/money.test.ts`                                          |
| Client sends `totalCents`, `priceCents`, `unitPriceCents` | Ignored; the server prices from its own catalog                                   | API schema strips unknown fields; domain prices | integration `api.test.ts` ("ignores any price…")                     |
| Every quote, every promo × a mixed booking                | Lines sum to the total; each line = qty × unit − discount, never negative         | domain pricing pipeline; db CHECK constraints   | unit `domain/pricing.test.ts` ("totals stay consistent…")            |
| Money shown on screen                                     | Formatted in the event's own currency, never a hard-coded `$`                     | UI `useMoney`, contracts `formatMoney`          | unit `contracts/messages.test.ts`, `features/booking/format.test.ts` |

## Ages (§5.1)

| Situation                                                            | Expected behaviour                                                                                             | Where enforced                      | Test                                                                    |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------- |
| Age is measured                                                      | On the festival's first day, in the event timezone (D1)                                                        | domain `ageOn`, eligibility context | unit `domain/age.test.ts`                                               |
| Child turns 12 during the festival                                   | Still a child for the whole festival (D1)                                                                      | domain                              | unit `domain/age.test.ts`, `domain/eligibility.test.ts`                 |
| Birthday on 9 / 10 / 11 Nov                                          | Counted correctly on each side of the reference date                                                           | domain                              | unit `domain/age.test.ts`                                               |
| Born 29 Feb                                                          | Birthday counts from 1 Mar in non-leap years                                                                   | domain                              | unit `domain/age.test.ts`                                               |
| Ages 4/5, 11/12, 17/18                                               | Infant/child, child/adult, and the 18+ boundary are exact                                                      | domain `ageBand`                    | unit `domain/age.test.ts`                                               |
| Date of birth "seven", "12/04/1988", 2026-02-30, in the future, 1800 | Rejected as `INVALID_DOB` with a reason                                                                        | domain `parseDateOfBirth`           | unit `domain/age.test.ts`, `domain/eligibility.test.ts`                 |
| Adult ticket for a 7-year-old                                        | Rejected `AGE_BAND_MISMATCH`; the UI never offers it                                                           | domain; UI filters by band          | unit `domain/eligibility.test.ts`; integration `api.test.ts` (422 path) |
| Child ticket for a 13-year-old                                       | Rejected `AGE_BAND_MISMATCH`                                                                                   | domain                              | unit `domain/eligibility.test.ts`                                       |
| Ticket for an under-5                                                | Rejected `INFANT_MUST_NOT_HAVE_TICKET`; under-5s are free and recorded for the door                            | domain                              | unit `domain/eligibility.test.ts`                                       |
| Anyone 5+ with no ticket                                             | Rejected `ENTRY_REQUIRED`                                                                                      | domain                              | unit `domain/eligibility.test.ts`                                       |
| Person paying is 17 today but 18 by the festival                     | Rejected `BOOKER_UNDER_18`: they pay today                                                                     | domain `checkBookerAge`             | unit `domain/age.test.ts`, `domain/eligibility.test.ts`                 |
| Changing a date of birth so the age band changes                     | The ticket that no longer fits is removed, with a notice saying why; the notice clears if the change is undone | UI reducer                          | unit `features/booking/reducer.test.ts`                                 |

## Days and passes (§5.2)

| Situation                                                                            | Expected behaviour                                                                       | Where enforced                              | Test                                                            |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------- |
| Day pass with no days, a repeated day, a day outside the festival, or a garbage date | `INVALID_DAYS` with the reason; the message names the festival's real first and last day | domain `validateDates`; contracts messages  | unit `domain/eligibility.test.ts`, `contracts/messages.test.ts` |
| Booking today's day before / after 6 pm local                                        | Allowed before the cutoff, `DAY_NOT_ON_SALE` from 6 pm (D9)                              | domain `sales-window.ts`                    | unit `domain/eligibility.test.ts`                               |
| Booking a day that has passed                                                        | `DAY_NOT_ON_SALE`; past days are disabled in the UI                                      | domain; UI from catalog `onSale`            | unit `domain/eligibility.test.ts`                               |
| All-day pass once day one has begun                                                  | `DAY_NOT_ON_SALE` (D9)                                                                   | domain                                      | unit `domain/eligibility.test.ts`                               |
| Unknown, inactive, or wrong-kind product id                                          | `PRODUCT_UNAVAILABLE`                                                                    | domain `resolveProduct`                     | unit `domain/eligibility.test.ts`                               |
| Product renamed by an admin                                                          | Nothing changes: rules read `rule` fields, never names                                   | domain, UI select by `rule`                 | unit (all eligibility/pricing tests use rule-based fixtures)    |
| Adult wants all 5 days, adult all-day pass sold out                                  | 5 day passes at $75, with a notice that the all-day pass is sold out (D2)                | domain pricing step `suggest-all-days-pass` | unit `domain/pricing.test.ts`                                   |
| Child on 5 day passes ($40) when the child all-day pass is $30                       | Hint "save $10" with a one-click switch; never switched silently (D4)                    | domain pricing step                         | unit `domain/pricing.test.ts`                                   |
| Same, but KIDSFREE already makes child days free                                     | No bogus hint                                                                            | domain (hints use post-promo prices)        | unit `domain/pricing.test.ts`                                   |
| Family pass for 2 adults + 2 children                                                | Allowed, $40 for one day                                                                 | domain                                      | unit `domain/eligibility.test.ts`, `domain/pricing.test.ts`     |
| Family pass for 2 adults + 1 child                                                   | Allowed; hint that day passes are $2 cheaper (D3)                                        | domain                                      | unit `domain/pricing.test.ts`                                   |
| Family pass with 3 adults, 3 children, or no adult                                   | `FAMILY_PASS_COMPOSITION`                                                                | domain                                      | unit `domain/eligibility.test.ts`                               |
| Family pass on two different days                                                    | Two passes, $40 each; the same people can be in both (D20)                               | domain                                      | unit `domain/eligibility.test.ts`, `domain/pricing.test.ts`     |
| Same person in two family passes on one day                                          | Rejected `two_passes_same_day`                                                           | domain                                      | unit `domain/eligibility.test.ts`                               |
| Family pass chosen for a person                                                      | They are put on a pass straight away (no second tick)                                    | UI reducer                                  | unit `features/booking/reducer.test.ts`                         |
| Family pass stored                                                                   | Groups and members saved; the pass line links to its group                               | db                                          | integration `booking-flow.test.ts`                              |

## The group (§5.2, D5–D7, D18)

| Situation                                    | Expected behaviour                                        | Where enforced                         | Test                                       |
| -------------------------------------------- | --------------------------------------------------------- | -------------------------------------- | ------------------------------------------ |
| Only under-5s in the booking                 | `EMPTY_BOOKING` (D5)                                      | domain `attendance.ts`                 | unit `domain/eligibility.test.ts`          |
| A 7-year-old whose only companion is 13      | `CHILD_UNACCOMPANIED`: responsibility starts at 18 (D6)   | domain                                 | unit `domain/eligibility.test.ts`          |
| A child on a day no 18+ in the group attends | `CHILD_UNACCOMPANIED`, naming the days                    | domain                                 | unit `domain/eligibility.test.ts`          |
| Infant with an adult                         | Allowed; the infant attends the days the 18+ attends (D5) | domain                                 | unit `domain/eligibility.test.ts`          |
| 21 people                                    | `GROUP_TOO_LARGE`, larger groups contact the organisers   | domain                                 | unit `domain/eligibility.test.ts`          |
| Same name and date of birth twice            | Warning only (twins exist) (D18)                          | domain                                 | unit `domain/eligibility.test.ts`          |
| Person paying isn't attending                | No ticket for them unless they tick "I'm attending" (D7)  | UI; booker has no entry in the request | unit `features/booking/to-request.test.ts` |
| Removing a person                            | Their ticket, family-pass place and extras go with them   | UI reducer                             | unit `features/booking/reducer.test.ts`    |

## Extras (§5.3)

| Situation                                          | Expected behaviour                                              | Where enforced             | Test                                    |
| -------------------------------------------------- | --------------------------------------------------------------- | -------------------------- | --------------------------------------- |
| Dinner on a day the person doesn't attend          | `EXTRA_REQUIRES_ENTRY`                                          | domain `extras.ts`         | unit `domain/eligibility.test.ts`       |
| Dinner for an under-5 on a day their adult attends | Allowed, full price (D12)                                       | domain (infant attendance) | unit `domain/eligibility.test.ts`       |
| Garba on 12 Nov                                    | `EXTRA_DAY_NOT_ALLOWED`: it runs only on the days in its `rule` | domain                     | unit `domain/eligibility.test.ts`       |
| Garba for an under-5                               | `EXTRA_AGE_NOT_ALLOWED` (D14)                                   | domain (`rule.minAgeBand`) | unit `domain/eligibility.test.ts`       |
| Dandiya 21, or 15 + 10 on two lines                | `QUANTITY_OUT_OF_RANGE` (limit from `rule.maxPerBooking`)       | domain                     | unit `domain/eligibility.test.ts`       |
| Dandiya 0 or 1.5                                   | `INVALID_QUANTITY`                                              | domain                     | unit `domain/eligibility.test.ts`       |
| Same extra twice for one person on one day         | `INVALID_DAYS` (duplicate)                                      | domain                     | unit `domain/eligibility.test.ts`       |
| Removing a day from a day pass                     | That person's extras on that day are removed too                | UI reducer                 | unit `features/booking/reducer.test.ts` |

## Promo codes (§5.5)

| Situation                                    | Expected behaviour                                                                 | Where enforced                           | Test                                                   |
| -------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------ |
| " seva10 "                                   | Matched case-insensitively and trimmed; 10% off                                    | domain `evaluatePromo`; db `citext`      | unit `domain/promo.test.ts`, `domain/pricing.test.ts`  |
| FLAT20 on a $15 booking                      | Discount capped at $15; total $0 (D10)                                             | domain pricing step                      | unit `domain/pricing.test.ts`                          |
| A $0 booking                                 | Confirmed straight away, no payment, still uses stock (D10)                        | application `create-booking`             | integration `booking-flow.test.ts`                     |
| KIDSFREE                                     | Child day and all-day passes free; adults, family pass and extras unaffected (D11) | domain pricing step                      | unit `domain/pricing.test.ts`                          |
| KIDSFREE with no children                    | Not applied, with the reason "no child tickets"                                    | domain                                   | unit `domain/pricing.test.ts`                          |
| EXPIRED5                                     | "Expired" with its end date; ignored, never blocks                                 | domain                                   | unit `domain/promo.test.ts`, `domain/pricing.test.ts`  |
| A code on its last valid day, in Texas       | Valid all day in the event timezone, not UTC (D21)                                 | domain                                   | unit `domain/promo.test.ts`, `domain/calendar.test.ts` |
| MAXEDOUT                                     | "Usage limit reached"; ignored                                                     | domain                                   | unit `domain/promo.test.ts`                            |
| Unknown code                                 | "We don't recognise that code"; ignored                                            | domain                                   | unit `domain/promo.test.ts`                            |
| A code with one use left, 4 bookings at once | Applied to exactly one; the others book at full price, shown as exhausted (D15)    | db atomic counter + application re-price | integration `booking-flow.test.ts`                     |

## Stock and holds (§5.4, §8)

| Situation                                   | Expected behaviour                                                                                      | Where enforced                                                                         | Test                                              |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Six people race for the last 2 Garba places | Exactly one wins; nothing oversold; the losers' other items roll back                                   | db conditional `UPDATE … WHERE remaining >= qty` in one transaction, pools in id order | integration `booking-flow.test.ts`                |
| A sold-out item                             | 409 `SOLD_OUT` naming the product (with `productId` and `remaining` in `params`); nothing held          | domain `findShortage`; db; API                                                         | integration `booking-flow.test.ts`, `api.test.ts` |
| An extra sells out mid-booking              | The UI names it, links to the right field, offers "Remove … for Ravi", and never blocks the way forward | UI `stock-issues.ts`, `step-checks.ts`                                                 | unit `features/booking/to-request.test.ts`        |
| Stock shown in the UI is stale              | The server's reported figure wins                                                                       | UI                                                                                     | unit `features/booking/to-request.test.ts`        |
| Remaining stock can never go below 0        | Even a bug can't oversell                                                                               | db `CHECK (remaining >= 0)`                                                            | manual SQL check (see "By hand")                  |
| Unpaid hold after 15 minutes                | Booking expires; stock and the promo use come back; paying returns 410                                  | application + db; lazy on every request and a daily cron (D16)                         | integration `booking-flow.test.ts`                |
| Releasing an expired hold twice             | Nothing happens the second time                                                                         | db guarded `WHERE status = …`                                                          | integration `booking-flow.test.ts`                |
| Paid stock and very late cleanup            | Committed holds are never released                                                                      | db `committed_at`                                                                      | integration `booking-flow.test.ts`                |
| Re-running the seed against live data       | Sold stock and promo uses are not reset                                                                 | db seed (insert-if-missing)                                                            | manual (see "By hand")                            |

## Payment and confirmation

| Situation                                                                | Expected behaviour                                                   | Where enforced                                   | Test                                              |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------- |
| Card declined                                                            | 402; the hold stays; a retry can succeed                             | application `pay-booking`                        | integration `booking-flow.test.ts`, `api.test.ts` |
| Paying an already-confirmed booking                                      | Same confirmation code, no second confirmation                       | application                                      | integration `booking-flow.test.ts`                |
| Double-click on "Continue to payment" / retry after a dropped connection | Same `Idempotency-Key` → original response, one booking (D17)        | API `idempotent()` + db key lock                 | integration `api.test.ts`                         |
| Five simultaneous requests with one key                                  | One booking                                                          | db insert-as-lock                                | integration `api.test.ts`                         |
| Same key, different body                                                 | 409 `IDEMPOTENCY_KEY_REUSED`                                         | API                                              | integration `api.test.ts`                         |
| Missing or non-UUID key                                                  | 400 `IDEMPOTENCY_KEY_REQUIRED`                                       | API                                              | integration `api.test.ts`                         |
| Pay key after a definite decline                                         | A new key per attempt (a replay would return the same decline)       | UI `use-checkout`                                | unit `features/booking/reducer.test.ts`           |
| Price changed between review and payment                                 | The amount from the server at create time is charged and shown (D15) | application re-prices; UI notice                 | integration `booking-flow.test.ts` (re-price)     |
| Confirmation link with the wrong token                                   | 404, same as an unknown booking (no leaking which ids exist)         | application `get-booking`, constant-time compare | integration `booking-flow.test.ts`                |
| Malformed booking id                                                     | 404                                                                  | API                                              | integration `api.test.ts`                         |

## Errors and the API contract

| Situation             | Expected behaviour                                                                                                 | Where enforced             | Test                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------- | ------------------------------------ |
| Malformed JSON        | 400 `INVALID_JSON`, `application/problem+json`                                                                     | API `readJson`             | manual curl (see "By hand")          |
| Wrong shape           | 400 `INVALID_REQUEST` with paths                                                                                   | API (Zod)                  | integration `api.test.ts`            |
| A rule fails          | 422 with `details[].path` pointing at the field and a friendly message                                             | API + contracts messages   | integration `api.test.ts`            |
| Messages              | Built from the issue's params and domain constants; no festival dates, ages or product names written into the copy | contracts `messages.ts`    | unit `contracts/messages.test.ts`    |
| Unexpected error      | 500 problem with a request id; details only in the logs                                                            | API `route()`              | manual                               |
| Environment variables | Missing or malformed `DATABASE_URL` fails at start with a readable message; never echoes the URL                   | lib `env.ts`               | unit `lib/env.test.ts`               |
| Local vs Neon         | The driver is picked from the URL only                                                                             | infrastructure `driver.ts` | unit `infrastructure/driver.test.ts` |

## Data, not code

| Situation                                        | Expected behaviour                                                                                                    | Where enforced                                  | Test                               |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------- |
| Landing page                                     | Lists events from `GET /api/events` (name, venue, dates, lowest price); a second festival appears with no code change | application `list-events`; UI `features/events` | integration `api.test.ts`          |
| An event's last day has passed (in its timezone) | It drops off the list                                                                                                 | application                                     | integration `booking-flow.test.ts` |
| Confirmation page                                | Event name, venue and "book again" link come from the booking                                                         | application `get-booking`                       | integration `api.test.ts`          |

## Accessibility and the phone

| Situation                         | Expected behaviour                                                                             | Where enforced                  | Test                       |
| --------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------- | -------------------------- |
| Every text/background colour pair | ≥ 4.5:1 (≥ 3:1 for borders, focus ring, icons); white text on gold is never used               | UI tokens in `globals.css`      | unit `ui/contrast.test.ts` |
| Keyboard only                     | Every control reachable, visible gold focus ring, focus moves to the step heading on each step | UI                              | manual (browser pass)      |
| Pressing "Next" with problems     | Error summary takes focus, every time; links focus the field                                   | UI `ErrorSummary`               | manual (browser pass)      |
| One-click fix                     | Focus moves to the fixed field (or the step heading if it's gone)                              | UI `ErrorSummary`               | manual (browser pass)      |
| Phone at 375 px                   | The sticky total bar never covers the focused control                                          | UI `scroll-padding`             | manual (browser pass)      |
| Offline                           | Banner shows; prices refresh by themselves when the connection returns                         | UI                              | manual (browser pass)      |
| Refresh mid-booking               | Draft restored from sessionStorage                                                             | UI `storage.ts` (Zod-validated) | manual (browser pass)      |
| Reduced motion                    | Animations off                                                                                 | UI CSS                          | manual                     |

## By hand

Checked once, not automated:

- `UPDATE inventory_pools SET remaining = remaining - 3 WHERE …garba…` is rejected by `inventory_pools_remaining_nonnegative`.
- Selling one Garba place, re-running `pnpm db:seed`, and checking the place stays sold.
- `curl -X POST …/quotes --data '{not json'` → 400 `INVALID_JSON` with `content-type: application/problem+json` and an `x-request-id` header.
- `GET /api/cron/expire-holds` without the secret → 401.

## Known gaps

- No browser end-to-end test (Playwright) yet; the UI flows above marked "manual" were checked by clicking through at 375×812 and 1440×900.
- A "Full" / "Sold out" label stays until the catalog is reloaded (a stock conflict or a page refresh); stock that comes back is not pushed to an open page.
- Day-pass options don't warn about low stock in advance; a shortage shows once days are picked (D8).
- Review's "Your booking" list is built from quote lines, so an under-5 with no extras isn't listed there (the confirmation lists everyone).
- One "Maximum update depth exceeded" error was seen once during early UI testing and could not be reproduced afterwards, including in targeted attempts. The likely causes were removed; if it reappears, the React owner stack is what to capture.
