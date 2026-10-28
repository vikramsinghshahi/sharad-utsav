# CLAUDE.md

Guidance for working in this repository.

## Current state (read first)

**The P0 skeleton exists. Domain logic, the booking API, and the UI do not yet.**

- `docs/SPEC.md` — the working engineering spec. **This is the source of truth** for architecture, rules, API, schema, and the delivery plan.
- `docs/assessment-senior-fullstack-ticketing.md` — the original brief.

Built so far:

```
src/
  app/                     # Next.js routes: page.tsx (placeholder), api/health/route.ts
  domain/                  # pure TS, no I/O: age.ts, booking.ts, catalog.ts, promo.ts
  infrastructure/db/       # schema.ts, client.ts (getDb, pingDatabase), driver.ts,
                           # seed.ts (logic), seed-data.ts (festival data), migrations/
  lib/                     # env.ts (getEnv, lazy + Zod), logger.ts (JSON logs)
scripts/                   # next-launch.mjs (port), db-migrate.ts, db-seed.ts, db-common.ts
tests/                     # mirrors src/: tests/<layer>/<file>.test.ts
```

Keep nesting shallow: one folder per layer, one file per concept. Add a sub-folder only when a concept has several files (e.g. `domain/pricing/steps/`).

Anything below marked _(planned)_ does not exist yet. **Before relying on a planned path, check that it exists**, and update this file as things get built.

## Database: local vs Neon

- **Only `DATABASE_URL` changes between environments.** `src/infrastructure/db/driver.ts` picks the driver from the host. `*.neon.tech` gets `drizzle-orm/neon-serverless` (WebSocket Pool, supports transactions). Anything else gets `drizzle-orm/node-postgres`. App code uses `getDb()` and never imports a driver directly.
- Local dev database: `sharad_utsav_dev` on Homebrew Postgres 15 (`localhost:5432`).
- Schema changes: edit `schema.ts`, run `pnpm db:generate`, review the SQL in `migrations/`, then run `pnpm db:migrate`. Never edit an applied migration; add a new one. `0000_enable_extensions.sql` is a hand-written custom migration that enables `citext`.
- To set up a remote database, point `DATABASE_URL` at it and run `pnpm db:setup`. The seed is idempotent and **never resets `remaining` stock or promo `redemptions`**.

## Project overview

Sharad Utsav 2026 is a festival ticket-booking app, built as a senior full-stack assessment. A family books in one flow: attendees (name + DOB) → passes per day → extras (Dinner, Garba workshop, Dandiya) → promo code → payment → confirmation with a QR code.

Invariants that must never break (SPEC §1):

1. **The server computes the price** in integer cents from its own data. Never trust client-sent prices or totals. The request schemas have no such fields.
2. **The server enforces every rule** (age, eligibility, days, promo) on every request.
3. **Stock is never oversold.** Decrement it atomically in Postgres with a conditional `UPDATE ... WHERE remaining >= qty`.

Everything is scoped to an **event**. Rules read structured product data (`code`, `rule`), **never display names**.

## Architecture _(planned, SPEC §2)_

Stack: Next.js 15 (App Router) + TypeScript strict · Zod · Drizzle · Neon Postgres · Vitest (+ optional Playwright) · Tailwind · Vercel. Payments: a simulated provider first, Stripe test mode optional, both behind a `PaymentProvider` interface.

Layers (dependencies point downward only):

| Layer          | Path _(planned)_                    | Rule                                                                                                            |
| -------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| UI             | `src/app/`, `src/features/booking/` | No pricing or rule logic. Shows the server's quote numbers.                                                     |
| API            | `src/app/api/**/route.ts`           | Thin: parse with Zod → call a use-case → map to JSON / problem+json.                                            |
| Application    | `src/application/`                  | Use-cases (`quoteBooking`, `createBooking`, `confirmPayment`, `expireHolds`). Each one owns its DB transaction. |
| Domain         | `src/domain/`                       | Pure TypeScript, **no I/O**. Money, age, eligibility, promo, pricing pipeline.                                  |
| Infrastructure | `src/infrastructure/`               | DB schema/client/seed, repositories, payment adapters.                                                          |

