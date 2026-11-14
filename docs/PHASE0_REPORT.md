# INDIAN STOCK MARKET DATA PROVIDER EVALUATION AND TECHNICAL ARCHITECTURE

*Phase 0 deliverable · researched 12 Nov 2026 · this is not legal advice*

Each finding is labelled:

- **VERIFIED**: read in the provider's own documentation or terms during this research.
- **REPORTED**: found only in secondary sources (forums, third-party articles).
- **UNCONFIRMED**: no authoritative statement found. Treat it as *not permitted* until written confirmation is received.

---

## A. Repository inspection

`C:\Users\anujd\Desktop\quaters` was empty: no git repository, no source files and no existing stack to preserve. This is a greenfield build.

Local toolchain:

| Tool | Status |
|---|---|
| Node.js | v24.20.0 |
| npm | 11.19.0 |
| Python | 3.11.9 |
| git | 2.54.0 |
| PostgreSQL | not installed |
| Docker | not installed |

**Database (changed after Phase 1 at the owner's request):** SQLite locally and Turso (hosted libSQL) in the cloud, replacing PostgreSQL. See the database section in docs/ARCHITECTURE.md.

---

## B/C. Provider findings

### 1. Upstox Developer API

**Market data**

| Item | Finding | Status |
|---|---|---|
| Historical candles (v3) | Daily, weekly and monthly from **Jan 2000** (max 1 decade per request for daily). Minute and hour candles from **Jan 2022**. Key format `NSE_EQ\|<ISIN>`, `BSE_EQ\|<ISIN>`. Docs: https://upstox.com/developer/api-documentation/v3/get-historical-candle-data | VERIFIED |

**Company Fundamentals API** (launched 11 May 2026, keyed by ISIN). Announcement: https://upstox.com/developer/api-documentation/announcements/company-fundamentals-api — VERIFIED.

- **Endpoints:** profile, income statement, balance sheet, cash flow, key ratios, shareholding, corporate actions, competitors.
- **Income statement:** `GET /v2/fundamentals/{isin}/income-statement?type=consolidated|standalone&time_period=quarterly|yearly&fs=true` (VERIFIED).
- **Limitations** (VERIFIED: https://upstox.com/developer/api-documentation/get-income-statement):
  - Periods are month labels ("Mar 2026"), not dates.
  - No EBITDA.
  - No announcement dates.
  - No filing links.
  - The `full_statement` line items (PBT, EPS) are **annual only**.
  - Values are in ₹ crore.

**Authentication**

| Item | Finding | Status |
|---|---|---|
| Analytics Token | Read-only token, **valid 1 year**, free. Usable for Historical Data and Fundamentals with no static IP needed. Generated from the "Analytics" tab of the Developer Apps page. Docs: https://upstox.com/developer/api-documentation/analytics-token | VERIFIED |
| Standard OAuth token | Daily-expiring, user-login OAuth token. The Analytics Token is the right choice for a server-side research site. | VERIFIED (docs list OAuth flow) |
| Account requirement | An Upstox account is needed to reach the developer portal. Opening one requires KYC (it is a SEBI-registered broker). | VERIFIED (portal) / KYC REPORTED |

**Coverage and limits**

| Item | Finding | Status |
|---|---|---|
| SME coverage | Not documented. | UNCONFIRMED |
| Fundamentals history depth | Not documented. | UNCONFIRMED |
| Rate limits | A rate-limit page exists (https://upstox.com/developer/api-documentation/rate-limiting). Per-endpoint numbers for fundamentals were not found. | UNCONFIRMED |

**Public display to anonymous visitors**

No developer-terms clause permitting it was found. Upstox staff replies on the community forum only say data may be used "to analyze and execute orders through the app." A non-staff reply says public display needs distribution rights from NSE.

Sources:
- https://community.upstox.com/t/live-data-feed-for-startups-to-show-data-on-their-platform/6142
- https://community.upstox.com/t/using-upstox-api-to-display-market-feed-data-on-a-website/5863

Status: **UNCONFIRMED. Assume NOT permitted.**

**Verdict:** Excellent and free for **development and private research**. Do not show Upstox-sourced prices or fundamentals to the public until Upstox confirms in writing. Exchange-level licensing may apply even if Upstox agrees.

### 2. NSE (official)

- **Data available:**
  - Equity master: `EQUITY_L.csv`
  - SME master: `SME_EQUITY_L.csv`, from the "Securities available for trading" page
  - Corporate announcements with broadcast timestamps
  - Board-meeting intimations
  - Financial results (PDF and XBRL)
  - Integrated Filing (Financial)
  - Daily bhavcopy archives
- **Website terms** (VERIFIED via the terms page text indexed by search; the page itself blocks automated fetches):
  - The terms prohibit "systematic or automated data collection, including scraping, data mining, data extraction and data harvesting."
  - https://www.nseindia.com/static/nse-terms-of-use
- **Data policy** (VERIFIED):
  - NSE is "sole owner of the Market Data". Distribution and redistribution are licensed through NSE Data & Analytics.
  - https://nsearchives.nseindia.com/web/sites/default/files/inline-files/NSE_Data_Sharing%26Usage_Policy.pdf
- **Implications:**
  - Undocumented JSON endpoints behind nseindia.com pages must **not** be scraped.
  - Permitted approach for now: an operator **manually downloads** official CSV/XBRL files and the app imports them.
  - Republishing exchange *prices* publicly needs an NSE Data licence or an authorised vendor.
  - Factual disclosures made by companies (result dates, reported figures) with a link to the official filing carry lower risk. Still obtain legal advice.

### 3. BSE (official)

- **Data available:**
  - List of Scrips with scrip code, ISIN, group and industry, downloadable as CSV.
  - Corporate announcements. BSE shows *exchange received* and *disseminated* times, which makes it the best public source for announcement timestamps.
  - Result filings (XBRL).
- **Licensing** (VERIFIED):
  - BSE data products are licensed by BSE directly for Indian clients.
  - International licensing moves from Deutsche Börse back to BSE on 1 Jan 2027: https://www.mds.deutsche-boerse.com/resource/blob/5361066/4660a3ba7cb0c6bad80c30ff7f195c69/data/2026-06-29_Circular%20PL%2016_1.pdf
  - Contact: datafeed.sales@bseindia.com.
  - A site-wide reproduction clause was not found: **UNCONFIRMED**.
- **Same approach as NSE:** manual official downloads, no undocumented endpoint scraping, and a licence before public price display.

### 4. TejHQ (https://tejhq.dev)

- **Data** (VERIFIED):
  - Open-data project built from NSE/BSE public bhavcopy.
  - Daily OHLCV with **adjusted** prices, corporate actions, and symbol history by ISIN.
  - NSE from **2010-01-04**, BSE only from **2024-07-08**.
  - No fundamentals ("planned, not built"). SME not mentioned.
- **Plans** (VERIFIED):

  | Plan | Price | Use | Limits |
  |---|---|---|---|
  | Free key | ₹0 | personal | 1,000 calls/day |
  | Retail | ₹599/mo | personal | |
  | Pro | ₹4,999/mo | commercial | |

- **Terms** (VERIFIED: https://tejhq.dev/data-terms):
  - Showing data on a public website is commercial use and **requires Pro**.
  - Raw data may never be republished or served "as data".
  - Exchange terms may also apply.
- **Verdict:** Useful free cross-check of adjusted prices during development. Not usable publicly at ₹0.

### 5. Fincrux (https://fincrux.org)

- **Data** (VERIFIED from homepage): quarterly results, P&L, balance sheet, cash flow, shareholding and ratios for "3,000+" NSE/BSE companies.
- **Plans** (VERIFIED from homepage):

  | Plan | Price | Limit |
  |---|---|---|
  | Free | ₹0 | **5 API calls/day** |
  | Plus | ₹200/mo | 10/min |
  | Pro | ₹1,000/mo | 60/min |

- **Terms:** Redistribution terms were not read: **UNCONFIRMED**.
- **Verdict:** The free tier is too small for anything beyond spot checks.

### 6. Stoxim (https://www.stoxim.com)

- **Data** (VERIFIED from homepage): XBRL-parsed financials, announcements and company master, keyed by ISIN.
- **Coverage:** Only "**20+ NSE companies**" with "3 yrs" of history (VERIFIED).
- **Plans:** Free 500 requests/day; Starter ₹2,999/mo.
- **Terms:** Licensing terms not published on the homepage: **UNCONFIRMED**.
- **Verdict:** Its coverage is too small today. The XBRL-first design is the right model, and this project replicates it.

### 7. TrueData (https://www.truedata.in)

- **Data** (VERIFIED): an **authorised exchange data vendor** (NSE/BSE/MCX). Offers corporate announcements, fundamentals, news and real-time APIs.
- **Pricing:** A free Workspace plan exists (15-min delayed, for their app). API pricing is "contact sales".
- **Redistribution:** Not stated: **UNCONFIRMED**. Because TrueData is an authorised vendor, it is the most likely *legal* path to licensed public display, at a paid price.

### 8. FYERS API v3

- **Access:**
  - API is free for FYERS clients.
  - Requires a FYERS trading account (KYC).
  - Requires a daily-expiring token (REPORTED).
- **Terms** (VERIFIED: https://fyers.in/terms-and-conditions-api.php). Without written consent, API content may not be:
  - copied, distributed or **publicly displayed**;
  - stored as a database;
  - used by third parties.

  Exchange data "shall not be used for the development of different charting, technical tools".
- **Verdict:** **Not suitable** for a public website.

### 9. DhanHQ v2

- **Pricing:**
  - Trading APIs are free.
  - **Data APIs cost ₹499 + GST per month.** The free-with-trades offer was discontinued (REPORTED via Dhan support pages: https://dhan.co/support/platforms/dhanhq-api/how-does-the-dhanhq-data-api-subscription-work/).
- **Requirements:** a Dhan account with KYC.
- **Rate limits** (VERIFIED: https://dhanhq.co/docs/v2/): data 5 requests/second, 100,000/day.
- **Redistribution:** UNCONFIRMED.
- **Verdict:** Not ₹0.

### 10. Angel One SmartAPI

- **Access:**
  - Free API.
  - Requires an Angel One account (KYC).
  - From 1 Apr 2026, a static-IP registration requirement applies for order APIs (REPORTED).
- **Data:** Historical data for NSE equity and F&O (VERIFIED, Angel One knowledge centre).
- **Redistribution:** UNCONFIRMED.
- **Verdict:** Same position as Upstox, with no fundamentals API.

---

## E. Comparison table

Column notes:
- **Free** means a ₹0 plan exists for *development*.
- **Public display** means displaying the data to anonymous website visitors.

| Provider | Hist. OHLC | Qtr financials | Announcement dates | NSE | BSE | SME | Free | Public display |
|---|---|---|---|---|---|---|---|---|
| Upstox | Daily since 2000 | Yes (summary qtr; EBITDA missing) | No | Yes | Yes | UNCONFIRMED | Yes (Analytics token, 1 yr) | **UNCONFIRMED** |
| NSE official | Bhavcopy archives | Filings (PDF/XBRL) | **Yes** (broadcast time) | Yes | — | Yes (SME list) | Manual download | Prices: **licence required**. Disclosures + links: lower risk, legal check |
| BSE official | Bhavcopy archives | Filings (XBRL) | **Yes** (received + disseminated time) | — | Yes | Yes | Manual download | Prices: **licence required**. Site reproduction clause UNCONFIRMED |
| TejHQ | NSE 2010+, BSE Jul 2024+ | No | No | Yes | Partial | Not stated | 1,000/day personal | **Pro ₹4,999/mo**, no raw redistribution |
| Fincrux | Yes | Yes | Not stated | Yes | Yes | Not stated | 5 calls/day | UNCONFIRMED |
| Stoxim | No | Yes (20+ cos) | Announcements module | 20+ cos | Partial | No | 500/day | UNCONFIRMED |
| TrueData | Vendor (paid) | Yes (paid) | Yes (paid) | Yes | Yes | Not stated | App only, delayed | Authorised vendor; terms UNCONFIRMED |
| FYERS | Yes | No | No | Yes | Yes | Not stated | Yes (account) | **Prohibited** without written consent |
| DhanHQ | Yes | No | No | Yes | Yes | Not stated | **No** (₹499/mo) | UNCONFIRMED |
| Angel One | Yes | No | No | Yes | Partial | Not stated | Yes (account) | UNCONFIRMED |

---

## D/F. Final recommendation

**There is no ₹0 combination with verified rights to display exchange prices publicly.** No combination of the providers above changes that.

The plan below delivers everything legally possible at ₹0 now and isolates the parts that later need a licence.

| Need | Recommended source (₹0 stage) | Why |
|---|---|---|
| Company master (NSE, NSE SME, BSE, BSE SME) | **Official exchange CSVs**, downloaded manually by the operator and imported by our importer | Authoritative, complete, ISIN-keyed, and no scraping |
| Announcement dates and timestamps | **Official NSE/BSE filings** (operator-downloaded CSV/XBRL exports), with BSE dissemination time preferred | Only the exchanges have true timestamps. No API above provides them |
| Quarterly financials | **XBRL parsing of the official filings** (primary). **Upstox Fundamentals** as a private cross-check | XBRL holds every line item, standalone and consolidated, period dates and filing links. Upstox lacks EBITDA, dates and filing links |
| Historical prices | **Upstox v3 daily candles** (private dev/research), with TejHQ free key as an adjusted-price cross-check | Free, deep history (2000+), ISIN-keyed |
| Public price display (launch) | **Licence needed**: NSE Data & Analytics EOD licence, an authorised vendor (e.g. TrueData), or Upstox written consent | Required by the exchange data policy |
| Metrics and reactions | **Computed locally** (TypeScript, unit-tested) | Accurate, auditable, no licensing issue for derived analytics. Confirm with counsel |

### Register first: Upstox Developer App + Analytics Token

1. Open an Upstox account (KYC with PAN, Aadhaar and bank). The account itself is free.
2. Visit https://account.upstox.com/developer/apps, then **New App**. The redirect URL can be `http://localhost:3000/callback` (it isn't used by the Analytics token). Accept the terms, and **read them for redistribution clauses**.
3. Open the **Analytics** tab, then **Generate Token**. Copy it into `.env` as `UPSTOX_ANALYTICS_TOKEN`. It lasts 1 year, and only one token can exist at a time.
4. Email Upstox API support asking for **written confirmation** on displaying historical candles and fundamentals to anonymous public visitors of a free research website. Until they reply, `PUBLIC_DISPLAY_UPSTOX=false` keeps that data off public pages.

Optional free registrations, both personal-use only:
- **TejHQ free key** (email sign-in), for cross-checking adjusted prices.
- **Fincrux Hobby**, for spot checks.

Do **not** pay for TejHQ Pro, Dhan or TrueData without approval.

---

## H. How to retrieve historical announcement dates

1. **BSE corporate announcements**, filtered by category "Result" and by company.
   - Each row shows the **exchange received time** and **disseminated time**.
   - The disseminated time is the *announcement timestamp*.
2. **NSE corporate announcements and financial results**
   - These list the **broadcast date/time** per filing, plus the filing type (original or revised) and its consolidated or standalone status.
   - The financial results page supports CSV export.
3. **Board meeting intimations**
   - These come from a separate category on both exchanges.
   - They are stored in their own table and never treated as the result timestamp.
4. **Cross-exchange rule**
   - For dual-listed companies, record both exchanges' timestamps.
   - The **earliest dissemination** defines the market-moving moment.
   - Since Oct 2024 SEBI's single-filing system allows one submission for both exchanges (VERIFIED: SEBI circular SEBI/HO/CFD/CFD-PoD-2/CIR/P/2024/185, 31 Dec 2024), so timestamps can be identical.
5. **Timing classification**, in IST:
   - Before 09:15 is pre-market.
   - 09:15 to 15:30 is intra-session.
   - After 15:30 is post-market.
   - Weekends and holidays roll forward to the next session.
6. **Collection method at ₹0**
   - The operator downloads official exports.
   - `ingest:announcements` imports them, de-duplicates them and logs every import.
   - An automated feed needs written exchange consent or a vendor.

## I. Realistic historical depth

| Data | Realistic depth | Note |
|---|---|---|
| Daily prices | 2000 onwards (Upstox, VERIFIED); NSE bhavcopy 2010+ via TejHQ | SME stocks begin at listing (NSE Emerge 2012, BSE SME 2012) |
| Announcement timestamps | Generally ~2010s onwards on exchange sites | Exact earliest date per exchange is UNCONFIRMED; verify during backfill |
| Machine-readable financials (XBRL) | Mid-2010s onwards | Integrated Filing (Financial) XBRL from Q3 FY25 (VERIFIED). Older results are PDF only, and parsing them is error-prone, so mark them "document only" |
| SME results | **Half-yearly** for SME-platform companies under SEBI LODR, not quarterly | The model supports `HALF_YEAR` periods |

## J. Architecture

```
            Operator downloads (official CSV/XBRL)     Upstox API (server-side token)
                         │                                      │
                         ▼                                      ▼
   ┌───────────── ingestion/ (TS scripts, adapters, rate limiter, retries) ─────────────┐
   │ company-master │ announcements │ xbrl-financials │ prices │ corp-actions │ news   │
   └───────────────────────────────┬────────────────────────────────────────────────────┘
                                   ▼ ingestion_logs, data_sources, source_url, fetched_at
                    Turso / SQLite (Prisma)  ← preserved revisions, ISIN-keyed
                                   │
           analytics/ (pure TS, unit-tested: fiscal calendar, growth, reactions, stats)
                                   │
              Next.js App Router (server components; no login; no client secrets)
                                   │
          Licensing gate: provider.publicDisplay flag → public pages hide unlicensed data
```

- **Provider interface** (`src/lib/providers`): every source implements `PriceProvider`, `FundamentalsProvider` and similar interfaces, with a `licence` descriptor (`publicDisplay: boolean`, `attribution`). Swapping to a commercial provider means writing an adapter, not rewriting the app.
- **Demo mode** (`DATA_MODE=demo`): seeds *fictional* companies with obviously fake identifiers and shows a permanent "DEMO DATA, NOT REAL" banner.
- **AI** (Phase 6): structured JSON in and out. It only interprets values that the deterministic modules have already computed.

The full schema lives in `prisma/schema.prisma`. The key tables are listed below.

| Table | What it holds |
|---|---|
| `companies` | The legal entity. ISIN is unique |
| `securities` | One row per exchange listing (NSE or BSE, MAIN or SME), with symbol or scrip code and status. Symbol, name and segment changes are recorded in `security_events` |
| `financial_periods` and `quarterly_results` | One row per (company, period, basis, revision). Revisions never overwrite earlier rows |
| `financial_metrics` | Line items |
| `earnings_announcements` | Kept separate from `board_meetings` |
| `historical_prices` | Raw prices, linked to `corporate_actions` |
| `trading_calendar` | Exchange trading days |
| `data_sources` and `ingestion_logs` | Provenance and job tracking |

## K. Roadmap

| Phase | Scope | Exit test |
|---|---|---|
| 0 | This report | — |
| 1 | Next.js, Prisma schema, design system, nav, dashboard, directory, search, filters, master-file importers, demo mode | Unit tests, build, directory works on demo + any imported real master files |
| 2 | XBRL financial parser, company financial pages, growth calcs with edge cases | Parser tests on real filings |
| 3 | Announcement importer, timelines, revisions | Timestamp classification tests |
| 4 | Upstox adapter, charts (Lightweight Charts, Apache-2.0; keep the NOTICE/attribution), reaction engine, NIFTY benchmark | Reaction tests incl. holidays/no-trade sessions |
| 5 | Upcoming calendar (official vs estimated vs unknown) | — |
| 6 | Intelligence engine (deterministic stats + grounded LLM) | Golden-file tests, "Insufficient Information" paths |
| 7 | Security, performance, SEO, deployment, licence review | — |

## L. What is NOT achievable at ₹0

1. **Public display of exchange price data** (charts, OHLC, reactions shown on public pages). This needs an exchange or vendor licence, or written provider consent.
2. **Automated, real-time exchange announcement feeds.** The exchange terms prohibit automated harvesting, and official feeds are paid.
3. **Licensed news content.** Free news APIs generally forbid redistribution. Plan to show headline, link and an original summary only, after checking each API's terms.
4. **Legal review** of SEBI Research Analyst requirements for the "Indicative Research" feature. Budget for this before public launch of Phase 6.

## Licence recommendation for the code

**Apache-2.0.** It is permissive like MIT and adds an explicit patent grant, and it matches the Lightweight Charts licence. Third-party data is **not** covered by this licence (see DATA_SOURCES.md).
