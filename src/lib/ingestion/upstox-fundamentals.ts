/**
 * Upstox Company Fundamentals API: quarterly income statement (last four quarters).
 *   GET https://api.upstox.com/v2/fundamentals/{isin}/income-statement?type=consolidated|standalone&time_period=quarterly
 * Values are INR crore. Periods are month labels ("Sep 2026"); no announcement dates, no filing links.
 *
 * Plain module (no "server-only") so both Next.js and the sync script can use it. Never import it
 * from client components: it reads the server-side token.
 */
import { endOfMonth, fiscalQuarterOf, fiscalYearOf, type Quarter } from "../domain/fiscal";

export type Basis = "CONSOLIDATED" | "STANDALONE";

/** Upstox category → our canonical metric key. */
export const METRIC_KEYS = {
  revenue: "revenue_from_operations",
  operating_profit: "operating_profit",
  net_profit: "net_profit",
} as const;
export type MetricKey = (typeof METRIC_KEYS)[keyof typeof METRIC_KEYS];

export interface QuarterRow {
  periodEnd: Date;
  fiscalYear: number;
  fiscalQuarter: Quarter;
  metrics: Partial<Record<MetricKey, number>>;
}

interface IncomeStatementResponse {
  status: string;
  data?: { income_statement?: { category: string; history: { value: number; period: string }[] }[] };
  errors?: { message?: string; errorCode?: string }[];
}

const MONTHS: Record<string, number> = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };

/** "Sep 2026" → 2026-09-30 (UTC date-only), or null if unparseable. */
export function parsePeriodLabel(label: string): Date | null {
  const m = /^([A-Z][a-z]{2}) (\d{4})$/.exec(label.trim());
  if (!m || !MONTHS[m[1]]) return null;
  return endOfMonth(Number(m[2]), MONTHS[m[1]]);
}

/** Pivot the category-major response into one row per quarter, newest first. */
export function parseIncomeStatement(body: IncomeStatementResponse, fyEndMonth = 3): QuarterRow[] {
  const byPeriod = new Map<number, QuarterRow>();
  for (const cat of body.data?.income_statement ?? []) {
    const key = METRIC_KEYS[cat.category as keyof typeof METRIC_KEYS];
    if (!key) continue;
    for (const h of cat.history ?? []) {
      const end = parsePeriodLabel(h.period);
      if (!end || typeof h.value !== "number" || !Number.isFinite(h.value)) continue;
      let row = byPeriod.get(end.getTime());
      if (!row) {
        row = { periodEnd: end, fiscalYear: fiscalYearOf(end, fyEndMonth), fiscalQuarter: fiscalQuarterOf(end, fyEndMonth), metrics: {} };
        byPeriod.set(end.getTime(), row);
      }
      row.metrics[key] = h.value;
    }
  }
  return [...byPeriod.values()].sort((a, b) => b.periodEnd.getTime() - a.periodEnd.getTime());
}

export class UpstoxRateLimitError extends Error {}

export async function fetchQuarterlyIncome(token: string, isin: string, basis: Basis): Promise<QuarterRow[]> {
  const url = `https://api.upstox.com/v2/fundamentals/${encodeURIComponent(isin)}/income-statement?type=${basis.toLowerCase()}&time_period=quarterly`;
  const res = await fetch(url, {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 429) throw new UpstoxRateLimitError(`429 for ${isin}`);
  const body = (await res.json().catch(() => null)) as IncomeStatementResponse | null;
  if (!res.ok || body?.status !== "success") {
    throw new Error(`Upstox fundamentals ${isin} ${basis}: HTTP ${res.status} ${body?.errors?.[0]?.message ?? ""}`.trim());
  }
  return parseIncomeStatement(body);
}
