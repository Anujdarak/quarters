# Quarters: Indian Quarterly Earnings Intelligence

An open-source research platform for companies listed on NSE and BSE (mainboard and SME). It covers:

- historical quarterly results;
- exact results-announcement dates;
- how each stock actually traded after past announcements.

No login is needed.

> **Status: Phase 1 (foundation).** The company directory, search, filters, dashboard, design system and official master-file importer are working. Results, announcements, charts, reactions and research are **not built yet**. Their pages say so instead of showing sample numbers. See [docs/PHASE0_REPORT.md](docs/PHASE0_REPORT.md) for the provider evaluation and roadmap.

**This is a research tool, not investment advice.** See the in-app Risk Disclosures.

## Quick start (local)

Prerequisites: Node.js 20+ (developed on 24). No database server is needed.

```bash
npm install
cp .env.example .env          # DATA_MODE=demo, DATABASE_URL=file:./dev.db
npx prisma migrate deploy     # create tables in the local SQLite file (prisma/dev.db)
npm run seed:demo             # fictional demo companies
npm run dev                   # http://localhost:3000
```

### Database

| Environment | Database |
|---|---|
| Local | A SQLite file (`prisma/dev.db`), with no server process |
| Cloud | [Turso](https://turso.tech), a hosted libSQL (SQLite-compatible) database with a free plan |

Set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` and the app and every script use Turso instead of the local file. Setup steps are in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

### Demo mode vs live mode

| `DATA_MODE` | Shows | Banner |
|---|---|---|
| `demo` | Only fictional records (ISIN `DEMO…`, names ending "(Demo)") | Yes, on every page |
| `live` | Only records imported from official sources | No |

The two never mix.

### Loading real companies

Download the official lists by hand (see [docs/API_SETUP.md](docs/API_SETUP.md)) into `data/raw/`. That folder is git-ignored. Then:

```bash
npm run import:master -- --nse-eq data/raw/EQUITY_L.csv --nse-sme data/raw/SME_EQUITY_L.csv --bse data/raw/bse_equity.csv --dry-run
npm run import:master -- --nse-eq data/raw/EQUITY_L.csv --nse-sme data/raw/SME_EQUITY_L.csv --bse data/raw/bse_equity.csv
```

Then set `DATA_MODE=live`.

## Scripts

| Script | Purpose |
|---|---|
| `npm test` | Unit tests (Vitest) |
| `npm run typecheck` / `lint` / `build` | Quality gates |
| `npm run db:migrate` | Create a new migration (local SQLite) |
| `npm run db:migrate:turso` | Apply migrations to Turso |
| `npm run db:studio` | Browse the local database |
| `npm run seed:demo` | Fictional demo data |
| `npm run import:master` | Import official NSE/BSE master files |
| `npm run import:master -- --upstox` | Download and import the NSE/BSE company master from Upstox |
| `npm run sync` | Daily refresh: quarterly results, pending results, reaction prices |

## Documentation

| File | What it covers |
|---|---|
| [docs/PHASE0_REPORT.md](docs/PHASE0_REPORT.md) | Provider evaluation, architecture and roadmap |
| [DATA_SOURCES.md](DATA_SOURCES.md) | Every data source and its licensing status |
| [docs/API_SETUP.md](docs/API_SETUP.md) | Accounts, tokens and file downloads |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Deployment |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Contribution rules |

## Licence

Code: [Apache-2.0](LICENSE). It is permissive and includes an explicit patent grant.

**The code licence does not cover third-party data.** Market data, filings and provider API responses stay subject to their owners' terms (see [DATA_SOURCES.md](DATA_SOURCES.md)). Never commit downloaded data or credentials.
