# Data sources and licensing

The Apache-2.0 licence of this repository covers **code only**. Every dataset below belongs to its owner. Status labels:

- **VERIFIED**: read in the owner's terms or documentation.
- **UNCONFIRMED**: treated as *not permitted* for public display until written confirmation exists.

The full evidence and links are in [docs/PHASE0_REPORT.md](docs/PHASE0_REPORT.md).

| Source key | What | How obtained | Public display | Status |
|---|---|---|---|---|
| `demo` | Fictional companies | `scripts/seed-demo.ts` | Yes (fictional) | — |
| `nse-equity-list`, `nse-sme-list` | NSE mainboard and Emerge company lists | Operator downloads manually from nseindia.com | Company identifiers only. Legal confirmation pending | Website terms prohibit automated collection: VERIFIED. Display of identifiers: UNCONFIRMED |
| `bse-scrip-list` | BSE List of Scrips | Operator downloads manually from bseindia.com | Same as NSE | Reproduction clause: UNCONFIRMED |
| `upstox-instruments-*` | NSE/BSE equity company master (names, ISINs, symbols, scrip codes) | Public Upstox instrument files, `npm run import:master -- --upstox` | Company identifiers only. Same position as the exchange lists | UNCONFIRMED |
| `upstox-fundamentals` | Quarterly revenue, operating profit, net profit (last 4 quarters) | Upstox Analytics Token, server-side, `npm run sync` | **No**, until Upstox confirms in writing (`PUBLIC_DISPLAY_UPSTOX`) | UNCONFIRMED |
| `upstox-detected` | Date new quarterly figures first appeared (derived by our sync) | Derived from `upstox-fundamentals` | Same as above | — |
| `upstox-candles-v3`, live quotes | Daily candles, live LTP | Upstox Analytics Token, server-side | **No**, until Upstox and exchange licensing allow it | UNCONFIRMED |
| `tejhq` (optional) | Adjusted EOD prices for cross-checks | Free personal key | **No**. Public use needs the Pro plan; raw data may not be republished | VERIFIED |
| Exchange price data (any route) | OHLCV | — | Requires an NSE/BSE licence or an authorised vendor | VERIFIED (NSE data policy) |

## Rules enforced in code

- Every ingested row stores `sourceKey`, `sourceUrl` (where applicable) and `fetchedAt`.
- `data_sources.publicDisplay` defaults to `false`.
- Every Upstox-derived page section (results, upcoming, reactions, prices, live ticker) renders only when `upstoxDisplayAllowed()` is true: always in local development, and in production only with `PUBLIC_DISPLAY_UPSTOX=true`.
- Demo and live records are never shown together (`DATA_MODE`).
- Raw downloaded files go in `data/raw/`, which is git-ignored.

## Before public launch

1. Get written answers from Upstox and the exchanges, or license EOD data from NSE Data & Analytics, BSE, or an authorised vendor.
2. Get legal advice on displaying company-disclosed facts (result figures and dates), with links to the filings.
3. Get legal advice on SEBI Research Analyst rules before enabling Indicative Research.
