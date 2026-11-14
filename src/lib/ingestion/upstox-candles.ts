/**
 * Upstox historical candles v3 (daily), unadjusted.
 *   GET https://api.upstox.com/v3/historical-candle/{instrumentKey}/days/1/{to}/{from}
 * Plain module shared by Next.js server code and scripts. Server-side only (reads the token).
 */
import { UpstoxRateLimitError } from "./upstox-fundamentals";

export interface Candle {
  /** Session date, UTC date-only. */
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const isoDate = (d: Date) => new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10); // IST calendar date

/** Oldest first. */
export function parseCandles(body: { data?: { candles?: unknown[][] } }): Candle[] {
  return (body.data?.candles ?? [])
    .flatMap((c) => {
      const [ts, o, h, l, cl, v] = c as [string, number, number, number, number, number];
      if (typeof ts !== "string" || ![o, h, l, cl].every(Number.isFinite)) return [];
      return [{ date: new Date(`${ts.slice(0, 10)}T00:00:00Z`), open: o, high: h, low: l, close: cl, volume: Number(v) || 0 }];
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

export async function fetchDailyCandles(token: string, instrumentKey: string, from: Date, to: Date): Promise<Candle[]> {
  const url = `https://api.upstox.com/v3/historical-candle/${encodeURIComponent(instrumentKey)}/days/1/${isoDate(to)}/${isoDate(from)}`;
  const res = await fetch(url, { headers: { Accept: "application/json", Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) });
  if (res.status === 429) throw new UpstoxRateLimitError(`429 candles ${instrumentKey}`);
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.status !== "success") throw new Error(`Upstox candles ${instrumentKey}: HTTP ${res.status}`);
  return parseCandles(body);
}
