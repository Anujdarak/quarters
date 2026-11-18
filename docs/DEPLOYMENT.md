# Deployment

Deployment components:

| Component | Host |
|---|---|
| Web | Any Node.js host that supports Next.js |
| Database | [Turso](https://turso.tech) free plan: 100 databases, 5 GB, 500M row reads and 10M row writes per month (as listed on turso.tech/pricing, Nov 2026) |
| Scheduled ingestion (Phase 3+) | GitHub Actions cron |

Check your hosting and database providers' terms before monetising.

## 1. Create the Turso database

1. Sign up at https://turso.tech.
2. Install the Turso CLI (https://docs.turso.tech/cli/installation). On Windows it runs under WSL. You can also create the database and token in the Turso web dashboard instead.
3. Create the database and a token:

   ```bash
   turso auth login
   turso db create quarters --location <nearest, e.g. aws-ap-south-1>
   turso db show quarters --url        # → libsql://quarters-<org>.turso.io
   turso db tokens create quarters     # → auth token (treat as a secret)
   ```

## 2. Create the tables in Turso

From your machine, with the two values in your shell or `.env`:

```bash
TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... npm run db:migrate:turso
```

## 3. Load data into Turso

With the same two variables set, run one of these:

| Mode | Command |
|---|---|
| Live | `npm run import:master -- ...` |
| Demo | `npm run seed:demo` |
| Live (Upstox) | `npm run import:master -- --upstox` then `npm run sync` |

## 4. Deploy the web app

Use a Node.js host that supports a long-running Next.js server. Configure its
build command as `npm ci && npm run build` and its start command as `npm start`.
The host must provide the `PORT` environment variable. Do not deploy this app as
a static export: its pages and data require a server runtime.

Set these environment variables in your host's project settings. Keep secrets
server-side; never use the `NEXT_PUBLIC_` prefix for credentials:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | `file:./dev.db` (required by Prisma's schema; cloud queries use Turso when configured) |
   | `TURSO_DATABASE_URL` | Your `libsql://...` URL |
   | `TURSO_AUTH_TOKEN` | Your token |
   | `DATA_MODE` | `demo` or `live` |
   | `UPSTOX_ANALYTICS_TOKEN` | Only if the server should fetch live quotes / price charts |
   | `PUBLIC_DISPLAY_UPSTOX` | `false` (Upstox-derived sections are hidden on the public site) |

Keep `.env` out of Git; `.gitignore` already excludes it. Apply schema changes
to Turso with `npm run db:migrate:turso` before deploying code that depends on
them. Use your host's deployment settings to manage previews and production
deployments.

## Schema changes later

1. Edit `prisma/schema.prisma`.
2. Run `npm run db:migrate -- --name <change>` locally. This writes a new SQL migration and applies it to `prisma/dev.db`.
3. Run `npm run db:migrate:turso` to apply it to Turso.

Never edit a migration that has already been applied; the Turso script refuses changed checksums.

Never set `PUBLIC_DISPLAY_*=true` without the written permission recorded in DATA_SOURCES.md.

## Daily refresh

`npm run sync` pulls fundamentals, recomputes pending results and stores reaction prices. Run it on weekdays after
market close (about 20:00 IST). Locally, `scripts/windows/daily-sync.cmd` does this and also refreshes the company
master on Mondays; register it with Windows Task Scheduler. For the hosted database, run the same commands from a
scheduled CI job with `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` and `UPSTOX_ANALYTICS_TOKEN` set as secrets.
