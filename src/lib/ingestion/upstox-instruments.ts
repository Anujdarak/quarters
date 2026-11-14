/**
 * Parser for the Upstox instrument master files (public downloads, no token needed):
 *   https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz
 *   https://assets.upstox.com/market-quote/instruments/exchange/BSE.json.gz
 *
 * Keeps only listed equity shares of Indian companies:
 *   - segment NSE_EQ / BSE_EQ
 *   - valid "INE…" ISIN with security-type digits "01" (equity shares); this drops bonds,
 *     NCDs, G-secs, InvITs/REITs and partly-paid lines
 *   - NSE SME = instrument_type SM/ST (security_type "SME"); BSE SME = groups M/MT/MS
 *
 * NSE names in this file are truncated to 25 characters, so each company takes the longer of its
 * NSE and BSE names (ties go to BSE, which uses mixed case).
 */
import { isIndianEquityIsin } from "../domain/identifiers";
import type { MasterRow, ParseResult, RowIssue } from "./master-files";

export interface UpstoxInstrument {
  segment?: string;
  name?: string;
  isin?: string;
  instrument_type?: string;
  trading_symbol?: string;
  exchange_token?: string;
  security_type?: string;
}

const NSE_SME_TYPES = new Set(["SM", "ST"]);
const NSE_EQUITY_TYPES = new Set(["EQ", "BE", "BZ", ...NSE_SME_TYPES]);
const BSE_SME_GROUPS = new Set(["M", "MT", "MS"]);
const BSE_NON_EQUITY_GROUPS = new Set(["F", "G", "IF"]);

const isEquityShareIsin = (isin: string) => isIndianEquityIsin(isin) && isin.slice(7, 9) === "01";

const cleanName = (s: string) => s.replace(/\s+/g, " ").trim();

export function parseUpstoxInstruments(nse: UpstoxInstrument[], bse: UpstoxInstrument[]): { nse: ParseResult; bse: ParseResult } {
  const out = { nse: { rows: [] as MasterRow[], skipped: [] as RowIssue[] }, bse: { rows: [] as MasterRow[], skipped: [] as RowIssue[] } };

  nse.forEach((r, i) => {
    if (r.segment !== "NSE_EQ") return;
    const isin = (r.isin ?? "").toUpperCase();
    if (!isin.startsWith("INE") || !NSE_EQUITY_TYPES.has(r.instrument_type ?? "")) return; // not an equity line: ignore silently
    if (!isEquityShareIsin(isin) || !r.trading_symbol || !r.name) {
      out.nse.skipped.push({ line: i + 1, reason: `invalid equity record (${isin || "no ISIN"})`, raw: r as Record<string, string> });
      return;
    }
    const sme = NSE_SME_TYPES.has(r.instrument_type!) || r.security_type === "SME";
    out.nse.rows.push(row("NSE", sme, isin, r.name, { symbol: r.trading_symbol.toUpperCase(), scripCode: null, series: r.instrument_type! }));
  });

  bse.forEach((r, i) => {
    if (r.segment !== "BSE_EQ") return;
    const isin = (r.isin ?? "").toUpperCase();
    const group = r.instrument_type ?? "";
    if (!isin.startsWith("INE") || BSE_NON_EQUITY_GROUPS.has(group) || isin.slice(7, 9) !== "01") return;
    if (!isEquityShareIsin(isin) || !r.exchange_token || !/^\d+$/.test(r.exchange_token) || !r.name) {
      out.bse.skipped.push({ line: i + 1, reason: `invalid equity record (${isin || "no ISIN"})`, raw: r as Record<string, string> });
      return;
    }
    out.bse.rows.push(
      row("BSE", BSE_SME_GROUPS.has(group), isin, r.name, {
        symbol: null,
        scripCode: r.exchange_token,
        series: r.trading_symbol ? `${r.trading_symbol} (${group})` : group,
      }),
    );
  });

  // Same ISIN twice on one exchange (e.g. BE and EQ lines): keep the first.
  for (const k of ["nse", "bse"] as const) {
    const seen = new Set<string>();
    out[k].rows = out[k].rows.filter((r) => (seen.has(r.isin) ? false : (seen.add(r.isin), true)));
  }

  // Best name per ISIN.
  const best = new Map<string, string>();
  for (const r of out.bse.rows) best.set(r.isin, r.name);
  for (const r of out.nse.rows) {
    const b = best.get(r.isin);
    if (!b || r.name.length > b.length) best.set(r.isin, r.name);
  }
  for (const r of [...out.nse.rows, ...out.bse.rows]) r.name = best.get(r.isin)!;

  return out;
}

function row(
  exchange: "NSE" | "BSE",
  sme: boolean,
  isin: string,
  name: string,
  ids: { symbol: string | null; scripCode: string | null; series: string },
): MasterRow {
  return {
    exchange,
    segment: sme ? "SME" : "MAINBOARD",
    isin,
    name: cleanName(name),
    ...ids,
    listingDate: null,
    faceValue: null,
    status: "ACTIVE",
    sector: null,
    industry: null,
  };
}
