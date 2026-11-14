import "server-only";
import { cacheLife } from "next/cache";
import { prisma } from "@/lib/db";
import { resultsDeadline } from "@/lib/domain/deadlines";
import { REACTION_DAYS, computeReaction } from "@/lib/domain/reaction";
import { dateArgs, sql, toDate } from "@/lib/queries/sql";
import { quarterBounds, quarterLabel, type Quarter } from "@/lib/domain/fiscal";
import { pctChange } from "@/lib/domain/growth";
import { isDemo } from "@/lib/env";
import { fetchDailyCandles, type Candle } from "@/lib/ingestion/upstox-candles";
import { UpstoxRateLimitError } from "@/lib/ingestion/upstox-fundamentals";

export const RESULTS_PAGE_SIZE = 50;
const DAY = 86_400_000;

type Metrics = { revenue?: number; operatingProfit?: number; netProfit?: number };

function toMetrics(rows: { key: string; value: unknown }[]): Metrics {
  const m: Metrics = {};
  for (const r of rows) {
    const v = Number(r.value);
    if (r.key === "revenue_from_operations") m.revenue = v;
    else if (r.key === "operating_profit") m.operatingProfit = v;
    else if (r.key === "net_profit") m.netProfit = v;
  }
  return m;
}


const latestRevision = { orderBy: { revision: "desc" as const }, take: 1, include: { metrics: { select: { key: true, value: true } } } };

// ---------------------------------------------------------------------------------------------
// Historical results (all companies, one quarter)
// ---------------------------------------------------------------------------------------------

export type ResultsSort = "revenue" | "net_profit" | "revenue_qoq" | "profit_qoq";

export async function resultQuarters() {
  const rows = await prisma.financialPeriod.groupBy({
    by: ["periodEnd", "fiscalYear", "fiscalPart"],
    where: { periodType: "QUARTER", company: { isDemo: isDemo() }, results: { some: {} } },
    _count: { _all: true },
    orderBy: { periodEnd: "desc" },
  });
  return rows.map((r) => ({
    periodEnd: r.periodEnd,
    key: r.periodEnd.toISOString().slice(0, 10),
    label: quarterLabel(r.fiscalYear, (r.fiscalPart ?? 1) as Quarter),
    companies: r._count._all,
  }));
}

export async function resultsForQuarter(args: { periodEnd: Date; sort: ResultsSort; page: number; q?: string }) {
  const prevEnd = new Date(Date.UTC(args.periodEnd.getUTCFullYear(), args.periodEnd.getUTCMonth() - 2, 0));
  const where = (end: Date) => ({
    periodType: "QUARTER" as const,
    periodEnd: end,
    company: { isDemo: isDemo(), ...(args.q ? { name: { contains: args.q } } : {}) },
  });
  const [cur, prev] = await Promise.all([
    prisma.financialPeriod.findMany({
      where: where(args.periodEnd),
      select: {
        companyId: true,
        company: { select: { name: true, slug: true, securities: { select: { exchange: true, symbol: true, scripCode: true, segment: true } } } },
        results: latestRevision,
      },
    }),
    prisma.financialPeriod.findMany({ where: where(prevEnd), select: { companyId: true, results: latestRevision } }),
  ]);
  const prevBy = new Map(prev.map((p) => [p.companyId, toMetrics(p.results[0]?.metrics ?? [])]));

  const rows = cur
    .filter((p) => p.results.length)
    .map((p) => {
      const m = toMetrics(p.results[0].metrics);
      const pm = prevBy.get(p.companyId) ?? {};
      return {
        name: p.company.name,
        slug: p.company.slug,
        nse: p.company.securities.find((s) => s.exchange === "NSE")?.symbol ?? null,
        bse: p.company.securities.find((s) => s.exchange === "BSE")?.scripCode ?? null,
        sme: p.company.securities.some((s) => s.segment === "SME"),
        basis: p.results[0].basis,
        revision: p.results[0].revision,
        ...m,
        revenueQoq: pctChange(m.revenue, pm.revenue),
        profitQoq: pctChange(m.netProfit, pm.netProfit),
      };
    });

  const key: Record<ResultsSort, (r: (typeof rows)[number]) => number | null | undefined> = {
    revenue: (r) => r.revenue,
    net_profit: (r) => r.netProfit,
    revenue_qoq: (r) => r.revenueQoq,
    profit_qoq: (r) => r.profitQoq,
  };
  const k = key[args.sort];
  rows.sort((a, b) => (k(b) ?? -Infinity) - (k(a) ?? -Infinity));

  const start = (args.page - 1) * RESULTS_PAGE_SIZE;
  return { total: rows.length, rows: rows.slice(start, start + RESULTS_PAGE_SIZE) };
}

