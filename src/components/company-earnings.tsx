import { Cr, Pct, SourceNote } from "./earnings-ui";
import { DataUnavailable, Panel, fmtDate, fmtDateTimeIst } from "./ui";
import { daysFromDeadline } from "@/lib/domain/deadlines";
import { fiscalQuarterOf, fiscalYearOf } from "@/lib/domain/fiscal";
import { REACTION_DAYS, computeReaction, reactionDayLabel } from "@/lib/domain/reaction";
import type { Candle } from "@/lib/ingestion/upstox-candles";
import type { companyAnnouncements, companyQuarters } from "@/lib/queries/earnings";

type Quarters = Awaited<ReturnType<typeof companyQuarters>>;
type Announcements = Awaited<ReturnType<typeof companyAnnouncements>>;

type NextResults = {
  label: string;
  deadline: Date | null;
  status: "OFFICIAL" | "ESTIMATED" | "UNKNOWN";
};

export function nextResultsText(upcoming: NextResults, today: Date): string {
  if (!upcoming.deadline) return "Date not available";

  const date = fmtDate(upcoming.deadline);
  const days = daysFromDeadline(upcoming.deadline, today);
  if (upcoming.status === "OFFICIAL") {
    if (days > 0) return `NSE board meeting was ${date}`;
    if (days === 0) return `NSE board meeting is today (${date})`;
    return `NSE board meeting scheduled for ${date}`;
  }
  if (upcoming.status !== "ESTIMATED") return "Date not confirmed";
  if (days > 0) {
    const ago = `${days} ${days === 1 ? "day" : "days"} ago`;
    return `SEBI filing deadline passed ${date} (${ago}); results are not in our data yet`;
  }
  if (days === 0) return `SEBI filing deadline is today (${date})`;
  return `SEBI filing deadline ${date}; results may be announced earlier`;
}

