import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import {
  Badge,
  ExternalLink,
  PageHeader,
  Panel,
  SegmentBadge,
  Skeleton,
  StatusBadge,
  fmtDate,
  fmtDateTimeIst,
  fmtInt,
} from "@/components/ui";
import { AnnouncementsPanel, nextResultsText, PriceChartPanel, ResultsHistoryPanel } from "@/components/company-earnings";
import { UpstoxGate } from "@/components/earnings-ui";
import { istToday } from "@/lib/domain/deadlines";
import { quarterLabel, type Quarter } from "@/lib/domain/fiscal";
import { upstoxDisplayAllowed } from "@/lib/providers/upstox";
import { getCompanyBySlug } from "@/lib/queries/companies";
import { companyAnnouncements, companyQuarters, companyResultDates, companyUpcoming, priceHistory } from "@/lib/queries/earnings";

export default function CompanyPage({ params, searchParams }: PageProps<"/company/[slug]">) {
  return (
    <Suspense fallback={<CompanySkeleton />}>
      <Company params={params} searchParams={searchParams} />
    </Suspense>
  );
}

/** Link to the official exchange quote page. BSE quote URLs need a name slug we do not store yet, so none for now. */
function exchangeUrl(exchange: string, symbol: string | null): string | null {
  if (exchange === "NSE" && symbol) return `https://www.nseindia.com/get-quotes/equity?symbol=${encodeURIComponent(symbol)}`;
  return null;
}

async function Company({
  params,
  searchParams,
}: {
  params: PageProps<"/company/[slug]">["params"];
  searchParams: PageProps<"/company/[slug]">["searchParams"];
}) {
  await connection();
  const today = istToday();
  const { slug } = await params;
  const sq = (await searchParams).quarter;
  const selectedQuarter = Array.isArray(sq) ? sq[0] : sq;
  const c = await getCompanyBySlug(slug);
  if (!c) notFound();

  const nse = c.securities.find((s) => s.exchange === "NSE");
  const bse = c.securities.find((s) => s.exchange === "BSE");
  const allowed = upstoxDisplayAllowed() && !c.isDemo;
  const priceListing = c.securities.find((s) => s.exchange === "NSE" && s.status === "ACTIVE") ?? c.securities.find((s) => s.status === "ACTIVE");
  const [quarters, upcoming, announcements, candles, resultDates] = allowed
    ? await Promise.all([
        companyQuarters(c.id),
        companyUpcoming(c.id),
        companyAnnouncements(c.id),
        priceListing ? priceHistory(`${priceListing.exchange}_EQ|${c.isin}`, priceListing.id) : Promise.resolve([]),
        companyResultDates(c.id),
      ])
    : [[], null, [], [], []];
  const nextResults = upcoming
    ? { label: quarterLabel(upcoming.fiscalYear, (upcoming.fiscalPart ?? 1) as Quarter), deadline: upcoming.expectedDate, status: upcoming.status }
    : null;

  return (
    <>
      <PageHeader
        title={c.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="num">ISIN {c.isin}</span>
            {nse?.symbol && <span className="num">NSE: {nse.symbol}</span>}
            {bse?.scripCode && <span className="num">BSE: {bse.scripCode}</span>}
            {c.industry && (
              <span>
                {c.industry.sector} / {c.industry.industry}
              </span>
            )}
            {c.isDemo && <Badge tone="warn">fictional demo record</Badge>}
          </span>
        }
      />

      <div className="mb-4">
        <UpstoxGate what="Results and price data">
          <div className="grid gap-4 xl:grid-cols-3">
            <div className="xl:col-span-3">
              <ResultsHistoryPanel quarters={quarters} dates={resultDates} candles={candles} selected={selectedQuarter} />
            </div>
            <div className="xl:col-span-2">
              <PriceChartPanel
                candles={candles}
                markers={resultDates.map((d) => d.at)}
                label={priceListing ? `${priceListing.exchange}: ${priceListing.symbol ?? priceListing.scripCode}` : ""}
              />
            </div>
            <AnnouncementsPanel items={announcements} upcoming={nextResults} today={today} />
          </div>
        </UpstoxGate>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Exchange listings" className="xl:col-span-2" bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Exchange</th>
                  <th>Identifier</th>
                  <th>Segment</th>
                  <th>Series / group</th>
                  <th>Listed</th>
                  <th>Status</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {c.securities.map((s) => {
                  const url = c.isDemo ? null : exchangeUrl(s.exchange, s.symbol);
                  return (
                    <tr key={s.id}>
                      <td className="font-medium">{s.exchange}</td>
                      <td className="num">{url ? <ExternalLink href={url}>{s.symbol ?? s.scripCode}</ExternalLink> : (s.symbol ?? s.scripCode)}</td>
                      <td>
                        <SegmentBadge segment={s.segment} />
                      </td>
                      <td className="num text-mute">{s.series ?? "—"}</td>
                      <td className="num">{fmtDate(s.listingDate)}</td>
                      <td>
                        <StatusBadge status={s.status} />
                      </td>
                      <td className="text-[11px] text-mute">
                        {s.sourceUrl ? <ExternalLink href={s.sourceUrl}>{s.sourceKey}</ExternalLink> : s.sourceKey}
                        <div className="num">fetched {fmtDateTimeIst(s.fetchedAt)}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Company facts">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[12px]">
            <dt className="text-mute">Financial year</dt>
            <dd>{c.fyEndMonth === 3 ? "April to March" : `Ends month ${c.fyEndMonth}`}</dd>
            <dt className="text-mute">Market cap</dt>
            <dd className="num">
              {c.marketCapCr ? `₹${fmtInt(Math.round(Number(c.marketCapCr)))} cr` : <span className="text-mute">Not available</span>}
            </dd>
            <dt className="text-mute">Latest results</dt>
            <dd>{quarters[0] ? quarters[0].label : <span className="text-mute">Not available</span>}</dd>
            <dt className="text-mute">Results status</dt>
            <dd className="num">
              {nextResults ? nextResultsText(nextResults, today) : <span className="text-mute">{allowed ? "Not due yet" : "Not available"}</span>}
            </dd>
          </dl>
        </Panel>
      </div>

      {c.securities.some((s) => s.events.length > 0) && (
        <Panel title="Listing history" className="mt-4" bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Exchange</th>
                  <th>Event</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Effective</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {c.securities.flatMap((s) =>
                  s.events.map((e) => (
                    <tr key={e.id}>
                      <td>{s.exchange}</td>
                      <td className="capitalize">{e.type.toLowerCase().replaceAll("_", " ")}</td>
                      <td className="num text-mute">{e.oldValue ?? "—"}</td>
                      <td className="num">{e.newValue ?? "—"}</td>
                      <td className="num">{e.effectiveOn ? fmtDate(e.effectiveOn) : <span className="text-mute">recorded {fmtDate(e.createdAt)}</span>}</td>
                      <td className="text-[11px] text-mute">{e.sourceKey}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

    </>
  );
}

function CompanySkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading company">
      <Skeleton className="mb-4 h-12 w-2/3" />
      <div className="grid gap-4 xl:grid-cols-3">
        <Skeleton className="h-40 xl:col-span-2" />
        <Skeleton className="h-40" />
      </div>
    </div>
  );
}