// ---------------------------------------------------------------------------------------------
// One company
// ---------------------------------------------------------------------------------------------

export async function companyQuarters(companyId: string) {
  "use cache";
  cacheLife("hours"); // data changes once a day (sync); serve the cached copy, refresh hourly
  const periods = await prisma.financialPeriod.findMany({
    where: { companyId, periodType: "QUARTER", results: { some: {} } },
    orderBy: { periodEnd: "desc" },
    include: { results: latestRevision },
  });
  return periods.map((p, i) => {
    const m = toMetrics(p.results[0].metrics);
    const prev = periods[i + 1] ? toMetrics(periods[i + 1].results[0].metrics) : {};
    return {
      label: quarterLabel(p.fiscalYear, (p.fiscalPart ?? 1) as Quarter),
      periodEnd: p.periodEnd,
      basis: p.results[0].basis,
      revision: p.results[0].revision,
      fetchedAt: p.results[0].fetchedAt,
      ...m,
      opMargin: m.revenue && m.revenue > 0 && m.operatingProfit !== undefined ? (m.operatingProfit / m.revenue) * 100 : null,
      revenueQoq: pctChange(m.revenue, prev.revenue),
      profitQoq: pctChange(m.netProfit, prev.netProfit),
    };
  });
}

export async function companyUpcoming(companyId: string) {
  "use cache";
  cacheLife("hours"); // data changes once a day (sync); serve the cached copy, refresh hourly
  return prisma.upcomingResult.findFirst({ where: { companyId }, orderBy: { expectedDate: "asc" } });
}

export async function companyAnnouncements(companyId: string) {
  "use cache";
  cacheLife("hours"); // data changes once a day (sync); serve the cached copy, refresh hourly
  const rows = await prisma.earningsAnnouncement.findMany({ where: { companyId, version: "ORIGINAL" }, orderBy: { announcedAt: "asc" } });
  return firstPerQuarter(rows).slice(0, 12);
}

/** One year of daily candles from Upstox. Only successful responses are cached (for an hour). */
async function liveYearCandles(instrumentKey: string): Promise<Candle[]> {
  "use cache";
  cacheLife("hours");
  const token = process.env.UPSTOX_ANALYTICS_TOKEN;
  if (!token) return [];
  const to = new Date();
  // A throw here is not cached, so a rate-limited or failed request is retried on the next view.
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetchDailyCandles(token, instrumentKey, new Date(to.getTime() - 365 * DAY), to);
    } catch (e) {
      if (!(e instanceof UpstoxRateLimitError) || attempt >= 2) throw e;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
}

/**
 * Daily candles for a listing: live from Upstox, falling back to the bars the daily sync stored
 * (around each results announcement) when the live request fails.
 */
export async function priceHistory(instrumentKey: string, securityId: string): Promise<Candle[]> {
  try {
    return await liveYearCandles(instrumentKey);
  } catch {
    const rows = await prisma.historicalPrice.findMany({ where: { securityId }, orderBy: { date: "asc" } });
    return rows.map((r) => ({ date: r.date, open: Number(r.open), high: Number(r.high), low: Number(r.low), close: Number(r.close), volume: Number(r.volume) }));
  }
}

