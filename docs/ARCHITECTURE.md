# Architecture

```
src/
  app/                 Next.js 16 App Router pages (server components, Cache Components / PPR)
  components/          Design system (ui.tsx), app shell, navigation
  lib/
    domain/            Pure, unit-tested logic: fiscal calendar, identifiers  (+ later: growth, reactions, stats)
    ingestion/         Pure parsers for official files (+ later: XBRL, announcements)
    providers/         Provider interfaces with licence descriptors (adapters added per phase)
    queries/           Server-only Prisma queries used by pages
    prisma-client.ts   Prisma client factory: Turso (libSQL adapter) or local SQLite file
    db.ts, env.ts      Server-only client singleton, DATA_MODE
scripts/               CLI jobs: seed-demo, import-master, turso-migrate (+ later: backfills, daily sync)
prisma/schema.prisma   Full schema for all phases
```

## Principles

1. **Deterministic maths in code, never in an LLM.** Domain modules are pure functions with unit tests.
2. **Provenance on every row.** Each row records `sourceKey`, `sourceUrl` and `fetchedAt`, and every job run writes to `ingestion_logs`.
3. **No silent overwrites.**
   - Financial revisions become new `quarterly_results` rows.
   - Listing changes become `security_events`.
   - Listings that disappear are marked inactive, not deleted.
4. **Licence gate.** `data_sources.publicDisplay` and `ProviderLicence.publicDisplay` decide whether data reaches public pages.
5. **Swappable providers.** Pages depend on `PriceProvider` and `FundamentalsProvider`, not on a specific vendor.
6. **Honest UI.** Missing data renders a `DataUnavailable` state, never placeholder numbers.

## Rendering

`cacheComponents` is enabled (Next 16 default), so each page is a prerendered static shell. Database reads stream inside `<Suspense>` boundaries with skeleton fallbacks. As a result, builds never touch the database.

## Database

| Environment | Database | Connection |
|---|---|---|
| Local | SQLite file | `DATABASE_URL=file:./dev.db` |
| Cloud | Turso (hosted libSQL) | Prisma's libSQL driver adapter, selected when `TURSO_DATABASE_URL` is set |

Migrations are SQL files in `prisma/migrations`:
- `prisma migrate dev` creates and applies them locally.
- `scripts/turso-migrate.ts` applies them to Turso, tracking checksums in `_turso_migrations`.

SQLite-specific conventions:
- Calendar dates are stored as `DateTime` at 00:00 UTC.
- Decimals use Prisma's `Decimal` type.
- Name search relies on SQLite's ASCII case-insensitive `LIKE`.

Ingestion jobs batch their writes (a few reads, in-memory diff, chunked transactions), because each Turso query is a network round trip.

## Identity model

| Entity | Defined by |
|---|---|
| Company | One equity ISIN (`companies.isin`, unique) |
| Security | One listing per exchange (`securities`): NSE symbol or BSE scrip code, plus segment and status |
| Dual listing | One company row with two security rows |

## Known Phase 1 limitations

- Unknown company slugs render the not-found UI with `noindex`, but return HTTP 200, because the 404 status cannot be set after streaming starts. This will be addressed in Phase 7 (SEO).
- Market capitalisation is empty until a licensed price source exists. The filter excludes companies without it.
- Company pages use the default page title. Per-company metadata comes in Phase 7.
