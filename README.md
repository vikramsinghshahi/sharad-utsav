# Sharad Utsav 2026 — Tickets

Festival booking app for Sharad Utsav 2026 (Radha Krishna Temple, Allen, Texas). See [docs/SPEC.md](docs/SPEC.md) for the design.

> Status: project skeleton only. The booking flow is not built yet.

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

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string. A `*.neon.tech` host uses the Neon serverless driver; any other host uses node-postgres. |
| `PORT` | no | Preferred port for `pnpm dev` / `pnpm start` (local only; Vercel ignores it). |

## Using Neon

Only `DATABASE_URL` changes:

```bash
DATABASE_URL='postgresql://…neon.tech/…?sslmode=require' pnpm db:setup
```

Then set the same `DATABASE_URL` in Vercel → Project → Settings → Environment Variables (Production).
