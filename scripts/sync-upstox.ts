/**
 * Daily Upstox sync (run after market close):
 *
 *   npm run sync                       # everything
 *   npm run sync -- --limit 50         # first 50 companies only (testing)
 *   npm run sync -- --skip-prices
 *   npm run sync -- --upcoming-only    # recompute pending results from stored data, no API calls
 *   npm run sync -- --missing          # only companies with no figures yet (retry failures)
 *   npm run sync -- --rps 2            # request rate ceiling (default 3/s; Upstox blocks bursts)
 *
 * 1. Quarterly fundamentals for every live company (consolidated, falling back to standalone).
 *    New periods are inserted; changed figures become a new revision (never overwritten).
 * 2. Detection: a quarter that appears for a company that was already synced before is recorded
 *    as an earnings announcement with sourceKey "upstox-detected". Its timestamp is when this
 *    sync first saw the figures, which can lag the real exchange announcement by up to a day.
 * 3. Upcoming results: the next quarter each company owes and its SEBI LODR Reg 33 deadline.
 * 4. Daily candles around each detected announcement, for Market Reactions.
 *
 * Licence: personal Upstox Analytics token. Pages only render this data publicly when
 * PUBLIC_DISPLAY_UPSTOX=true (see DATA_SOURCES.md).
 */
import { randomUUID } from "node:crypto";
import type { ExchangeCode, Prisma } from "@prisma/client";
import { istToday, pendingResults } from "../src/lib/domain/deadlines";
import { fiscalQuarterOf, fiscalYearOf, quarterBounds } from "../src/lib/domain/fiscal";
import {
  fetchQuarterlyIncome,
  UpstoxRateLimitError,
  type Basis,
  type QuarterRow,
} from "../src/lib/ingestion/upstox-fundamentals";
import { fetchDailyCandles } from "../src/lib/ingestion/upstox-candles";
import { createPrismaClient } from "../src/lib/prisma-client";
import { ensureReferenceData } from "./lib/reference";

const prisma = createPrismaClient();
const FUND_KEY = "upstox-fundamentals";
const DETECT_KEY = "upstox-detected";
const PRICE_KEY = "upstox-candles-v3";
const DAY = 86_400_000;

const argv = process.argv.slice(2);
const opt = (n: string) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const LIMIT = opt("limit") ? Number(opt("limit")) : undefined;
const CONCURRENCY = Number(opt("concurrency") ?? 3);

const token = process.env.UPSTOX_ANALYTICS_TOKEN;
if (!token) {
  console.error("UPSTOX_ANALYTICS_TOKEN is not set (.env).");
  process.exit(2);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Upstox (behind Cloudflare) blocks the whole IP for a while when requests come too fast, which
// also breaks live prices on the website. Keep a global ceiling on request rate.
const RPS = Number(opt("rps") ?? 3);
let nextSlot = 0;
async function throttle() {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + 1000 / RPS;
  if (wait) await sleep(wait);
}

/** Retries on 429 with growing waits; other errors propagate. */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      await throttle();
      return await fn();
    } catch (e) {
      if (!(e instanceof UpstoxRateLimitError) || attempt >= 6) throw e;
      const wait = 15_000 * (attempt + 1);
      process.stdout.write(`\n  rate-limited, waiting ${wait / 1000}s…`);
      await sleep(wait);
    }
  }
}

async function pool<T>(items: T[], n: number, fn: (item: T, i: number) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < items.length) {
        const i = next++;
        await fn(items[i], i);
      }
    }),
  );
}

const same = (a: number, b: number) => Math.abs(a - b) < 0.005;