**Rule of thumb:** code that decides _money_ or _who is allowed_ lives in `domain/` and has a test.

The pricing pipeline (`domain/pricing/`) is the **only** place money is calculated. Each step is a pure `(state) => state` function in its own file (SPEC §5.6).

## Commands

Package manager: **pnpm 10** (pinned via `packageManager`). Node 20 (`.nvmrc`).

| Command                                      | What it does                                                                                        |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `pnpm dev`                                   | Dev server on `PORT` (from `.env.local`, default 3000), moving to the next free port if it is taken |
| `pnpm build` / `pnpm start`                  | Production build / serve (`start` uses the same port logic)                                         |
| `pnpm lint` · `pnpm typecheck` · `pnpm test` | ESLint · `tsc --noEmit` · Vitest                                                                    |
| `pnpm format` · `pnpm lint:fix`              | Prettier write · ESLint autofix                                                                     |
| `pnpm check`                                 | typecheck + lint + format:check + test — **run before finishing any task**                          |
| `pnpm db:generate`                           | Diff `schema.ts` into a new SQL migration                                                           |
| `pnpm db:migrate`                            | Apply pending migrations to `DATABASE_URL`                                                          |
| `pnpm db:seed`                               | Upsert the Sharad Utsav 2026 catalog and promos                                                     |
| `pnpm db:setup`                              | Migrate, then seed                                                                                  |
| `pnpm db:studio`                             | Drizzle Studio                                                                                      |

Deploy: `vercel --prod` (not set up yet). Set `DATABASE_URL` in Vercel → Settings → Environment Variables for **Production**.

## Coding standards

Enforced by tooling. `pnpm check` runs all of them, and CI (`.github/workflows/ci.yml`) runs them on every push and PR:

- TypeScript `strict: true` and `noUncheckedIndexedAccess: true`. No `any`. Type-only imports use `import { type X }`.
- **Layer boundaries are lint errors** (`eslint.config.mjs`): `domain/` can't import outer layers, framework, or DB drivers; `app/api/` can't import DB drivers; UI files can't import `infrastructure/` or `application/`. Don't disable these rules; move the code to the right layer instead.
- No `console.log` in `src/`: use `logger` from `src/lib/logger.ts` (structured JSON, event names like `health.database_unreachable`). Scripts may print.
- Prettier (`.prettierrc.json`, 100 columns) formats everything. Run `pnpm format` before finishing.
- Config is read through `getEnv()` (lazy, Zod-validated), never `process.env` directly in `src/`.

Design rules (SOLID as applied here):

- **Single responsibility:** one concept per file. Data is separate from logic (`seed-data.ts` vs `seed.ts`).
- **Single source of truth:** enum values live in `domain/` as `as const` tuples (`AGE_BANDS`, `BOOKING_STATUSES`…). Zod schemas and the DB `pgEnum`s are derived from them. Changing one needs `pnpm db:generate`.
- **Open/closed:** new behaviour means a new file (a pricing step, a promo kind) or a data change, not edits to existing branches.
- **Dependency inversion:** pass dependencies in (`seed(db)`, `createDb(url)`, `parseEnv(source)`) so code is testable without globals. Use-cases _(planned)_ depend on repository interfaces they declare. `infrastructure/` implements them.
- Pure functions in `domain/`, side effects at the edges (routes, repositories, scripts).

Domain rules _(planned, SPEC §3–5)_:

- **No unsafe casts.** The only allowed `as` is inside branded-type constructors (`toCents()`, `toProductId()`). Parse DB `jsonb` with Zod, never cast it.
- Money is the branded integer type `Cents`, with no floats anywhere in the money path. Percentage discounts round once at booking level, then split across lines by the largest-remainder method. Format currency only in the UI (`Intl.NumberFormat`).
- Age is **derived from DOB** on the festival's first day (2026-11-10, `America/Chicago`). Never accept age as a number.
- Errors use stable codes from the `DomainErrorCode` union (`domain/errors.ts`). Tests assert on codes, never on message text.
- UI state is one typed `useReducer` with discriminated-union actions. Removing a person or changing a DOB cascades to dependent selections.
- Follow the file and folder layout in SPEC §2.3. Match the surrounding code's naming and idiom.

