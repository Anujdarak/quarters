import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Pct, SourceNote, UpstoxGate } from "@/components/earnings-ui";
import { Badge, EmptyState, PageHeader, Panel, Skeleton, cx, fmtDate, fmtDateTimeIst, fmtInt } from "@/components/ui";
import { istToday } from "@/lib/domain/deadlines";
import { fiscalQuarterOf, fiscalYearLabel, fiscalYearOf, quarterBounds, type Quarter } from "@/lib/domain/fiscal";
import { REACTION_DAYS, reactionDayLabel } from "@/lib/domain/reaction";
import { quarterHub, RESULTS_PAGE_SIZE } from "@/lib/queries/earnings";

export const metadata: Metadata = { title: "Quarterly Results" };

export default function ResultsPage({ searchParams }: PageProps<"/results">) {
  return (
    <>
      <PageHeader
        title="Quarterly Results"
        subtitle="Pick a quarter to see which companies posted good results and which are still to announce. Click a company to see how its share price moved on the results day and 1, 3, 5 and 7 days after."
      />
      <UpstoxGate what="Quarterly results data">
        <Suspense fallback={<Skeleton className="h-96" />}>
          <Hub searchParams={searchParams} />
        </Suspense>
      </UpstoxGate>
    </>
  );
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const QUARTERS: Quarter[] = [1, 2, 3, 4];
const inr = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function Hub({ searchParams }: { searchParams: PageProps<"/results">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const today = istToday();
  const fy = fiscalYearOf(today);
  // Default tab: the latest quarter of this fiscal year that has ended (results season).
  const current = fiscalQuarterOf(today);
  const defaultQ = current === 1 ? 1 : current - 1;
  const q = (QUARTERS.find((x) => String(x) === one(sp.q)) ?? defaultQ) as Quarter;
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const hub = await quarterHub({ fy, q, today, page });
  const pages = Math.max(1, Math.ceil(hub.goodCount / RESULTS_PAGE_SIZE));
  const reactionHref = (slug: string) => `/company/${slug}?quarter=${fy}-${q}#reaction`;

  return (
    <div className="grid gap-4">
      <nav aria-label="Quarter" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {QUARTERS.map((x) => {
          const b = quarterBounds(fy, x);
          return (
            <Link
              key={x}
              href={`/results?q=${x}`}
              aria-current={x === q ? "page" : undefined}
              className={cx("border px-3 py-2.5", x === q ? "border-ink bg-panel" : "border-line hover:border-mute")}
            >
              <span className="block text-[14px] font-semibold text-ink">
                Quarter {x} {fy}
              </span>
              <span className="block text-[11px] text-mute">
                {b.start.toLocaleString("en-IN", { month: "short", timeZone: "UTC" })}–{b.end.toLocaleString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" })} · {fiscalYearLabel(fy)}
              </span>
            </Link>
          );
        })}
      </nav>

      {!hub.ended && hub.announcedCount === 0 ? (
        <Panel>
          <EmptyState title={`Quarter ${q} ${fy} has not ended yet`}>
            It ends on {fmtDate(hub.periodEnd)}. Companies must publish results by {fmtDate(hub.deadline)} (SEBI deadline).{" "}
            {hub.upcomingCount > 0 && `${fmtInt(hub.upcomingCount)} companies will report for this quarter.`}
          </EmptyState>
        </Panel>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel
          className="xl:col-span-2"
          title="Good results · announced"
          meta={
            <span className="num">
              {fmtInt(hub.goodCount)} of {fmtInt(hub.announcedCount)} announced
            </span>
          }
          bodyClassName="p-0"
        >
          {hub.good.length === 0 ? (
            <EmptyState title="No good results yet for this quarter">
              {hub.announcedCount === 0 ? "No company has announced results for this quarter yet." : "No company grew both revenue and net profit over the previous quarter."}
            </EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Results announced</th>
                    <th className="num-cell">Price before</th>
                    {REACTION_DAYS.map((d) => (
                      <th key={d} className="num-cell">
                        {reactionDayLabel(d)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {hub.good.map((r) => (
                    <tr key={r.slug}>
                      <td>
                        <Link href={reactionHref(r.slug)} className="font-medium text-ink hover:underline">
                          {r.name}
                        </Link>
                        {r.symbol && <span className="num ml-1.5 text-[11px] text-mute">{r.symbol}</span>}
                        {r.sme && <span className="ml-1.5"><Badge tone="warn">SME</Badge></span>}
                      </td>
                      <td className="num whitespace-nowrap text-[12px]">
                        {r.announcedAt ? (
                          <span title={r.officialDate ? "NSE dissemination time" : "When our daily sync first saw the figures"}>
                            {fmtDateTimeIst(r.announcedAt)}
                            {!r.officialDate && <span className="text-mute"> *</span>}
                          </span>
                        ) : (
                          <span className="text-mute">date not known</span>
                        )}
                      </td>
                      <td className="num-cell">{r.baseClose !== null ? `₹${inr.format(r.baseClose)}` : <span className="text-mute">—</span>}</td>
                      {r.days.map((p, i) => (
                        <td key={REACTION_DAYS[i]} className="num-cell" title={p ? `${fmtDate(p.date)}: ₹${inr.format(p.close)} · total since price before ${p.cumulativePct >= 0 ? "+" : ""}${p.cumulativePct.toFixed(1)}%` : undefined}>
                          {p ? (
                            <>
                              <Pct v={p.changePct} />
                              <div className="text-[10.5px] text-mute">
                                {p.change >= 0 ? "+" : "−"}₹{inr.format(Math.abs(p.change))}
                              </div>
                            </>
                          ) : (
                            <span className="text-mute">{r.baseClose === null ? "—" : REACTION_DAYS[i] === 0 && r.days.some(Boolean) ? "market closed" : "not yet"}</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {pages > 1 && (
            <div className="flex items-center justify-between border-t border-line px-3 py-2 text-[12px]">
              <span className="num text-mute">
                Page {page} of {pages}
              </span>
              <span className="flex gap-2">
                {page > 1 && <Link href={`/results?q=${q}&page=${page - 1}`} className="border border-line px-2 py-0.5 hover:border-ink">← Prev</Link>}
                {page < pages && <Link href={`/results?q=${q}&page=${page + 1}`} className="border border-line px-2 py-0.5 hover:border-ink">Next →</Link>}
              </span>
            </div>
          )}
          <SourceNote>
            Good results = revenue and net profit both higher than the previous quarter (QoQ), ranked by the increase in net profit
            in ₹ crore. Click a company for its revenue, net profit and growth. Price before = last close before the announcement
            date. Each price column compares with the column before it: results day vs the price before, then 1 day vs results day, 3 days vs 1 day, 5 days vs 3 days, 7 days vs 5 days. Hover a cell for the total change since the price before. Year-on-year comparison is not available from the current data source. Announcement times are from NSE;
            &ldquo;date not known&rdquo; usually means a BSE-only company. * = date our daily sync first saw the figures (exact NSE
            time not imported).
          </SourceNote>
        </Panel>

        <Panel title="Upcoming results" meta={<span className="num">{fmtInt(hub.upcomingCount)} companies</span>} bodyClassName="p-0">
          {hub.upcoming.length === 0 ? (
            <EmptyState title="None pending">Every tracked company has either reported this quarter or is not reporting yet.</EmptyState>
          ) : (
            <ul className="divide-y divide-line text-[12.5px]">
              {hub.upcoming.map((u) => (
                <li key={u.slug} className="flex items-baseline justify-between gap-2 px-3 py-1.5">
                  <span className="min-w-0 truncate">
                    <Link href={`/company/${u.slug}`} className="text-ink hover:underline">
                      {u.name}
                    </Link>
                    {u.symbol && <span className="num ml-1.5 text-[11px] text-mute">{u.symbol}</span>}
                  </span>
                  <span className="num shrink-0 text-[11px]">
                    {u.meetingDate ? <span className="text-ink">{fmtDate(u.meetingDate)}</span> : <span className="text-mute">by {fmtDate(hub.deadline)}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <SourceNote>
            Dates in white are official board-meeting dates (NSE). &ldquo;by&rdquo; dates are the SEBI deadline: results can come any
            day before it.
            {hub.upcomingCount > hub.upcoming.length && ` Showing ${hub.upcoming.length} of ${fmtInt(hub.upcomingCount)}; official dates first.`}
          </SourceNote>
        </Panel>
      </div>
    </div>
  );
}
