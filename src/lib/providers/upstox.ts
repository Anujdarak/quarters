import "server-only";
import { ProviderNotConfiguredError } from "./types";

/**
 * Upstox live quotes (v3 LTP endpoint), server-side only.
 * Docs: https://upstox.com/developer/api-documentation/v3/ltp
 *
 * Licence: personal Analytics token. Public display of Upstox data is gated by
 * PUBLIC_DISPLAY_UPSTOX (see DATA_SOURCES.md); local development always allows it.
 */

export interface Instrument {
  /** Upstox instrument key, e.g. "NSE_INDEX|Nifty 50" or "NSE_EQ|<ISIN>". */
  key: string;
  label: string;
  kind: "index" | "stock";
}

/** What the live market widgets show. Keys verified against the Upstox API on 2026-11-14. */
export const MARKET_WATCH: Instrument[] = [
  { key: "NSE_INDEX|Nifty 50", label: "NIFTY 50", kind: "index" },
  { key: "BSE_INDEX|SENSEX", label: "SENSEX", kind: "index" },
  { key: "NSE_INDEX|Nifty Bank", label: "NIFTY BANK", kind: "index" },
  { key: "NSE_INDEX|Nifty IT", label: "NIFTY IT", kind: "index" },
  { key: "NSE_INDEX|India VIX", label: "INDIA VIX", kind: "index" },
  { key: "NSE_EQ|INE002A01018", label: "RELIANCE", kind: "stock" },
  { key: "NSE_EQ|INE040A01034", label: "HDFCBANK", kind: "stock" },
  { key: "NSE_EQ|INE467B01029", label: "TCS", kind: "stock" },
  { key: "NSE_EQ|INE090A01021", label: "ICICIBANK", kind: "stock" },
  { key: "NSE_EQ|INE009A01021", label: "INFY", kind: "stock" },
  { key: "NSE_EQ|INE062A01020", label: "SBIN", kind: "stock" },
  { key: "NSE_EQ|INE397D01024", label: "BHARTIARTL", kind: "stock" },
  { key: "NSE_EQ|INE154A01025", label: "ITC", kind: "stock" },
];

export interface LiveQuote {
  key: string;
  label: string;
  kind: Instrument["kind"];
  last: number;
  prevClose: number;
  change: number;
  changePct: number;
}

/** True when Upstox data may be rendered: always in local dev, publicly only when the flag is set. */
export function upstoxDisplayAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.PUBLIC_DISPLAY_UPSTOX === "true";
}

interface LtpResponse {
  status: string;
  data?: Record<string, { last_price: number; cp: number; instrument_token: string }>;
  errors?: { message?: string }[];
}

export async function liveQuotes(instruments: Instrument[] = MARKET_WATCH): Promise<LiveQuote[]> {
  const token = process.env.UPSTOX_ANALYTICS_TOKEN;
  if (!token) throw new ProviderNotConfiguredError("Upstox", "UPSTOX_ANALYTICS_TOKEN");

  const url = new URL("https://api.upstox.com/v3/market-quote/ltp");
  url.searchParams.set("instrument_key", instruments.map((i) => i.key).join(","));

  const res = await fetch(url, {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json().catch(() => null)) as LtpResponse | null;
  if (!res.ok || body?.status !== "success" || !body.data) {
    throw new Error(`Upstox quote request failed (HTTP ${res.status}): ${body?.errors?.[0]?.message ?? "no data"}`);
  }

  // Response is keyed by "NSE_EQ:SYMBOL"; match back on instrument_token, which echoes our key.
  const byToken = new Map(Object.values(body.data).map((q) => [q.instrument_token, q]));
  return instruments.flatMap((i) => {
    const q = byToken.get(i.key);
    if (!q || !Number.isFinite(q.last_price)) return [];
    const change = q.last_price - q.cp;
    return [
      {
        key: i.key,
        label: i.label,
        kind: i.kind,
        last: q.last_price,
        prevClose: q.cp,
        change,
        changePct: q.cp ? (change / q.cp) * 100 : 0,
      },
    ];
  });
}