// ---------------------------------------------------------------------------------------------
// Upcoming results (statutory deadlines)
// ---------------------------------------------------------------------------------------------

export type UpcomingWindow = "overdue" | "today" | "week" | "all";

export async function upcomingResults(args: { window: UpcomingWindow; today: Date; page: number }) {
  const { today } = args;
  const tomorrow = new Date(today.getTime() + DAY);
  const range =
    args.window === "overdue"
      ? { lt: today }
      : args.window === "today"
        ? { gte: today, lt: tomorrow }
        : args.window === "week"
          ? { gte: today, lt: new Date(today.getTime() + 7 * DAY) }
          : undefined;
  const where = { company: { isDemo: isDemo() }, ...(range ? { expectedDate: range } : {}) };
  const [total, rows, counts] = await Promise.all([
    prisma.upcomingResult.count({ where }),
    prisma.upcomingResult.findMany({
      where,
      orderBy: [{ expectedDate: "asc" }, { company: { name: "asc" } }],
      skip: (args.page - 1) * RESULTS_PAGE_SIZE,
      take: RESULTS_PAGE_SIZE,
      include: { company: { select: { name: true, slug: true, securities: { select: { exchange: true, symbol: true, scripCode: true, segment: true } } } } },
    }),
    Promise.all([
      prisma.upcomingResult.count({ where: { company: { isDemo: isDemo() }, expectedDate: { lt: today } } }),
      prisma.upcomingResult.count({ where: { company: { isDemo: isDemo() }, expectedDate: { gte: today, lt: tomorrow } } }),
      prisma.upcomingResult.count({ where: { company: { isDemo: isDemo() }, expectedDate: { gte: today, lt: new Date(today.getTime() + 7 * DAY) } } }),
      prisma.upcomingResult.count({ where: { company: { isDemo: isDemo() } } }),
    ]),
  ]);
  return { total, rows, counts: { overdue: counts[0], today: counts[1], week: counts[2], all: counts[3] } };
}

// ---------------------------------------------------------------------------------------------
// Market reactions (detected announcements + stored candles)
// ---------------------------------------------------------------------------------------------

/** Keeps the first original announcement per company and quarter (standalone and consolidated are filed separately). */
function firstPerQuarter<T extends { companyId: string; periodEnd: Date; announcedAt: Date; sourceKey: string }>(rows: T[]): T[] {
  const best = new Map<string, T>();
  for (const r of rows) {
    const k = `${r.companyId}|${r.periodEnd.getTime()}`;
    const cur = best.get(k);
    const better =
      !cur ||
      (OFFICIAL_SOURCES.includes(r.sourceKey) && !OFFICIAL_SOURCES.includes(cur.sourceKey)) ||
      (OFFICIAL_SOURCES.includes(r.sourceKey) === OFFICIAL_SOURCES.includes(cur.sourceKey) && r.announcedAt < cur.announcedAt);
    if (better) best.set(k, r);
  }
  return [...best.values()].sort((a, b) => b.announcedAt.getTime() - a.announcedAt.getTime());
}

export type ReactionSort = "gain" | "fall" | "latest";

/**
 * Every company that announced results for one quarter, with the exact announcement time and the
 * share-price change on the results day and 1, 3, 5 and 7 trading days later (from stored daily bars).
 */
