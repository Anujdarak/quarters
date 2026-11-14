import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Badge, EmptyState, PageHeader, Panel, SegmentBadge, Skeleton, StatusBadge, fmtInt } from "@/components/ui";
import { parseFilters, searchCompanies, type DirectoryFilters } from "@/lib/queries/companies";

export const metadata: Metadata = { title: "Companies" };

export default function CompaniesPage({ searchParams }: PageProps<"/companies">) {
  return (
    <>
      <PageHeader
        title="Companies"
        subtitle="Every company listed on NSE and BSE, mainboard and SME. Use the search box at the top to find one, or see results by quarter on Quarterly Results."
      />
      <Suspense fallback={<DirectorySkeleton />}>
        <Directory searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Directory({ searchParams }: { searchParams: PageProps<"/companies">["searchParams"] }) {
  const f = parseFilters(await searchParams);
  const result = await searchCompanies(f);

  return (
    <div className="grid gap-4">
      <Panel
        title="Results"
        meta={
          <span className="num">
            {fmtInt(result.total)} {result.total === 1 ? "company" : "companies"}
          </span>
        }
        bodyClassName="p-0"
      >
        {result.rows.length === 0 ? (
          <EmptyState title="No companies match these filters">
            Try a shorter search term, or clear filters. Search matches company name, NSE symbol prefix, exact BSE scrip
            code or exact ISIN.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>NSE</th>
                  <th>BSE</th>
                  <th>Segment</th>
                  <th>Sector / Industry</th>
                  <th>Status</th>
                  <th className="num-cell">Mkt cap (₹ cr)</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((c) => {
                  const nse = c.securities.find((s) => s.exchange === "NSE");
                  const bse = c.securities.find((s) => s.exchange === "BSE");
                  const segments = [...new Set(c.securities.map((s) => s.segment))];
                  const statuses = [...new Set(c.securities.map((s) => s.status))];
                  return (
                    <tr key={c.id}>
                      <td className="min-w-56">
                        <Link href={`/company/${c.slug}`} className="font-medium text-ink hover:underline">
                          {c.name}
                        </Link>
                        <div className="num text-[11px] text-mute">{c.isin}</div>
                      </td>
                      <td className="num">{nse?.symbol ?? <span className="text-mute">—</span>}</td>
                      <td className="num">{bse?.scripCode ?? <span className="text-mute">—</span>}</td>
                      <td>
                        <span className="flex gap-1">
                          {segments.map((s) => (
                            <SegmentBadge key={s} segment={s} />
                          ))}
                        </span>
                      </td>
                      <td className="max-w-64 truncate text-mute" title={c.industry ? `${c.industry.sector} / ${c.industry.industry}` : undefined}>
                        {c.industry ? (
                          <>
                            <span className="text-ink">{c.industry.sector}</span> / {c.industry.industry}
                          </>
                        ) : (
                          "Unclassified"
                        )}
                      </td>
                      <td>
                        <span className="flex gap-1">
                          {statuses.map((s) => (
                            <StatusBadge key={s} status={s} />
                          ))}
                        </span>
                      </td>
                      <td className="num-cell">
                        {c.marketCapCr ? fmtInt(Math.round(Number(c.marketCapCr))) : <span className="text-mute" title="Not available">n/a</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pager f={f} page={result.page} pages={result.pages} />
      </Panel>
    </div>
  );
}

function Pager({ f, page, pages }: { f: DirectoryFilters; page: number; pages: number }) {
  if (pages <= 1) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    if (f.q) sp.set("q", f.q);
    if (f.exchange) sp.set("exchange", f.exchange);
    if (f.segment) sp.set("segment", f.segment);
    if (f.status) sp.set("status", f.status);
    if (f.sector) sp.set("sector", f.sector);
    if (f.industryId) sp.set("industry", f.industryId);
    if (f.mcapMin !== undefined) sp.set("mcapMin", String(f.mcapMin));
    if (f.mcapMax !== undefined) sp.set("mcapMax", String(f.mcapMax));
    sp.set("page", String(p));
    return `/companies?${sp}`;
  };
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between border-t border-line px-3 py-2 text-[12px]">
      <span className="num text-mute">
        Page {page} of {pages}
      </span>
      <span className="flex gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className="border border-line px-2 py-0.5 hover:border-accent">
            ← Prev
          </Link>
        ) : (
          <Badge>start</Badge>
        )}
        {page < pages ? (
          <Link href={href(page + 1)} className="border border-line px-2 py-0.5 hover:border-accent">
            Next →
          </Link>
        ) : (
          <Badge>end</Badge>
        )}
      </span>
    </nav>
  );
}

function DirectorySkeleton() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Loading companies">
      <Skeleton className="h-[120px]" />
      <div className="border border-line">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="m-2 h-6" />
        ))}
      </div>
    </div>
  );
}