async function main() {
  const startedAt = new Date();
  const fundSrc = await ensureReferenceData(prisma, {
    key: FUND_KEY,
    name: "Upstox Company Fundamentals API (quarterly income statement)",
    homepage: "https://upstox.com/developer/api-documentation/get-income-statement",
    licenceNotes: "Personal Analytics token. Public display UNCONFIRMED: gated by PUBLIC_DISPLAY_UPSTOX.",
    publicDisplay: false,
    isDemo: false,
  });
  const log = await prisma.ingestionLog.create({ data: { dataSourceId: fundSrc.id, job: "sync:upstox", status: "RUNNING", inputRef: LIMIT ? `limit=${LIMIT}` : "all" } });
  const errors: string[] = [];
  let inserted = 0;
  let updated = 0;

  try {
    // ---- Companies and existing state ----
    const companies = await prisma.company.findMany({
      where: { isDemo: false, securities: { some: { status: "ACTIVE" } } },
      select: { id: true, isin: true, name: true, fyEndMonth: true, securities: { select: { id: true, exchange: true, status: true } } },
      orderBy: { name: "asc" },
      take: LIMIT,
    });
    const existing = await prisma.quarterlyResult.findMany({
      where: { sourceKey: FUND_KEY, period: { companyId: { in: companies.map((c) => c.id) } } },
      select: { revision: true, basis: true, period: { select: { id: true, companyId: true, periodEnd: true } }, metrics: { select: { key: true, value: true } } },
    });
    const periodId = new Map<string, string>(); // companyId|periodEnd → period id
    const latest = new Map<string, { revision: number; metrics: Map<string, number> }>(); // companyId|periodEnd|basis
    const maxEnd = new Map<string, number>(); // companyId → newest stored periodEnd
    for (const r of existing) {
      const pk = `${r.period.companyId}|${r.period.periodEnd.getTime()}`;
      periodId.set(pk, r.period.id);
      const k = `${pk}|${r.basis}`;
      const cur = latest.get(k);
      if (!cur || r.revision > cur.revision) latest.set(k, { revision: r.revision, metrics: new Map(r.metrics.map((m) => [m.key, Number(m.value)])) });
      maxEnd.set(r.period.companyId, Math.max(maxEnd.get(r.period.companyId) ?? 0, r.period.periodEnd.getTime()));
    }
    console.log(`${companies.length} companies; ${existing.length} stored results; ${maxEnd.size} companies synced before`);

    // ---- 1+2. Fundamentals ----
    const periods: Prisma.FinancialPeriodCreateManyInput[] = [];
    const results: Prisma.QuarterlyResultCreateManyInput[] = [];
    const metrics: Prisma.FinancialMetricCreateManyInput[] = [];
    const announcements: Prisma.EarningsAnnouncementCreateManyInput[] = [];
    const latestByCompany = new Map<string, Date>();
    const fetchedAt = new Date();
    let done = 0;
    const upcomingOnly = argv.includes("--upcoming-only");
    if (upcomingOnly) for (const [id, t] of maxEnd) latestByCompany.set(id, new Date(t));

    const BATCH = 500;
    const chunk = <T,>(xs: T[]) => Array.from({ length: Math.ceil(xs.length / BATCH) }, (_, k) => xs.slice(k * BATCH, (k + 1) * BATCH));
    const write = async <T,>(rows: T[], fn: (data: T[]) => Prisma.PrismaPromise<unknown>, label: string) => {
      const ops = chunk(rows).map(fn);
      for (let i = 0; i < ops.length; i += 20) await prisma.$transaction(ops.slice(i, i + 20));
      console.log(`${label}: ${rows.length}`);
    };
    const totals = { periods: 0, results: 0, announcements: 0 };
    /** Saves one chunk of companies atomically, so an interrupted run keeps everything before the last chunk. */
    const flush = async () => {
      const ops = [
        ...chunk(periods).map((data) => prisma.financialPeriod.createMany({ data })),
        ...chunk(results).map((data) => prisma.quarterlyResult.createMany({ data })),
        ...chunk(metrics).map((data) => prisma.financialMetric.createMany({ data })),
        ...chunk(announcements).map((data) => prisma.earningsAnnouncement.createMany({ data })),
      ];
      if (ops.length) await prisma.$transaction(ops);
      totals.periods += periods.length;
      totals.results += results.length;
      totals.announcements += announcements.length;
      periods.length = results.length = metrics.length = announcements.length = 0;
    };

    // --missing: only companies with no stored figures yet (e.g. to retry failures of the last run).
    const todo = upcomingOnly ? [] : argv.includes("--missing") ? companies.filter((c) => !maxEnd.has(c.id)) : companies;
    if (argv.includes("--missing")) console.log(`retrying ${todo.length} companies without figures`);
    const SAVE_EVERY = 200;
    for (let start = 0; start < todo.length; start += SAVE_EVERY) {
    await pool(todo.slice(start, start + SAVE_EVERY), CONCURRENCY, async (c) => {
      let rows: QuarterRow[] = [];
      let basis: Basis = "CONSOLIDATED";
      try {
        rows = await withRetry(() => fetchQuarterlyIncome(token!, c.isin, "CONSOLIDATED"));
        if (!rows.length) {
          basis = "STANDALONE";
          rows = await withRetry(() => fetchQuarterlyIncome(token!, c.isin, "STANDALONE"));
        }
      } catch (e) {
        errors.push(`${c.isin} ${c.name}: ${(e as Error).message}`);
      }
      if (++done % 100 === 0 || done === todo.length) process.stdout.write(`\rfundamentals ${done}/${todo.length}`);
      if (!rows.length) return;

      latestByCompany.set(c.id, rows[0].periodEnd);
      const syncedBefore = maxEnd.has(c.id);
      const exchange: ExchangeCode = c.securities.some((s) => s.exchange === "NSE" && s.status === "ACTIVE") ? "NSE" : "BSE";

      for (const q of rows) {
        const keys = Object.keys(q.metrics);
        if (!keys.length) continue;
        const pk = `${c.id}|${q.periodEnd.getTime()}`;
        let pid = periodId.get(pk);
        if (!pid) {
          pid = randomUUID();
          periodId.set(pk, pid);
          const b = quarterBounds(q.fiscalYear, q.fiscalQuarter, c.fyEndMonth);
          periods.push({ id: pid, companyId: c.id, periodType: "QUARTER", fiscalYear: q.fiscalYear, fiscalPart: q.fiscalQuarter, periodStart: b.start, periodEnd: q.periodEnd });
          if (syncedBefore && q.periodEnd.getTime() > maxEnd.get(c.id)!) {
            announcements.push({
              companyId: c.id,
              exchange,
              fiscalYear: q.fiscalYear,
              periodType: "QUARTER",
              fiscalPart: q.fiscalQuarter,
              periodEnd: q.periodEnd,
              announcedAt: fetchedAt,
              timing: "UNKNOWN",
              basis,
              subject: "Detected: new quarterly figures first appeared in the Upstox fundamentals feed",
              sourceKey: DETECT_KEY,
              fetchedAt,
            });
          }
        }
        const prev = latest.get(`${pk}|${basis}`);
        if (prev && keys.every((k) => prev.metrics.has(k) && same(prev.metrics.get(k)!, q.metrics[k as keyof typeof q.metrics]!))) continue;

        const rid = randomUUID();
        const revision = prev ? prev.revision + 1 : 0;
        results.push({ id: rid, periodId: pid, basis, version: prev ? "REVISED" : "ORIGINAL", revision, exchange, sourceUnit: "INR crore", sourceKey: FUND_KEY, fetchedAt });
        for (const k of keys) metrics.push({ resultId: rid, key: k, value: q.metrics[k as keyof typeof q.metrics]!, unit: "INR_CR", sourceTag: `upstox:${k}` });
        if (prev) updated++;
        else inserted++;
      }
    });
    await flush();
    }
    process.stdout.write("\n");
    console.log(`new periods: ${totals.periods}; new results/revisions: ${totals.results}; detected announcements: ${totals.announcements}`);

    // ---- 3. Upcoming results (recomputed from scratch for synced companies) ----
    const today = istToday(startedAt);
    const fy = new Map(companies.map((c) => [c.id, c.fyEndMonth]));
    const upcoming: Prisma.UpcomingResultCreateManyInput[] = [];
    // Companies whose latest figures are older than ~9 months are treated as not currently reporting
    // (suspended, dormant or not covered by the source) rather than listed as years overdue.
    const staleBefore = today.getTime() - 270 * DAY;
    for (const [companyId, end] of latestByCompany) {
      if (end.getTime() < staleBefore) continue;
      const p = pendingResults(end, today, fy.get(companyId));
      if (!p) continue;
      upcoming.push({
        companyId,
        fiscalYear: fiscalYearOf(p.periodEnd, fy.get(companyId)),
        periodType: "QUARTER",
        fiscalPart: fiscalQuarterOf(p.periodEnd, fy.get(companyId)),
        status: "ESTIMATED",
        expectedDate: p.deadline,
        method: `SEBI LODR Reg 33 deadline; latest quarter in Upstox data ends ${end.toISOString().slice(0, 10)}`,
      });
    }
    // Official board-meeting dates (from the NSE import) win over deadlines; past meetings are dropped.
    await prisma.upcomingResult.deleteMany({ where: { status: "OFFICIAL", expectedDate: { lt: today } } });
    const official = await prisma.upcomingResult.findMany({ where: { status: "OFFICIAL" }, select: { companyId: true, fiscalYear: true, fiscalPart: true } });
    const officialKeys = new Set(official.map((o) => `${o.companyId}|${o.fiscalYear}|${o.fiscalPart}`));
    const estimated = upcoming.filter((u) => !officialKeys.has(`${u.companyId}|${u.fiscalYear}|${u.fiscalPart}`));
    await prisma.upcomingResult.deleteMany({ where: { companyId: { in: [...latestByCompany.keys()] }, status: "ESTIMATED" } });
    await write(estimated, (data) => prisma.upcomingResult.createMany({ data }), "upcoming (pending) results");

    // ---- 4. Candles around detected announcements ----
    if (!argv.includes("--skip-prices")) await syncReactionPrices(errors);

    await prisma.ingestionLog.update({
      where: { id: log.id },
      data: { status: errors.length ? "PARTIAL" : "SUCCEEDED", finishedAt: new Date(), recordsRead: companies.length, inserted, updated, skipped: errors.length, errors: errors.length ? errors.slice(0, 500) : undefined },
    });
    console.log(`done: ${inserted} inserted, ${updated} revised, ${errors.length} errors`);
    errors.slice(0, 5).forEach((e) => console.log(`  ${e}`));
  } catch (e) {
    await prisma.ingestionLog.update({ where: { id: log.id }, data: { status: "FAILED", finishedAt: new Date(), errors: [(e as Error).message] } }).catch(() => {});
    throw e;
  }
}

