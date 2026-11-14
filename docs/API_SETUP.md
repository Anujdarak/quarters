# API and data setup

Nothing here costs money. Do not subscribe to paid plans without project approval.

## 1. Official company master files (needed now)

Download each file **manually** in a browser. The exchanges' website terms prohibit automated scraping. Save into `data/raw/`.

| Exchange | Page | File |
|---|---|---|
| NSE mainboard | https://www.nseindia.com/static/market-data/securities-available-for-trading | "Securities available for Equity segment" → `EQUITY_L.csv` |
| NSE SME (Emerge) | same page | "SME" list → `SME_EQUITY_L.csv` |
| BSE (mainboard and SME) | https://www.bseindia.com/corporates/List_Scrips.html | Segment: Equity, Status: Active (repeat for Suspended/Delisted if wanted) → **Export** CSV |

If BSE lets you filter the SME segment separately, export it as its own file. Then import it with `--bse <file> --bse-segment SME`. Otherwise `--bse-segment auto` classifies groups `M` and `MT` as SME. That rule is reported, not officially specified, so check the result.

Always run with `--dry-run` first. The importer fails loudly if a file layout changes.

## 2. Upstox Analytics Token (register first, for Phases 2 and 4)

1. Open an Upstox account (free; requires KYC with PAN, Aadhaar and a bank account).
2. Go to https://account.upstox.com/developer/apps and choose **New App**.
   - Use any redirect URL, e.g. `http://localhost:3000/callback`.
   - **Read the terms** before accepting.
3. Open the **Analytics** tab, then **Generate Token**.
   - The token is read-only, valid for **1 year**, and limited to one per account.
   - It works for Historical Data and Fundamentals without a static IP.
4. Put it in `.env` as `UPSTOX_ANALYTICS_TOKEN`. Never use a `NEXT_PUBLIC_` prefix, and never commit it.
5. Email Upstox API support asking whether candle and fundamentals data may be shown to anonymous visitors of a free public research website. Keep `PUBLIC_DISPLAY_UPSTOX=false` until you have a written yes.
6. Renew the token yearly. Add a calendar reminder.

Docs: https://upstox.com/developer/api-documentation/analytics-token

## 3. Optional free keys (personal cross-checking only)

| Provider | Free tier | Sign-up |
|---|---|---|
| TejHQ | Free key, 1,000 calls/day | Email sign-in at https://tejhq.dev |
| Fincrux | Hobby plan, 5 calls/day | https://fincrux.org |

Neither may be used for public display on its free plan.

## Not recommended at ₹0

These need a broker account with KYC, and their terms or pricing don't fit:

| Provider | Reason |
|---|---|
| FYERS | Terms forbid public display |
| DhanHQ | Data API is ₹499/mo |
| Angel One | Redistribution unconfirmed and no fundamentals API |

## NSE results and board-meeting files (exact announcement dates)

Upstox does not publish when results were announced. For exact dates, download these from nseindia.com yourself
(the exchange's terms do not allow automated downloads):

1. **Financial Results**: Companies → Corporate Filings → Financial Results. Pick a date range (for example the
   last 3 months), then **Download (.csv)**.
2. **Board Meetings**: Companies → Corporate Filings → Board Meetings. Choose the forthcoming period, then
   **Download (.csv)**.
3. Save both in `data/raw/nse/` and run:

   ```bash
   npm run import:nse -- --results data/raw/nse/results.csv --board data/raw/nse/board.csv
   npm run sync      # fetches the prices around the new dates
   ```

Re-importing the same file is safe. If NSE changes the file layout, the importer stops and lists the headers it found.
