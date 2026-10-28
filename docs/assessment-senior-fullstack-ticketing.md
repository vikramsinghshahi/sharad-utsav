# Senior Full-Stack Developer — Take-Home Exercise

**Role:** Senior Full-Stack Developer (Next.js + Node)
**Time:** 4 days from the day you receive this. Please spend around 10–14 hours of real work — the 4 days are so you can fit it around your current job, not because it needs 4 full days.
**Submit:** a short design note, a live Vercel URL, a GitHub repo, and a 3–5 minute recording.

---

## A note on AI tools, first

You are very welcome to use AI tools, and we assume you will. We use them ourselves every day.

We have written this as a **description of a problem, not as a specification**. That is deliberate. We have left out the API shapes, the field names, the error messages, and the list of edge cases — not because we forgot, but because working those out **is** the exercise. What we want to see is your judgement: the decisions you make, the trade-offs you weigh, and the things you notice that we never told you about.

Two parts of this process are built around that:

1. **Before you write code**, we ask for a short design note in your own words (section 8).
2. **In the interview**, we will ask you to add a new rule to your own codebase, live, on your machine, in about 30 minutes.

So please do use AI to move faster — but stay in the driving seat, and make sure you could explain and change any line of it. That second session is much more enjoyable for everyone when the code is genuinely yours.

We would much rather see something clean and partly finished than something complete that neither of us can follow. Please read this whole document before you start.

---

## 1. The problem

Our temple runs a large multi-day festival every year. A few thousand people attend. Today, booking is a mess of spreadsheets and WhatsApp messages, and the volunteers on the door have no reliable list of who paid for what.

We want a page where a family can book their tickets for the festival in one go, pay, and receive a confirmation. It has to handle the awkward reality of how families actually attend: some come for one evening, some for the whole festival, children are priced differently from adults, toddlers come free, and there are extras like meals and workshops that only apply on certain days.

The hard part of this problem is not the screens. It is the **rules** — and making sure the amount charged is always correct, no matter what the person clicks.

---

## 2. The event

| Field          | Value                                          |
| -------------- | ---------------------------------------------- |
| Event name     | Sharad Utsav 2026                              |
| Location       | Radha Krishna Temple, Allen, Texas             |
| Festival dates | **Tue 10 Nov 2026 → Sat 14 Nov 2026** (5 days) |
| Currency       | USD only                                       |

### Colour theme

This is the only design direction we are giving you. These are our real brand colours — please use them so the page feels like it belongs to us. Everything else about the layout, the flow, and the wording is your call.

| Token          | Hex       | Where we normally use it                              |
| -------------- | --------- | ----------------------------------------------------- |
| `primaryDark`  | `#2C2C2C` | Main page background (our booking pages are dark)     |
| `primary`      | `#C99B24` | Primary buttons, selected states, highlights          |
| `gold`         | `#BC9226` | Borders, icons, accents                               |
| `brightGold`   | `#D1AC3E` | Hover states on gold elements                         |
| `cream`        | `#FDF3E4` | Light panels and cards sitting on the dark background |
| `heading`      | `#291900` | Headings on a light background                        |
| `primary-text` | `#645743` | Body text on a light background                       |
| `white`        | `#FFFFFF` | Body text on the dark background                      |
| `success`      | `#28A736` | Confirmation messages                                 |
| `error`        | `#EF1F1F` | Validation and error messages                         |

A few notes:

- On the dark background we usually build cards from translucent white — roughly a `rgba(255,255,255,0.05)` fill with a `rgba(255,255,255,0.2)` border — rather than solid boxes.
- A serif for headings and a clean sans-serif for body text is our usual pairing. Any good serif is fine; you do not need our licensed fonts.
- Please do check your colour contrast. Gold on dark can look lovely and still be hard to read.

---

## 3. What can be bought

### Entry tickets — a person buys exactly one kind

| Ticket               | Price                   | Who it is for                  | Which days                         |
| -------------------- | ----------------------- | ------------------------------ | ---------------------------------- |
| Day Pass – Adult     | $15 per person, per day | Ages 12 and above              | Any day or days the person chooses |
| Day Pass – Child     | $8 per person, per day  | Ages 5 to 11                   | Any day or days the person chooses |
| All-Day Pass – Adult | $60 flat                | Ages 12 and above              | All 5 days. Cannot be changed.     |
| All-Day Pass – Child | $30 flat                | Ages 5 to 11                   | All 5 days. Cannot be changed.     |
| Family Pass          | $40 flat                | Covers 2 adults and 2 children | One single day                     |

### Extras

| Extra                 | Price    | Notes                                |
| --------------------- | -------- | ------------------------------------ |
| Dandiya Sticks (pair) | $5 each  | A souvenir. Any reasonable quantity. |
| Dinner Plate          | $12      | Priced **per person, per day**       |
| Garba Workshop        | $20 each | Runs on **Nov 11 and Nov 13 only**   |

### How much of each we have left

Your system needs to know its own stock and must never sell more than it has.

