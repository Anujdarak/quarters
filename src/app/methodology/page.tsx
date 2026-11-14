import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Methodology" };

export default function MethodologyPage() {
  return (
    <>
      <PageHeader
        title="Methodology"
        subtitle="How data is sourced, identified and calculated."
      />
      <article className="prose-doc">
        <h2>1. Company identification</h2>
        <p>
          A <em>company</em> is identified by its equity ISIN. Each exchange listing (NSE symbol or BSE scrip code, on the
          mainboard or SME platform) is stored as a separate <em>security</em> linked to that company, so a company listed
          on both exchanges appears once while keeping both identifiers.
        </p>
        <ul>
          <li>ISINs are validated with the ISO 6166 check digit; invalid rows are rejected and logged, not guessed.</li>
          <li>Name, symbol, segment (e.g. SME to mainboard migration) and status changes are recorded as dated events, never silently overwritten.</li>
          <li>When a full official list is re-imported, listings missing from it are marked inactive, not deleted.</li>
        </ul>

        <h2>2. Company master sources</h2>
        <ul>
          <li>
            Upstox instrument master files (public downloads), filtered to equity shares of Indian companies (ISIN
            prefix INE, security type 01) on NSE and BSE, mainboard and SME. Bonds, government securities, InvITs and
            partly-paid lines are excluded.
          </li>
          <li>
            The importer also accepts the official NSE “Securities available for trading” and BSE “List of Scrips” files,
            downloaded manually. The platform does not scrape exchange websites, whose terms prohibit automated
            collection.
          </li>
        </ul>

        <h2>3. Indian financial year</h2>
        <p>
          Fiscal years run April to March and are labelled by their ending year: FY 2026-27 covers 1 Apr 2026 to 31 Mar
          2027. Q1 = Apr–Jun, Q2 = Jul–Sep, Q3 = Oct–Dec, Q4 = Jan–Mar. Companies on the SME platforms generally report
          half-yearly (H1 = Apr–Sep, H2 = Oct–Mar), and the platform stores those as half-year periods rather than
          inventing quarters.
        </p>

        <h2>4. Quarterly results and growth</h2>
        <ul>
          <li>Revenue from operations, operating profit and net profit come from the Upstox Company Fundamentals API, in ₹ crore, for the most recent four quarters. Consolidated figures are used where available, otherwise standalone; the basis is shown with every table.</li>
          <li>QoQ compares with the immediately preceding quarter. Growth = (current − base) / base. It is shown as <em>n.m.</em> (not meaningful) when the base is zero or negative, or when the figure turns from profit to loss.</li>
          <li>Figures are never overwritten: if the provider later changes a quarter&apos;s numbers, the new figures are stored as a revision and marked “rev”.</li>
          <li>EBITDA and EPS by quarter are not shown, because the source does not provide them.</li>
        </ul>

        <h2>5. Upcoming results and deadlines</h2>
        <p>
          SEBI LODR Regulation 33(3) requires quarterly results within 45 days of quarter end, and results for the last
          quarter within 60 days of the financial year end (with the annual audited results). A company is listed as
          pending when the quarter after its latest reported one has ended, with that statutory deadline. The deadline is an
          upper bound, not the announcement date. Official board-meeting dates are not yet included.
        </p>

        <h2>6. Price change after results</h2>
        <ul>
          <li>The announcement time is the NSE broadcast time from the NSE &ldquo;Financial Results&rdquo; file when it has been imported. Otherwise it is the time the daily sync first saw the new figures (marked *), which can be up to a day late.</li>
          <li>The change is measured from the last closing price before the announcement: results published after 3:30 PM IST count from that day&apos;s close; results before or during market hours count from the previous day&apos;s close.</li>
          <li>Changes are shown for the results day (the session on the announcement date) and 1, 3, 5 and 7 trading days later, close to close, in rupees and percent. Each is sequential: results day against the last close before the announcement date, day 1 against the results day, day 3 against day 1, and so on; the total since the price before is shown on hover. Only days with an actual price count; a missing day is never filled in. Prices are unadjusted for splits and bonuses.</li>
        </ul>

        <h2>Good results</h2>
        <p>
          On Quarterly Results, a company has &ldquo;good results&rdquo; when both revenue and net profit are higher than in the
          previous quarter. This is a simple screen, not a recommendation: quarter-on-quarter changes can be seasonal, and the
          share price can fall after good results.
        </p>

        <h2>7. Licensing and data display</h2>
        <p>
          Each data source carries a public-display flag. Data whose redistribution rights are unconfirmed is not shown on
          public pages. See <code>DATA_SOURCES.md</code> in the project repository for the status of every provider.
        </p>
      </article>
    </>
  );
}
