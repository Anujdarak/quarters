import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { SourceNote, UpstoxGate } from "@/components/earnings-ui";
import { Badge, EmptyState, PageHeader, Panel, Skeleton, cx, fmtDate, fmtInt } from "@/components/ui";
import { istToday } from "@/lib/domain/deadlines";
import { quarterLabel, type Quarter } from "@/lib/domain/fiscal";
import { RESULTS_PAGE_SIZE, upcomingResults, type UpcomingWindow } from "@/lib/queries/earnings";

export const metadata: Metadata = { title: "Upcoming Results" };

const WINDOWS: { key: UpcomingWindow; label: string }[] = [
  { key: "today", label: "Due today" },
  { key: "week", label: "Due in 7 days" },
  { key: "overdue", label: "Past deadline" },
  { key: "all", label: "All pending" },
];

export default function UpcomingPage({ searchParams }: PageProps<"/upcoming">) {
  return (
    <>
      <PageHeader
        title="Upcoming Results"
        subtitle="Companies whose next quarterly results are still pending, with the latest date SEBI rules allow them to publish. A deadline is a legal upper bound, not the announcement date: most companies report earlier."
      />
      <UpstoxGate what="Pending-results data">
        <Suspense fallback={<Skeleton className="h-96" />}>
          <Upcoming searchParams={searchParams} />
        </Suspense>
      </UpstoxGate>
    </>
  );
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const DAY = 86_400_000;

async function Upcoming({ searchParams }: { searchParams: PageProps<"/upcoming">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const today = istToday();
  const window = (WINDOWS.find((w) => w.key === one(sp.window))?.key ?? "week") as UpcomingWindow;
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const { total, rows, counts } = await upcomingResults({ window, today, page });
  const pages = Math.max(1, Math.ceil(total / RESULTS_PAGE_SIZE));

  return (
    <div className="grid gap-4">
      <nav className="flex flex-wrap gap-2 text-[12px]" aria-label="Filter">
        {WINDOWS.map((w) => (
          <Link
            key={w.key}
            href={`/upcoming?window=${w.key}`}
            aria-current={w.key === window ? "page" : undefined}
            className={cx("border px-2.5 py-1", w.key === window ? "border-ink text-ink" : "border-line text-mute hover:text-ink")}
          >
            {w.label} <span className="num">({fmtInt(counts[w.key])})</span>
          </Link>
        ))}
      </nav>

      <Panel title={WINDOWS.find((w) => w.key === window)!.label} meta={<span className="num">{fmtInt(total)} companies</span>} bodyClassName="p-0">
        {rows.length === 0 ? (
          <EmptyState title="Nothing in this window">
            Either every company has already reported, or no figures have been synced yet (<code className="num">npm run sync</code>).
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>NSE / BSE</th>
                  <th>Results for</th>
                  <th>Deadline</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const nse = r.company.securities.find((s) => s.exchange === "NSE")?.symbol;
                  const bse = r.company.securities.find((s) => s.exchange === "BSE")?.scripCode;
                  const days = r.expectedDate ? Math.round((r.expectedDate.getTime() - today.getTime()) / DAY) : null;
                  return (
                    <tr key={r.id}>
                      <td>
                        <Link href={`/company/${r.company.slug}`} className="font-medium text-ink hover:underline">
                          {r.company.name}
                        </Link>
                        {r.company.securities.some((s) => s.segment === "SME") && <span className="ml-1.5"><Badge tone="warn">SME</Badge></span>}
                      </td>
                      <td className="num text-mute">{nse ?? bse ?? "—"}</td>
                      <td>{quarterLabel(r.fiscalYear, (r.fiscalPart ?? 1) as Quarter)}</td>
                      <td className="num">{fmtDate(r.expectedDate)}</td>
                      <td>
                        {days === null ? (
                          <Badge>unknown</Badge>
                        ) : days < 0 ? (
                          <Badge tone="down" title="Deadline passed with no figures in our data. The company may have filed late, sought an extension, or our source may lag.">
                            {-days}d past deadline
                          </Badge>
                        ) : days === 0 ? (
                          <Badge tone="warn">due today</Badge>
                        ) : (
                          <Badge>in {days}d</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-line px-3 py-2 text-[12px]">
          <span className="num text-mute">
            Page {page} of {pages}
          </span>
          <span className="flex gap-2">
            {page > 1 && <Link href={`/upcoming?window=${window}&page=${page - 1}`} className="border border-line px-2 py-0.5 hover:border-ink">← Prev</Link>}
            {page < pages && <Link href={`/upcoming?window=${window}&page=${page + 1}`} className="border border-line px-2 py-0.5 hover:border-ink">Next →</Link>}
          </span>
        </div>
        <SourceNote>
          Deadline rule: SEBI LODR Regulation 33(3), 45 days after quarter end (60 days for the March quarter, filed with annual
          results). &ldquo;Pending&rdquo; means the quarter is not yet in the Upstox fundamentals feed, which can lag the
          exchange filing by a day or more. Official board-meeting dates are not included.
        </SourceNote>
      </Panel>
    </div>
  );
}