| Item                 | Remaining        |
| -------------------- | ---------------- |
| Day Pass – Adult     | 380              |
| Day Pass – Child     | 260              |
| All-Day Pass – Adult | **0 — sold out** |
| All-Day Pass – Child | 140              |
| Family Pass          | 95               |
| Dandiya Sticks       | 900              |
| Dinner Plate         | 1700             |
| Garba Workshop       | **2**            |

Two of those numbers are low or zero on purpose. Please make sure the page behaves sensibly in both cases.

### Promo codes

Your system should accept these five codes and behave differently for each. Work out the sensible behaviour and the sensible message for each one yourself.

| Code       | What it is                                                          |
| ---------- | ------------------------------------------------------------------- |
| `SEVA10`   | 10% off the whole booking                                           |
| `FLAT20`   | $20 off the whole booking                                           |
| `KIDSFREE` | Makes child tickets free. Adult tickets are unaffected.             |
| `EXPIRED5` | A valid code that expired last month                                |
| `MAXEDOUT` | A valid code that has already been used its maximum number of times |

Anything else the person types is not a real code.

---

## 4. Who is coming

A booking is made by one person, on behalf of a group.

- We need enough detail about the **person booking** to contact them and to send their confirmation.
- We need enough detail about **everyone else in the group** for the volunteers on the door to check them in.
- The details we need for a child are not the same as the details we need for an adult. Think about which fields genuinely make sense for a nine-year-old.

The number of people we collect details for must always match the number of tickets being bought, and it must stay matched as the person changes their mind — which they will, several times, before they pay.

---

## 5. Age rules

Age drives the pricing, so it needs to be right.

| Age                    | Rule                                                |
| ---------------------- | --------------------------------------------------- |
| **Under 5**            | Free. No ticket needed at all.                      |
| **5 to 11**            | Child. Must be on a child ticket.                   |
| **12 and above**       | Adult. Must be on an adult ticket.                  |
| **The person booking** | Must be 18 or above, since they are the one paying. |

That table is the whole of what we are telling you. The wording of the messages, where you check, how you stop someone from buying an adult ticket for a seven-year-old, and what you do about anything the table does not cover — all of that is yours to decide.

Please assume people will type nonsense into an age field, and that some of them will be actively trying to get in cheaply.

---

## 6. What you are building

A working booking flow, front to back, deployed and usable by a stranger on a phone.

### The front end

A page that takes someone from "I want to come to the festival" to "here is my confirmation", handling every rule above. How you break that into steps or sections is entirely your choice.

### The back end

**You own the API.** We are not giving you endpoints or payload shapes — designing them is part of what we are assessing. Build whatever the front end needs, as Next.js route handlers or as a small separate service, whichever you prefer.

Whatever you build, please make sure of these four things:

1. **The server decides the price.** Prices, discounts, and the final amount are calculated on the server from the server's own data. Assume someone will open dev tools and edit whatever the browser sends.
2. **The server re-checks the rules.** Every rule in sections 3, 4 and 5 must hold even if the request arrives from something other than your own page.
3. **Stock is real.** A completed booking reduces what is available, and that reduction survives. Two people booking the last two workshop places at the same moment must not both succeed.
4. **The contract is documented.** A short table of your endpoints and their shapes in the README is fine. We want to see that you can define an interface, not just consume one.

A database is not required, but see section 7 rule 6 before you decide how to store things.

### Payment

Take the amount from your own server and show a payment step. A simulated payment is perfectly acceptable — a real Stripe **test mode** payment is a nice extra if you have the time. Never commit real keys.

---

## 7. Deploying it (please read)

We are not able to provide a test environment, a server, or hosting for this exercise, so we would ask you to deploy it on your own **Vercel** account and share the live link. Vercel's free plan is all you need, and a free database from Neon, Supabase, or Upstash is plenty if you want one.

```bash
pnpm add -g vercel@latest    # or: npm i -g vercel@latest
vercel login                 # opens your browser; free account is fine
vercel                       # link the project, deploy a preview
vercel --prod                # deploy to production
```