Naming: files `kebab-case.ts`; types/interfaces `PascalCase`; functions/variables `camelCase`; constant tuples and config `UPPER_SNAKE_CASE`; DB tables/columns `snake_case` (mapped to camelCase in `schema.ts`); error codes `UPPER_SNAKE_CASE`.

## API guidelines _(planned, SPEC §7)_

- JSON in and out. Money fields are `…Cents` integers. Dates are ISO `YYYY-MM-DD` in the event timezone.
- Errors use `application/problem+json`: `{ type, title, status, code, details?: [{ path, code, message }] }`.
- Mutating endpoints require an `Idempotency-Key` header. A replay returns the original response. Reusing a key with a different body returns `409`.
- Status codes: 400 schema · 404 not found · 409 stock/idempotency conflict · 410 hold expired · 422 rule violation · 429 rate limited.
- Planned endpoints: `GET /api/events/{slug}`, `POST /api/events/{slug}/quotes`, `POST /api/bookings`, `POST /api/bookings/{id}/pay`, `GET /api/bookings/{id}?token=`, `GET /api/cron/expire-holds`, plus an optional `POST /api/webhooks/stripe`. Treat SPEC §7 as the contract. Changing it means updating the spec and the README.

## Database guidelines _(planned, SPEC §8)_

- Neon via **`drizzle-orm/neon-serverless` (WebSocket Pool)**, not `neon-http`, because the stock hold needs multi-statement transactions.
- Schema changes go through Drizzle migrations only. The seed must be an idempotent upsert.
- Stock hold: within one transaction, decrement `inventory_pools` in a **fixed order by pool id** (avoids deadlocks). Zero rows updated → `INSUFFICIENT_STOCK` → roll back. Keep `CHECK (remaining >= 0)`.
- State transitions are guarded by `WHERE status = <expected>` so they are safe to repeat and safe to race.
- `booking_lines` are a price snapshot. Never rewrite them when the catalog changes.
- Expired holds are released lazily inside catalog reads and `POST /bookings` (the primary mechanism). The daily Vercel cron is only a safety net.
- Integration tests run against a **separate Neon branch, never prod**.

## Security and environment variables

- **Never commit secrets.** `.env*` must be gitignored, with a `.env.example` listing variable names only. Never print, log, or paste secret values (DB URLs, Stripe keys, cron secret).
- Add new env vars to the Zod schema in `src/lib/env.ts` and to `.env.example`, so the app fails fast when one is missing. Vars must be set in Vercel **Production**, not only Preview.
- No user accounts. Booking access uses a random `accessToken`, stored hashed and compared in constant time.
- Validate all input at the API edge with Zod, and ignore unknown price or total fields.
- The cron endpoint is protected by the Vercel cron secret. The Stripe webhook must verify signatures.

## Testing requirements

Before calling a task done:

- Run `pnpm check`. Tests live in `tests/`, mirroring `src/`.
- Run the test suite and report real results. If tests fail, say so and include the output.
- Every domain rule or money change needs a unit test (SPEC §10 lists the must-have cases).
- Stock, idempotency, and promo-redemption changes need an integration test, including concurrency races.
- Run the linter and type checker, and fix new errors rather than suppressing them.

## Change rules

- Prefer minimal, targeted changes. Don't refactor beyond the request.
- Follow the layered architecture and the spec. If a change conflicts with `docs/SPEC.md`, raise it before deviating.
- Never delete existing functionality, endpoints, migrations, or data without explicit approval. Ask before destructive or breaking changes, such as dropping columns, changing the API contract, or resetting a database.
- **`DESIGN.md` must be written by the user in their own words and committed before any code. Never edit it afterwards.** Don't generate it.
- When behaviour or architecture changes, update the docs: `README.md` (API table, "Decisions I made"), `TEST-CASES.md`, the spec, and this file.
- New business rules should be one domain file or one data change plus a test, with no UI logic beyond an error message (SPEC §12).

## Git

- **Do not commit or push anything to git.** The user commits manually after verifying changes. Leave all changes uncommitted in the working tree.
- Main branch: `main`. The user commits in small, honest steps, because the commit history is part of the assessment.
- Don't commit `.env*` files, build output, or secrets.