export async function reactionsForQuarter(args: { fy: number; q: Quarter; sort: ReactionSort; page: number; today: Date }) {
  "use cache";
  cacheLife("hours"); // data changes once a day (sync); serve the cached copy, refresh hourly
  const periodEnd = quarterBounds(args.fy, args.q).end;
  const demo = isDemo() ? 1 : 0;
  const pe = dateArgs(periodEnd);
  const annFilter = `a.version = 'ORIGINAL' AND a.periodType = 'QUARTER' AND a.periodEnd IN (?, ?)`;
  const anns = firstPerQuarter(
    (
      await sql<{ id: string; companyId: string; exchange: string; announcedAt: unknown; periodEnd: unknown; sourceKey: string; name: string; slug: string }>(
        `SELECT a.id AS id, a.companyId AS companyId, a.exchange AS exchange, a.announcedAt AS announcedAt, a.periodEnd AS periodEnd,
                a.sourceKey AS sourceKey, c.name AS name, c.slug AS slug
           FROM earnings_announcements a JOIN companies c ON c.id = a.companyId
          WHERE c.isDemo = ? AND ${annFilter}`,
        demo,
        ...pe,
      )
    ).map((a) => ({ ...a, announcedAt: toDate(a.announcedAt), periodEnd: toDate(a.periodEnd) })),
  );
  const secs = await sql<{ id: string; companyId: string; exchange: string; symbol: string | null; scripCode: string | null; segment: string }>(
    `SELECT s.id AS id, s.companyId AS companyId, s.exchange AS exchange, s.symbol AS symbol, s.scripCode AS scripCode, s.segment AS segment
       FROM securities s WHERE s.companyId IN (SELECT a.companyId FROM earnings_announcements a WHERE ${annFilter})`,
    ...pe,
  );
  const secsBy = new Map<string, typeof secs>();
  for (const x of secs) secsBy.set(x.companyId, [...(secsBy.get(x.companyId) ?? []), x]);
  const secOf = (a: (typeof anns)[number]) => {
    const l = secsBy.get(a.companyId) ?? [];
    return l.find((x) => x.exchange === a.exchange) ?? l[0];
  };
  // Daily bars for the announcing listing of each company, from 20 days before the first announcement.
  const from = new Date(Math.min(...anns.map((a) => a.announcedAt.getTime()), Date.now()) - 20 * DAY);
  const [fromIso, fromMs] = dateArgs(from);
  const prices = await sql<{ securityId: string; date: unknown; close: unknown }>(
    `SELECT hp.securityId AS securityId, hp.date AS date, hp.close AS close FROM historical_prices hp
      WHERE hp.securityId IN (SELECT s.id FROM securities s JOIN earnings_announcements a ON a.companyId = s.companyId AND a.exchange = s.exchange WHERE ${annFilter})
        AND ((typeof(hp.date) = 'text' AND hp.date >= ?) OR (typeof(hp.date) = 'integer' AND hp.date >= ?))
      ORDER BY hp.date`,
    ...pe,
    fromIso,
    fromMs,
  );
  const bySec = new Map<string, { date: Date; close: number }[]>();
  for (const p of prices) {
    const l = bySec.get(p.securityId) ?? [];
    l.push({ date: toDate(p.date), close: Number(p.close) });
    bySec.set(p.securityId, l);
  }

  const rows = anns.map((a) => {
    const sec = secOf(a);
    const r = computeReaction((sec && bySec.get(sec.id)) ?? [], a.announcedAt);
    const pt = (d: number) => r?.points.find((p) => p.day === d) ?? null;
    return {
      id: a.id,
      name: a.name,
      slug: a.slug,
      symbol: sec?.symbol ?? sec?.scripCode ?? null,
      sme: sec?.segment === "SME",
      announcedAt: a.announcedAt,
      official: OFFICIAL_SOURCES.includes(a.sourceKey),
      baseClose: r?.base.close ?? null,
      days: REACTION_DAYS.map((d) => pt(d)),
    };
  });

  // Rank and count by the total move from the price before to the day-1 close: that captures the reaction whether
  // results came before, during or after market hours.
  const d1 = (r: (typeof rows)[number]) => r.days[REACTION_DAYS.indexOf(1)]?.cumulativePct ?? null;
  const measured = rows.filter((r) => d1(r) !== null);
  const unmeasured = rows.filter((r) => d1(r) === null);
  if (args.sort === "latest") rows.sort((a, b) => b.announcedAt.getTime() - a.announcedAt.getTime());
  const ordered =
    args.sort === "latest"
      ? rows
      : [...measured.sort((a, b) => (args.sort === "gain" ? d1(b)! - d1(a)! : d1(a)! - d1(b)!)), ...unmeasured.sort((a, b) => b.announcedAt.getTime() - a.announcedAt.getTime())];

  const start = (args.page - 1) * RESULTS_PAGE_SIZE;
  return {
    periodEnd,
    deadline: resultsDeadline(periodEnd),
    ended: periodEnd.getTime() < args.today.getTime(),
    total: rows.length,
    measured: measured.length,
    up: measured.filter((r) => d1(r)! > 0).length,
    down: measured.filter((r) => d1(r)! < 0).length,
    rows: ordered.slice(start, start + RESULTS_PAGE_SIZE),
  };
}