export function AnnouncementsPanel({ items, upcoming, today }: { items: Announcements; upcoming: NextResults | null; today: Date }) {
  return (
    <Panel title="Results timeline">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[12px]">
        <dt className="text-mute">Results status</dt>
        <dd>
          {upcoming ? `${upcoming.label}: ${nextResultsText(upcoming, today)}` : <span className="text-mute">Not due yet: the current quarter has not ended</span>}
        </dd>
      </dl>
      {items.length > 0 ? (
        <ul className="mt-3 grid gap-1.5 border-t border-line pt-2 text-[12px]">
          {items.map((a) => (
            <li key={a.id} className="flex flex-wrap justify-between gap-2">
              <span>
                Q{a.fiscalPart} FY {a.fiscalYear - 1}-{String(a.fiscalYear % 100).padStart(2, "0")} results
              </span>
              <span className="num text-mute" title={a.subject ?? undefined}>
                detected {fmtDateTimeIst(a.announcedAt)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 border-t border-line pt-2 text-[11px] text-mute">
          New results will be listed here when the daily sync detects them. Exact exchange announcement times are not
          available from the current data source.
        </p>
      )}
    </Panel>
  );
}

const nf = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** One-year daily close chart (server-rendered SVG), with markers on detected results dates. */
export function PriceChartPanel({ candles, markers, label }: { candles: Candle[]; markers: Date[]; label: string }) {
  if (candles.length < 2) {
    return (
      <Panel title="Share price (1 year)">
        <DataUnavailable title="No price history available">The data provider returned no daily prices for this listing.</DataUnavailable>
      </Panel>
    );
  }
  const W = 640;
  const H = 180;
  const P = 4;
  const closes = candles.map((c) => c.close);
  const lo = Math.min(...closes);
  const hi = Math.max(...closes);
  const t0 = candles[0].date.getTime();
  const t1 = candles[candles.length - 1].date.getTime();
  const x = (t: number) => P + ((t - t0) / (t1 - t0 || 1)) * (W - 2 * P);
  const y = (v: number) => P + (1 - (v - lo) / (hi - lo || 1)) * (H - 2 * P);
  const path = candles.map((c, i) => `${i ? "L" : "M"}${x(c.date.getTime()).toFixed(1)},${y(c.close).toFixed(1)}`).join("");
  const last = candles[candles.length - 1];
  const first = candles[0];
  const change = ((last.close - first.close) / first.close) * 100;

  return (
    <Panel
      title="Share price (1 year)"
      meta={
        <span className="num">
          {label} · ₹{nf.format(last.close)} · <Pct v={change} title="Change over the period shown" />
        </span>
      }
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-full" role="img" aria-label={`Daily closing price over one year, from ₹${nf.format(first.close)} to ₹${nf.format(last.close)}`}>
        {markers
          .filter((m) => m.getTime() >= t0 && m.getTime() <= t1)
          .map((m) => (
            <line key={m.toISOString()} x1={x(m.getTime())} x2={x(m.getTime())} y1={0} y2={H} className="stroke-warn" strokeDasharray="3 3" strokeWidth={1} />
          ))}
        <path d={path} fill="none" className={change >= 0 ? "stroke-up" : "stroke-down"} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-mute">
        <span className="num">{fmtDate(first.date)}</span>
        <span className="num">
          low ₹{nf.format(lo)} · high ₹{nf.format(hi)}
        </span>
        <span className="num">{fmtDate(last.date)}</span>
      </div>
      <p className="mt-1 text-[11px] text-mute">
        Unadjusted daily closes from Upstox (splits and bonuses not adjusted). Dashed lines mark detected results.
      </p>
    </Panel>
  );
}

const inr = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export interface ResultDate {
  fy: number;
  q: number;
  periodEnd: Date;
  at: Date;
  official: boolean;
}

/**
 * One row per past quarter: the results (revenue, profit, growth) and the share-price move
 * on the results day and 1, 3, 5 and 7 trading days after (sequential changes).
 */
export function ResultsHistoryPanel({
  quarters,
  dates,
  candles,
  selected,
}: {
  quarters: Quarters;
  dates: ResultDate[];
  candles: Candle[];
  selected?: string;
}) {
  const dateBy = new Map(dates.map((d) => [d.periodEnd.getTime(), d]));
  const finBy = new Map(quarters.map((q) => [q.periodEnd.getTime(), q]));
  const periods = [...new Set([...finBy.keys(), ...dateBy.keys()])].sort((x, y) => y - x).slice(0, 8);

  return (
    <section id="reaction" className="scroll-mt-28">
      <Panel title="Results history and price impact" meta="₹ crore · price change on results day, then 1 · 3 · 5 · 7 days" bodyClassName="p-0">
        {periods.length === 0 ? (
          <div className="p-3">
            <DataUnavailable title="No quarterly results available">The data provider has no reported quarters for this company.</DataUnavailable>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th rowSpan={2}>Quarter</th>
                  <th colSpan={4} className="border-r border-line text-center">Results</th>
                  <th colSpan={6} className="text-center">Share price after the announcement</th>
                </tr>
                <tr>
                  <th className="num-cell">Revenue</th>
                  <th className="num-cell">Growth</th>
                  <th className="num-cell">Net profit</th>
                  <th className="num-cell border-r border-line">Growth</th>
                  <th>Announced</th>
                  <th className="num-cell">Price before</th>
                  {REACTION_DAYS.map((d) => (
                    <th key={d} className="num-cell">
                      {reactionDayLabel(d)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {periods.map((t) => {
                  const f = finBy.get(t);
                  const d = dateBy.get(t);
                  const end = new Date(t);
                  const fy = d?.fy ?? fiscalYearOf(end);
                  const q = d?.q ?? fiscalQuarterOf(end);
                  const r = d ? computeReaction(candles, d.at) : null;
                  const isSel = selected === `${fy}-${q}`;
                  return (
                    <tr key={t} className={isSel ? "bg-raised" : undefined}>
                      <td className="whitespace-nowrap">
                        <span className="font-medium">
                          Quarter {q} {fy}
                        </span>
                        <div className="text-[10.5px] text-mute">
                          ended {fmtDate(end)}
                          {f && f.revision > 0 && <span className="ml-1 text-warn" title="Figures revised after first publication">rev {f.revision}</span>}
                        </div>
                      </td>
                      <td className="num-cell"><Cr v={f?.revenue} /></td>
                      <td className="num-cell">{f ? <Pct v={f.revenueQoq} /> : <span className="text-mute">—</span>}</td>
                      <td className="num-cell"><Cr v={f?.netProfit} /></td>
                      <td className="num-cell border-r border-line">{f ? <Pct v={f.profitQoq} /> : <span className="text-mute">—</span>}</td>
                      <td className="num whitespace-nowrap text-[11px] text-mute" title={d ? (d.official ? "NSE dissemination time" : "When the daily sync first saw the figures") : undefined}>
                        {d ? (
                          <>
                            {fmtDateTimeIst(d.at)}
                            {!d.official && " *"}
                          </>
                        ) : (
                          "date not known"
                        )}
                      </td>
                      <td className="num-cell">{r ? `₹${inr.format(r.base.close)}` : <span className="text-mute">—</span>}</td>
                      {REACTION_DAYS.map((day) => {
                        const p = r?.points.find((x) => x.day === day);
                        return (
                          <td key={day} className="num-cell" title={p ? `${fmtDate(p.date)}: ₹${inr.format(p.close)} · total since price before ${p.cumulativePct >= 0 ? "+" : ""}${p.cumulativePct.toFixed(1)}%` : undefined}>
                            {p ? (
                              <>
                                <Pct v={p.changePct} />
                                <div className="text-[10.5px] text-mute">
                                  {p.change >= 0 ? "+" : "−"}₹{inr.format(Math.abs(p.change))}
                                </div>
                              </>
                            ) : (
                              <span className="text-mute">{!r ? "—" : day === 0 && r.points.length ? "market closed" : "not yet"}</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <SourceNote>
          Results: {quarters[0]?.basis === "STANDALONE" ? "standalone" : "consolidated where available"} figures from the Upstox
          Company Fundamentals API; growth is against the previous quarter. Price before = last close before the announcement
          date. Results day = the session on the announcement date (if results came after 3:30 PM, the reaction shows on
          day 1). Each price column compares with the column before it: results day vs the price before, then 1 day vs results day, 3 days vs 1 day, 5 days vs 3 days, 7 days vs 5 days. Hover a cell for the total change since the price before. Unadjusted Upstox daily prices. Announcement times are from NSE; * = time our daily sync first saw the figures.
          Past moves do not predict future ones.
        </SourceNote>
      </Panel>
    </section>
  );
}