That last command prints a URL like `https://your-project.vercel.app`. That is the link to send us. Importing the repo at [vercel.com/new](https://vercel.com/new) works just as well if you prefer.

1. Please send the **production** URL, not a preview one that will expire.
2. Please make sure it opens with **no login and no password prompt**, or send us the password.
3. Please check the build passed **on Vercel**. A local `pnpm build` can succeed while the Vercel build fails, so it is worth a look at the build logs.
4. Any environment variable your app needs must also be set in the Vercel dashboard, under Project → Settings → Environment Variables. Otherwise the live site will break while your local one works.
5. Please don't commit secrets. Keep `.env*` in `.gitignore`.
6. **Your data layer has to work in production, not just locally.** Vercel runs your API as serverless functions. Think about what that means for wherever you decide to keep your stock counts, and satisfy yourself that a booking made at 9am is still reflected at 9pm.
7. Please keep the deployment live until your interview is complete, so we can refer back to it.
8. If you run into trouble deploying, do get in touch — we are happy to help.

We look at everything on the deployed site, since that is what we are able to open. A quick pass over the live version before you send it is time well spent.

---

## 8. Things we have left open on purpose

This brief is **deliberately incomplete**. There are at least four situations that a real family could easily walk into, and that we have simply not told you what to do about. Some of them change what a person gets charged.

We are not going to tell you what they are. Finding them is the exercise.

When you find one:

- decide what you think the right answer is,
- build that,
- and write it down in your README under **"Decisions I made"**, with a line on why.

We are far more interested in the questions you find than in whether you happened to guess the same answer we would have chosen. If you find something and decide to leave it unhandled for now, say so — that is a perfectly good answer, clearly stated.

Please do not email us for the answers. Deciding under uncertainty is the job.

---

## 9. What to submit

**1. A design note, written before you start coding.** One page, in your own words, plain text or markdown. We would like:

- how you are modelling tickets, people, dates, and prices, and why
- the endpoints you intend to build, and their shapes
- the tricky cases you have spotted so far
- what you have decided **not** to do, and why

Please commit this as `DESIGN.md` at the start, and do not rewrite it afterwards to match what you ended up building. We like seeing where a plan changed — that is normal engineering, and the gap between your note and your final code is genuinely interesting to us.

**2. The GitHub repo** — public, or private with `aditirkt` invited. Please commit as you work, in normal small steps. A single commit containing the finished project tells us nothing about how you work, and we would rather see the real history, mess included.

**3. Your live Vercel production URL**, and the same URL at the top of your README.

**4. Your README**, covering: how to run it locally, the environment variables you set on Vercel and what each is for, your API contract, your **"Decisions I made"** section from section 8, and anything unfinished — stated plainly. Unfinished work honestly described reads far better than unfinished work quietly omitted.

**5. Your own list of edge cases**, in `TEST-CASES.md` — the situations you thought were worth checking, and what your app does in each. We deliberately have not given you a list. Which cases you thought of, and which you missed, tells us a great deal.

**6. Tests** for the parts where being wrong costs money: the price calculation and the age rules. Vitest or Jest. We are not looking for full coverage, just that the risky logic is pinned down.

**7. A 3–5 minute recording** walking us through the flow **on your deployed site**, including a few of the ways it can go wrong.

---

## 10. What we will be looking at

Roughly in order of what matters most to us:

| Area                | What we hope to see                                                                                |
| ------------------- | -------------------------------------------------------------------------------------------------- |
| Judgement           | The cases you found on your own, and whether your decisions are sound and clearly explained        |
| Correctness         | The maths is right, every time, whatever the person clicks                                         |
| Trusting the server | Prices, ages, stock and promo codes all decided server-side, never taken on trust from the browser |
| Code structure      | Small, focused files. Business rules kept out of the UI. Names that explain themselves.            |
| Your API design     | Shapes that make sense, named well, documented                                                     |
| TypeScript          | Types that model the domain and rule out impossible states. No `any`, no unsafe casts.             |
| Edges and failures  | Loading, empty, sold out, network loss, someone clicking Pay twice                                 |
| Tests               | The money and the age rules pinned down, and passing                                               |
| Care for the user   | Comfortable on a phone, usable with a keyboard, error messages that help rather than scold         |

### A few things we would gently steer you away from

- The browser calculating the final amount and the server accepting it.
- Business rules that depend on matching text in a name or a label. If a rule can be broken by an admin renaming a ticket, it is not really a rule.
- One large component holding all of the state.
- Money handled so that a total can come out as `$146.70000000000002`.
- Validation that exists only in the UI.

### Things we would be delighted to see, if you have the time

- A clear state machine or reducer for the booking flow, rather than many `useState` calls
- Money handled in integer cents
- A real Stripe test-mode payment
- Protection against a double-click creating two bookings
- Proper safety around the stock decrement when two people book at once
- A note on what you would change if this had to run ten different festivals with ten different rule sets

---

## 11. The interview

About 60 minutes, on a call, screen shared.

- **Roughly 30 minutes:** we will give you **one new rule** for the festival and ask you to add it to your own codebase while we watch. Nothing exotic, and nothing you could not do — it is the kind of change we get from our committee two weeks before every event. You will have your own editor, your own tools, and your usual AI assistant if you want it. We are not testing recall; we want to see how you work and how well you know your own code.
- **The rest:** we will walk through your design note, ask why you chose what you chose, and talk about what you would do differently with more time.

There is no trick here. If you built it, you will be fine.

---

## 12. Ground rules

- **Deadline:** 5 days from the day you receive this. If life gets in the way and you need a little longer, just let us know — we would much rather hear from you than have you rush it.
- **You provide your own environment.** We do not supply a server, hosting, a database, a Stripe account, or credentials. Everything you need has a free tier.
- **AI tools are welcome.** See the note at the top. The only thing we ask is that the code is genuinely yours by the time you send it.
- **Where this brief is unclear, decide and document.** See section 8. Please don't wait on us.

Good luck — we hope you enjoy it. We are far more interested in how you think about the rules than in how pretty the page ends up looking.