/** Latest completed import/sync run of each job, for freshness notes. */
export async function lastSync() {
  return prisma.ingestionLog.findFirst({ where: { job: "sync:upstox", status: { in: ["SUCCEEDED", "PARTIAL"] } }, orderBy: { startedAt: "desc" } });
}

// ---------------------------------------------------------------------------------------------
// Quarter hub: Q1–Q4 of one fiscal year
// ---------------------------------------------------------------------------------------------

const OFFICIAL_SOURCES = ["nse-financial-results"];

/** Best-known announcement time per company for one quarter: official NSE broadcast first, else detected. */
async function announcementTimes(periodEnd: Date, companyIds?: string[]) {
  const anns = await prisma.earningsAnnouncement.findMany({
    where: { periodEnd, periodType: "QUARTER", version: "ORIGINAL", ...(companyIds ? { companyId: { in: companyIds } } : {}) },
    select: { companyId: true, announcedAt: true, sourceKey: true },
    orderBy: { announcedAt: "asc" },
  });
  const out = new Map<string, { at: Date; official: boolean }>();
  for (const a of anns) {
    const official = OFFICIAL_SOURCES.includes(a.sourceKey);
    const cur = out.get(a.companyId);
    if (!cur || (official && !cur.official)) out.set(a.companyId, { at: a.announcedAt, official });
  }
  return out;
}

export interface HubRow {
  slug: string;
  name: string;
  symbol: string | null;
  sme: boolean;
  revenue?: number;
  netProfit?: number;
  revenueQoq: number | null;
  profitQoq: number | null;
  announcedAt: Date | null;
  officialDate: boolean;
  /** Price change on the results day and 1, 3, 5, 7 trading days after, sequential (null = not yet / no session). */
  days: ({ day: number; date: Date; close: number; change: number; changePct: number; cumulativePct: number } | null)[];
  baseClose: number | null;
}

