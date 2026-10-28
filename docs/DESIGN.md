# Design Note — Sharad Utsav 2026 Booking

*Written before coding. I won't rewrite this later, so any difference from the final code shows where my plan changed. The detailed engineering plan is in [docs/SPEC.md](docs/SPEC.md).*

---

## What I'm building

A single booking page where a family can say who is coming, pick their days and passes, add extras, use a promo code, pay, and get a confirmation they can show at the door.

The screens are the easy part. The hard part is making sure **the amount charged is always correct** and **we never sell more than we have**, whatever the person clicks or tampers with.

---

## How I'm modelling things

**People come first, tickets belong to people.**
Each person in the group is one record, and each person carries exactly one ticket. Adding a person adds a ticket slot. Removing a person removes their ticket. So the number of people and the number of tickets can never drift apart.

**Age comes from date of birth, not a typed number.**
I ask for a date of birth and work out the age myself, as of the **first day of the festival (10 Nov)**. That gives one clear answer even if a child has a birthday during the festival, and it's harder to fudge than typing "7".

- Under 5 → free, no ticket (but we still record their name for the door)
- 5 to 11 → child ticket
- 12 and over → adult ticket
- The person paying must be 18 or over

**Tickets and extras are data, not code.**
Each item has a fixed internal code (like `DAY_ADULT`), a price, and a few settings: who it's for, which days, and whether it's per person or per day. Rules read those settings, never the display name, so renaming a ticket can't break anything.

**Money is whole cents.**
$15 is stored as `1500`. No decimals means no `$146.70000000000002`.

**Stock lives in a real database (Postgres).**
Vercel doesn't keep memory or files between requests, so stock has to live in a database to still be correct at 9pm after a 9am booking. When someone starts paying, I hold their items for 15 minutes. If they don't pay, the items go back on sale.

**The server decides everything that matters.**
The browser shows previews, but the server recalculates the price, re-checks ages and rules, and checks stock every time. It ignores any price the browser sends.

---

## The endpoints I plan to build

| What it does | Endpoint | Sends | Gets back |
| --- | --- | --- | --- |
| Show what's on sale | `GET /api/events/{slug}` | — | Days, tickets, extras, prices, and what's left |
| Price a booking (no commitment) | `POST /api/events/{slug}/quotes` | Who's coming + choices + promo code | Line-by-line price, discount, total, helpful hints |
| Start a booking and hold stock | `POST /api/bookings` | Same as above + a unique key | Booking ID, final amount, hold expiry time |
| Pay (simulated) | `POST /api/bookings/{id}/pay` | Succeed / decline + a unique key | Confirmed booking with confirmation code |
| View confirmation | `GET /api/bookings/{id}` | Private link token | Full booking details |

The **unique key** on create and pay means a double-click or a retry after a dropped connection returns the same result instead of creating a second booking.

Errors come back with a short machine code (like `AGE_BAND_MISMATCH`) plus a friendly message, so the page can point at the exact field that's wrong.

---

## Tricky cases I've spotted so far

The brief leaves these open. Here's what I plan to do about each:

1. **Birthday during the festival.** Age is fixed as of 10 Nov for everyone.
2. **Adult wants all 5 days, but the adult All-Day Pass is sold out.** They can buy 5 day passes ($75). I'll say clearly that it costs more than the sold-out pass would have.
3. **Child picks 5 day passes ($40) when the child All-Day Pass is $30.** I'll show a "save $10" hint with a one-click switch, but I won't change it silently.
4. **Family Pass for a family that isn't exactly 2 adults + 2 children.** Allowed with 1–2 adults and up to 2 children. If separate tickets would be cheaper, I'll show a hint.
5. **Young children with no grown-up.** Any day with an under-12 attending needs someone aged 18 or over in the same booking that day.
6. **The person paying isn't coming** (e.g. booking for their parents). There's an "I'm attending" tick box. They're only charged a ticket if they tick it.
7. **$20 off on a booking under $20.** The discount stops at $0. A free booking skips payment but still uses up stock.
8. **KIDSFREE with no children, or with a Family Pass.** It only frees child day and all-day passes. If there are none, I explain why it didn't apply.
9. **Two people grab the last 2 workshop places at the same moment.** The database only lets one of them succeed. The other gets a clear "sold out" message.
10. **Is "380 day passes" 380 people or 380 person-days?** I'm treating it as 380 person-days, since the price is per day.
11. **Booking a day that has already passed.** Past days are hidden. Days stay bookable until 6pm on the day.
12. **Someone walks away at the payment step.** Their held items go back on sale after 15 minutes.
13. **Price or stock changes between preview and payment.** The amount shown just before paying comes from the server at that moment, and that's what is charged.
14. **Nonsense ages and attempts to pay less.** Future dates, impossible dates, and adult tickets for a 7-year-old are all rejected on the server, not just in the page.
15. **A family wants the Family Pass on two different days.** That's allowed. It's simply two Family Passes, one per day, at $40 each.

---

## What I'm deliberately not doing (and why)

- **No logins.** Families shouldn't need an account to book. The confirmation is reached through a private link.
- **No admin screens.** Prices, stock, and promo codes are loaded by a setup script for now.
- **No real emails.** The confirmation page does the job. Email can be added later.
- **No refunds or edits after payment.** Out of scope, but prices are saved per line so this can be added later.
- **No real Stripe at first.** I'll start with a simulated payment and add Stripe test mode only if there's time.
- **No taxes or booking fees.** None were mentioned.

---

## Built to grow

Everything belongs to an *event*, and the rules live in settings rather than being scattered through the screens. Running next year's festival, or ten festivals with different rules, should mostly mean adding data, plus the occasional small new rule file. That shouldn't need a rewrite.
