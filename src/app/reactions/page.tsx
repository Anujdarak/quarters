import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Pct, SourceNote, UpstoxGate } from "@/components/earnings-ui";
import { Badge, EmptyState, PageHeader, Panel, Skeleton, cx, fmtDate, fmtDateTimeIst, fmtInt } from "@/components/ui";
import { daysFromDeadline, istToday } from "@/lib/domain/deadlines";
import { fiscalQuarterOf, fiscalYearLabel, fiscalYearOf, quarterBounds, type Quarter } from "@/lib/domain/fiscal";
import { REACTION_DAYS, reactionDayLabel } from "@/lib/domain/reaction";
import { reactionsForQuarter, RESULTS_PAGE_SIZE, type ReactionSort } from "@/lib/queries/earnings";

export const metadata: Metadata = { title: "Market Reactions" };

const QUARTERS: Quarter[] = [1, 2, 3, 4];
const SORTS: { key: ReactionSort; label: string }[] = [
  { key: "gain", label: "Biggest rise" },
  { key: "fall", label: "Biggest fall" },
  { key: "latest", label: "Latest announced" },
];
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const inr = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ReactionsPage({ searchParams }: PageProps<"/reactions">) {
  return (
    <>
      <PageHeader
        title="Market Reactions"
        subtitle="Pick a quarter to see when each company announced its results and how its share price moved on the results day and 1, 3, 5 and 7 trading days later. Past moves do not predict future ones."
      />
      <UpstoxGate what="Share-price data">
        <Suspense fallback={<Skeleton className="h-96" />}>
          <Reactions searchParams={searchParams} />
        </Suspense>
      </UpstoxGate>
    </>
  );
}

async function Reactions({ searchParams }: { searchParams: PageProps<"/reactions">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const today = istToday();
  const fy = fiscalYearOf(today);
  const current = fiscalQuarterOf(today);
  const q = (QUARTERS.find((x) => String(x) === one(sp.q)) ?? (current === 1 ? 1 : current - 1)) as Quarter;
  const sort = (SORTS.find((s) => s.key === one(sp.sort))?.key ?? "gain") as ReactionSort;
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const data = await reactionsForQuarter({ fy, q, sort, page, today });
  const pages = Math.max(1, Math.ceil(data.total / RESULTS_PAGE_SIZE));
  const href = (o: { q?: number; sort?: string; page?: number }) => {
    const p = new URLSearchParams({ q: String(o.q ?? q), sort: o.sort ?? sort });
    if ((o.page ?? 1) > 1) p.set("page", String(o.page));
    return `/reactions?${p}`;
  };

  return (
    <div className="grid gap-4">
      <nav aria-label="Quarter" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {QUARTERS.map((x) => {
          const b = quarterBounds(fy, x);
          return (
            <Link
              key={x}
              href={href({ q: x, page: 1 })}
              aria-current={x === q ? "page" : undefined}
              className={cx("border px-3 py-2.5", x === q ? "border-ink bg-panel" : "border-line hover:border-mute")}
            >
              <span className="block text-[14px] font-semibold text-ink">
                Q{x} {fy}
              </span>
              <span className="block text-[11px] text-mute">
                {b.start.toLocaleString("en-IN", { month: "short", timeZone: "UTC" })}–{b.end.toLocaleString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" })} · {fiscalYearLabel(fy)}
              </span>
            </Link>
          );
        })}
      </nav>

      {data.total === 0 ? (
        <Panel>
          <EmptyState title={data.ended ? `No Q${q} ${fy} results announced yet` : `Q${q} ${fy} has not ended yet`}>
            {data.ended
              ? daysFromDeadline(data.deadline, today) > 0
                ? `The SEBI filing deadline was ${fmtDate(data.deadline)} (${daysFromDeadline(data.deadline, today)} days ago). Our data may not yet reflect all exchange filings.`
                : daysFromDeadline(data.deadline, today) === 0
                  ? `The SEBI filing deadline is today, ${fmtDate(data.deadline)}.`
                  : `Companies must publish results for this quarter by ${fmtDate(data.deadline)}.`
              : `The quarter ends on ${fmtDate(data.periodEnd)}; results are due by ${fmtDate(data.deadline)}. Reactions will appear here as companies announce.`}
          </EmptyState>
        </Panel>
      ) : (
        <Panel
          title={`Q${q} ${fy} results · price change after announcement`}
          meta={
            <span className="num">
              {fmtInt(data.total)} announced · <span className="text-up">{fmtInt(data.up)} rose</span> · <span className="text-down">{fmtInt(data.down)} fell</span> (by day 1)
            </span>
          }
          bodyClassName="p-0"
        >
          <div className="flex flex-wrap gap-2 border-b border-line px-3 py-2 text-[12px]">
            {SORTS.map((s) => (
              <Link
                key={s.key}
                href={href({ sort: s.key, page: 1 })}
                aria-current={s.key === sort ? "true" : undefined}
                className={cx("border px-2 py-0.5", s.key === sort ? "border-ink text-ink" : "border-line text-mute hover:text-ink")}
              >
                {s.label}
              </Link>
            ))}
          </div>
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
                {data.rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/company/${r.slug}?quarter=${fy}-${q}#reaction`} className="font-medium text-ink hover:underline">
                        {r.name}
                      </Link>
                      {r.symbol && <span className="num ml-1.5 text-[11px] text-mute">{r.symbol}</span>}
                      {r.sme && <span className="ml-1.5"><Badge tone="warn">SME</Badge></span>}
                    </td>
                    <td className="num whitespace-nowrap text-[12px]" title={r.official ? "NSE dissemination time" : "When the daily sync first saw the figures"}>
                      {fmtDateTimeIst(r.announcedAt)}
                      {!r.official && <span className="text-mute"> *</span>}
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
          <div className="flex items-center justify-between border-t border-line px-3 py-2 text-[12px]">
            <span className="num text-mute">
              Page {page} of {pages}
            </span>
            <span className="flex gap-2">
              {page > 1 && <Link href={href({ page: page - 1 })} className="border border-line px-2 py-0.5 hover:border-ink">← Prev</Link>}
              {page < pages && <Link href={href({ page: page + 1 })} className="border border-line px-2 py-0.5 hover:border-ink">Next →</Link>}
            </span>
          </div>
          <SourceNote>
            Price before = last close before the announcement date. Results day = the session on the announcement date (if
            results came after 3:30 PM IST, the reaction shows on day 1). Each price column compares with the column before it: results day vs the price before, then 1 day vs results day, 3 days vs 1 day, 5 days vs 3 days, 7 days vs 5 days. Hover a cell for the total change since the price before. Ranking uses the total change by day 1.
            Unadjusted Upstox daily prices. Announcement times are NSE dissemination
            times; * = when our daily sync first saw the figures. &ldquo;—&rdquo; means prices for that stock have not been
            downloaded yet. Click a company for its full results history.
          </SourceNote>
        </Panel>
      )}
    </div>
  );
}