export async function quarterHub(args: { fy: number; q: Quarter; today: Date; page: number }) {
  "use cache";
  cacheLife("hours"); // data changes once a day (sync); serve the cached copy, refresh hourly
  const periodEnd = quarterBounds(args.fy, args.q).end;
  const prevEnd = new Date(Date.UTC(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth() - 2, 0));
  const ended = periodEnd.getTime() < args.today.getTime();
  const deadline = resultsDeadline(periodEnd);
  const demo = isDemo();
  const secSel = { select: { id: true, exchange: true, symbol: true, scripCode: true, segment: true } };
  const ident = (c: { securities: { exchange: string; symbol: string | null; scripCode: string | null; segment: string }[] }) => ({
    symbol: c.securities.find((s) => s.exchange === "NSE")?.symbol ?? c.securities.find((s) => s.exchange === "BSE")?.scripCode ?? null,
    sme: c.securities.some((s) => s.segment === "SME"),
  });

  // ---- Announced: good results = revenue and net profit both up QoQ ----
  // One query for both quarters' figures; the latest revision of each statement wins.
  const figures = await sql<{ companyId: string; periodEnd: unknown; revision: unknown; key: string; value: unknown }>(
    `SELECT fp.companyId AS companyId, fp.periodEnd AS periodEnd, qr.revision AS revision, m.key AS key, m.value AS value
       FROM financial_periods fp
       JOIN companies c ON c.id = fp.companyId
       JOIN quarterly_results qr ON qr.periodId = fp.id
       JOIN financial_metrics m ON m.resultId = qr.id
      WHERE fp.periodType = 'QUARTER' AND c.isDemo = ? AND fp.periodEnd IN (?, ?, ?, ?)`,
    demo ? 1 : 0,
    ...dateArgs(periodEnd),
    ...dateArgs(prevEnd),
  );
  const latestRev = new Map<string, { rev: number; rows: { key: string; value: unknown }[] }>();
  for (const f of figures) {
    const k = `${f.companyId}|${toDate(f.periodEnd).getTime()}`;
    const rev = Number(f.revision);
    const cur = latestRev.get(k);
    if (!cur || rev > cur.rev) latestRev.set(k, { rev, rows: [{ key: f.key, value: f.value }] });
    else if (rev === cur.rev) cur.rows.push({ key: f.key, value: f.value });
  }
  const curBy = new Map<string, Metrics>();
  const prevBy = new Map<string, Metrics>();
  for (const [k, v] of latestRev) {
    const [companyId, t] = k.split("|");
    (Number(t) === periodEnd.getTime() ? curBy : prevBy).set(companyId, toMetrics(v.rows));
  }
  const good = [...curBy]
    .map(([companyId, m]) => {
      const pm = prevBy.get(companyId) ?? {};
      const profitIncrease = m.netProfit !== undefined && pm.netProfit !== undefined ? m.netProfit - pm.netProfit : null;
      return { companyId, m, profitIncrease, revenueQoq: pctChange(m.revenue, pm.revenue), profitQoq: pctChange(m.netProfit, pm.netProfit) };
    })
    .filter((r) => (r.revenueQoq ?? -1) > 0 && (r.profitQoq ?? -1) > 0)
    // Rank by the rupee increase in net profit, so tiny bases (₹0.1 cr → ₹5 cr = +4,900%) do not crowd out real results.
    .sort((a, b) => (b.profitIncrease ?? 0) - (a.profitIncrease ?? 0));
  const start = (args.page - 1) * RESULTS_PAGE_SIZE;
  const goodSlice = good.slice(start, start + RESULTS_PAGE_SIZE);
  const goodCos = new Map(
    (await prisma.company.findMany({ where: { id: { in: goodSlice.map((g) => g.companyId) } }, select: { id: true, name: true, slug: true, securities: secSel } })).map((c) => [c.id, c]),
  );
  const goodPage = goodSlice.flatMap((g) => {
    const c = goodCos.get(g.companyId);
    return c ? [{ ...g, c }] : [];
  });
  const times = await announcementTimes(periodEnd, goodPage.map((g) => g.companyId));
  // Price reaction for the listed companies, from the stored daily bars (NSE listing preferred).
  const priceSec = new Map(goodPage.map((g) => [g.companyId, (g.c.securities.find((s) => s.exchange === "NSE") ?? g.c.securities[0])?.id]));
  const firstAt = Math.min(...[...times.values()].map((t) => t.at.getTime()), Date.now());
  const bars = await prisma.historicalPrice.findMany({
    where: { securityId: { in: [...priceSec.values()].filter(Boolean) as string[] }, date: { gte: new Date(firstAt - 20 * DAY) } },
    orderBy: { date: "asc" },
    select: { securityId: true, date: true, close: true },
  });
  const barsBy = new Map<string, { date: Date; close: number }[]>();
  for (const b of bars) {
    const l = barsBy.get(b.securityId) ?? [];
    l.push({ date: b.date, close: Number(b.close) });
    barsBy.set(b.securityId, l);
  }
  const goodRows: HubRow[] = goodPage.map((g) => {
    const t = times.get(g.companyId);
    const sid = priceSec.get(g.companyId);
    const r = t && sid ? computeReaction(barsBy.get(sid) ?? [], t.at) : null;
    return {
      slug: g.c.slug,
      name: g.c.name,
      ...ident(g.c),
      revenue: g.m.revenue,
      netProfit: g.m.netProfit,
      revenueQoq: g.revenueQoq,
      profitQoq: g.profitQoq,
      announcedAt: t?.at ?? null,
      officialDate: t?.official ?? false,
      days: REACTION_DAYS.map((d) => r?.points.find((p) => p.day === d) ?? null),
      baseClose: r?.base.close ?? null,
    };
  });

  // ---- Upcoming: latest reported quarter is the one before this quarter ----
  const pendingAll = await sql<{ id: string; name: string; slug: string }>(
    `SELECT c.id AS id, c.name AS name, c.slug AS slug FROM companies c
      WHERE c.isDemo = ? AND c.id IN (
        SELECT fp.companyId FROM financial_periods fp
         WHERE fp.periodType = 'QUARTER' AND EXISTS (SELECT 1 FROM quarterly_results qr WHERE qr.periodId = fp.id)
         GROUP BY fp.companyId HAVING MAX(fp.periodEnd) IN (?, ?))
      ORDER BY c.name`,
    demo ? 1 : 0,
    ...dateArgs(prevEnd),
  );
  const officials = await prisma.upcomingResult.findMany({
    where: { status: "OFFICIAL", fiscalYear: args.fy, periodType: "QUARTER", fiscalPart: args.q },
    select: { companyId: true, expectedDate: true },
  });
  const officialBy = new Map(officials.map((o) => [o.companyId, o.expectedDate]));
  const pendingSorted = pendingAll
    .map((c) => ({ ...c, meetingDate: officialBy.get(c.id) ?? null }))
    .sort((a, b) => (a.meetingDate?.getTime() ?? Infinity) - (b.meetingDate?.getTime() ?? Infinity) || a.name.localeCompare(b.name));
  const shown = pendingSorted.slice(0, RESULTS_PAGE_SIZE);
  const shownSecs = new Map(
    (await prisma.company.findMany({ where: { id: { in: shown.map((c) => c.id) } }, select: { id: true, securities: secSel } })).map((c) => [c.id, c]),
  );
  const upcoming = shown.map((c) => ({ slug: c.slug, name: c.name, ...ident(shownSecs.get(c.id) ?? { securities: [] }), meetingDate: c.meetingDate }));

  return {
    periodEnd,
    ended,
    deadline,
    announcedCount: curBy.size,
    goodCount: good.length,
    good: goodRows,
    upcomingCount: pendingAll.length,
    upcoming,
    officialCount: pendingSorted.filter((c) => c.meetingDate).length,
  };
}

/** Every quarter with a known announcement time for one company, newest first. */
export async function companyResultDates(companyId: string) {
  "use cache";
  cacheLife("hours"); // data changes once a day (sync); serve the cached copy, refresh hourly
  const anns = await prisma.earningsAnnouncement.findMany({
    where: { companyId, periodType: "QUARTER", version: "ORIGINAL" },
    select: { fiscalYear: true, fiscalPart: true, periodEnd: true, announcedAt: true, sourceKey: true },
    orderBy: { announcedAt: "asc" },
  });
  const byPeriod = new Map<number, { fy: number; q: Quarter; periodEnd: Date; at: Date; official: boolean }>();
  for (const a of anns) {
    const official = OFFICIAL_SOURCES.includes(a.sourceKey);
    const k = a.periodEnd.getTime();
    const cur = byPeriod.get(k);
    if (!cur || (official && !cur.official)) byPeriod.set(k, { fy: a.fiscalYear, q: (a.fiscalPart ?? 1) as Quarter, periodEnd: a.periodEnd, at: a.announcedAt, official });
  }
  return [...byPeriod.values()].sort((a, b) => b.periodEnd.getTime() - a.periodEnd.getTime());
}