/** Stores daily bars from 15 days before to 15 days after each announcement (NSE-imported or detected) in the last 200 days (--price-days). */
async function syncReactionPrices(errors: string[]) {
  await ensureReferenceData(prisma, {
    key: PRICE_KEY,
    name: "Upstox historical candles v3 (daily)",
    homepage: "https://upstox.com/developer/api-documentation/v3/get-historical-candle-data",
    licenceNotes: "Personal Analytics token. Exchange price data: public display requires a licence. Gated by PUBLIC_DISPLAY_UPSTOX.",
    publicDisplay: false,
    isDemo: false,
  });
  // Covers the current fiscal year's results seasons (Q1 results arrive in July–August).
  const since = new Date(Date.now() - Number(opt("price-days") ?? 200) * DAY);
  const anns = await prisma.earningsAnnouncement.findMany({
    where: { announcedAt: { gte: since }, version: "ORIGINAL" },
    select: { announcedAt: true, exchange: true, company: { select: { isin: true, securities: { select: { id: true, exchange: true } } } } },
  });
  // One request per listing, covering all its announcements (standalone, consolidated, …).
  const windows = new Map<string, { secId: string; key: string; from: number; to: number }>();
  for (const a of anns) {
    const sec = a.company.securities.find((s) => s.exchange === a.exchange) ?? a.company.securities[0];
    if (!sec) continue;
    const from = a.announcedAt.getTime() - 15 * DAY;
    const to = Math.min(Date.now(), a.announcedAt.getTime() + 15 * DAY);
    const w = windows.get(sec.id);
    if (!w) windows.set(sec.id, { secId: sec.id, key: `${sec.exchange}_EQ|${a.company.isin}`, from, to });
    else {
      w.from = Math.min(w.from, from);
      w.to = Math.max(w.to, to);
    }
  }
  // Skip listings whose stored bars already cover the window (re-runs only fetch what is new).
  const stored = await prisma.historicalPrice.groupBy({ by: ["securityId"], where: { securityId: { in: [...windows.keys()] } }, _min: { date: true }, _max: { date: true } });
  const cover = new Map(stored.map((r) => [r.securityId, { min: r._min.date!.getTime(), max: r._max.date!.getTime() }]));
  const todo = [...windows.values()].filter((w) => {
    const c = cover.get(w.secId);
    return !c || c.min > w.from + 3 * DAY || c.max < w.to - 3 * DAY;
  });
  console.log(`reaction prices: ${windows.size} listings, ${todo.length} need prices`);
  let n = 0;
  let done = 0;
  await pool(todo, CONCURRENCY, async (w) => {
    try {
      const bars = await withRetry(() => fetchDailyCandles(token!, w.key, new Date(w.from), new Date(w.to)));
      if (bars.length) {
        const fetchedAt = new Date();
        await prisma.$transaction([
          prisma.historicalPrice.deleteMany({ where: { securityId: w.secId, date: { gte: bars[0].date, lte: bars[bars.length - 1].date } } }),
          prisma.historicalPrice.createMany({
            data: bars.map((b) => ({ securityId: w.secId, date: b.date, open: b.open, high: b.high, low: b.low, close: b.close, volume: BigInt(b.volume), sourceKey: PRICE_KEY, fetchedAt })),
          }),
        ]);
        n += bars.length;
      }
    } catch (e) {
      errors.push(`candles ${w.key}: ${(e as Error).message}`);
    }
    if (++done % 100 === 0) process.stdout.write(`\rprices ${done}/${todo.length}`);
  });
  console.log(`\nreaction prices: ${n} bars stored`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    // Open sockets/handles (fetch keep-alive, libSQL) can keep Node alive after the work is done,
    // which would hang the scheduled daily job.
    process.exit(process.exitCode ?? 0);
  });
