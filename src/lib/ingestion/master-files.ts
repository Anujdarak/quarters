/**
 * Parsers for official exchange company-master files that an operator downloads manually:
 *
 *  - NSE "Securities available for trading": EQUITY_L.csv (mainboard) and SME_EQUITY_L.csv
 *    https://www.nseindia.com/static/market-data/securities-available-for-trading
 *  - BSE "List of Scrips" CSV export (Equity segment, mainboard or SME)
 *    https://www.bseindia.com/corporates/List_Scrips.html
 *
 * The app does not fetch these files automatically: the exchanges' website terms prohibit
 * automated data collection (see docs/PHASE0_REPORT.md). Header matching is tolerant of
 * spacing/underscore differences, but an unrecognised layout fails loudly instead of guessing.
 */
import { parse } from "csv-parse/sync";
import { isIndianEquityIsin } from "@/lib/domain/identifiers";

export type ExchangeCode = "NSE" | "BSE";
export type Segment = "MAINBOARD" | "SME";
export type Status = "ACTIVE" | "SUSPENDED" | "DELISTED" | "INACTIVE" | "UNKNOWN";

export interface MasterRow {
  exchange: ExchangeCode;
  segment: Segment;
  isin: string;
  name: string;
  symbol: string | null;
  scripCode: string | null;
  series: string | null;
  listingDate: Date | null;
  faceValue: number | null;
  status: Status;
  sector: string | null;
  industry: string | null;
}

export interface RowIssue {
  line: number;
  reason: string;
  raw: Record<string, string>;
}

export interface ParseResult {
  rows: MasterRow[];
  skipped: RowIssue[];
}

/** Normalise a header: "NAME OF COMPANY" / "NAME_OF_COMPANY" / "Name of company" → "NAMEOFCOMPANY". */
export function norm(h: string): string {
  return h.replace(/^﻿/, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function readCsv(text: string): Record<string, string>[] {
  const records: Record<string, string>[] = parse(text, {
    columns: (header: string[]) => header.map(norm),
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    bom: true,
  });
  return records;
}

function requireColumns(rows: Record<string, string>[], cols: string[], file: string): void {
  if (rows.length === 0) throw new Error(`${file}: file contains no data rows`);
  const present = new Set(Object.keys(rows[0]));
  const missing = cols.filter((c) => !present.has(c));
  if (missing.length) {
    throw new Error(
      `${file}: unrecognised layout, missing columns ${missing.join(", ")}. ` +
        `Found: ${[...present].join(", ")}`,
    );
  }
}

const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

/** Parses "06-OCT-2008", "06-Oct-08", "2008-10-06" or "06/10/2008" (DD/MM/YYYY). Returns null if unparseable. */
export function parseExchangeDate(s: string | undefined): Date | null {
  if (!s) return null;
  const t = s.trim();
  let m = /^(\d{1,2})-([A-Za-z]{3})-(\d{2}|\d{4})$/.exec(t);
  if (m) {
    const mon = MONTHS[m[2].toUpperCase()];
    if (!mon) return null;
    let y = Number(m[3]);
    if (m[3].length === 2) y += y >= 70 ? 1900 : 2000;
    return validDate(y, mon, Number(m[1]));
  }
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) return validDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (m) return validDate(Number(m[3]), Number(m[2]), Number(m[1]));
  return null;
}

function validDate(y: number, mo: number, d: number): Date | null {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? dt : null;
}

function num(s: string | undefined): number | null {
  if (s === undefined || s.trim() === "" || s.trim() === "-") return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function blank(s: string | undefined): string | null {
  const t = s?.trim();
  return t ? t : null;
}

/** Parse NSE EQUITY_L.csv or SME_EQUITY_L.csv. */
export function parseNseList(text: string, segment: Segment, file = "NSE list"): ParseResult {
  const recs = readCsv(text);
  requireColumns(recs, ["SYMBOL", "NAMEOFCOMPANY", "SERIES", "ISINNUMBER"], file);
  const rows: MasterRow[] = [];
  const skipped: RowIssue[] = [];
  recs.forEach((r, i) => {
    const line = i + 2;
    const isin = (r.ISINNUMBER ?? "").toUpperCase();
    if (!isIndianEquityIsin(isin)) {
      skipped.push({ line, reason: `invalid or non-equity ISIN "${isin}"`, raw: r });
      return;
    }
    if (!r.SYMBOL || !r.NAMEOFCOMPANY) {
      skipped.push({ line, reason: "missing symbol or name", raw: r });
      return;
    }
    rows.push({
      exchange: "NSE",
      segment,
      isin,
      name: r.NAMEOFCOMPANY,
      symbol: r.SYMBOL.toUpperCase(),
      scripCode: null,
      series: blank(r.SERIES),
      listingDate: parseExchangeDate(r.DATEOFLISTING),
      faceValue: num(r.FACEVALUE),
      // The file lists only securities currently available for trading.
      status: "ACTIVE",
      sector: null,
      industry: null,
    });
  });
  return { rows, skipped };
}

/**
 * BSE SME scrip groups. REPORTED (not from an official spec): "M" and "MT" denote SME
 * securities. Used only when segment="auto"; pass an explicit segment when exporting the
 * SME list separately.
 */
const BSE_SME_GROUPS = new Set(["M", "MT"]);

function bseStatus(s: string | undefined): Status {
  switch ((s ?? "").trim().toUpperCase()) {
    case "ACTIVE":
      return "ACTIVE";
    case "SUSPENDED":
      return "SUSPENDED";
    case "DELISTED":
      return "DELISTED";
    case "":
      return "UNKNOWN";
    default:
      return "INACTIVE";
  }
}

/** Parse a BSE "List of Scrips" CSV export. */
export function parseBseList(text: string, segment: Segment | "auto", file = "BSE list"): ParseResult {
  const recs = readCsv(text);
  requireColumns(recs, ["SECURITYCODE", "ISINNO"], file);
  const nameCol = ["ISSUERNAME", "SECURITYNAME"].find((c) => c in recs[0]);
  if (!nameCol) throw new Error(`${file}: no Issuer Name / Security Name column`);
  const rows: MasterRow[] = [];
  const skipped: RowIssue[] = [];
  recs.forEach((r, i) => {
    const line = i + 2;
    if (r.INSTRUMENT && r.INSTRUMENT.toUpperCase() !== "EQUITY") {
      skipped.push({ line, reason: `non-equity instrument "${r.INSTRUMENT}"`, raw: r });
      return;
    }
    const isin = (r.ISINNO ?? "").toUpperCase();
    if (!isIndianEquityIsin(isin)) {
      skipped.push({ line, reason: `invalid or non-equity ISIN "${isin}"`, raw: r });
      return;
    }
    const group = (r.GROUP ?? "").trim().toUpperCase();
    const seg: Segment = segment === "auto" ? (BSE_SME_GROUPS.has(group) ? "SME" : "MAINBOARD") : segment;
    rows.push({
      exchange: "BSE",
      segment: seg,
      isin,
      name: r[nameCol] || r.SECURITYNAME || r.ISSUERNAME,
      symbol: null,
      scripCode: r.SECURITYCODE.trim(),
      series: blank(r.SECURITYID) ?? blank(group),
      listingDate: null,
      faceValue: num(r.FACEVALUE),
      status: bseStatus(r.STATUS),
      sector: blank(r.SECTORNAME),
      industry: blank(r.INDUSTRYNEWNAME) ?? blank(r.INDUSTRY),
    });
  });
  return { rows, skipped };
}

export interface MergedCompany {
  isin: string;
  /** Preferred display name: NSE name if present (generally the full legal name), else BSE. */
  name: string;
  sector: string | null;
  industry: string | null;
  listings: MasterRow[];
}

/**
 * Merge listings across exchanges by ISIN so a dual-listed company appears once,
 * while keeping each exchange's symbol/scrip code as a separate listing.
 * If the same exchange appears twice for one ISIN (e.g. NSE EQ and SME files both listing it
 * during a migration), the later row wins and a conflict is reported.
 */
export function mergeByIsin(rows: MasterRow[]): { companies: MergedCompany[]; conflicts: string[] } {
  const map = new Map<string, MergedCompany>();
  const conflicts: string[] = [];
  for (const row of rows) {
    let c = map.get(row.isin);
    if (!c) {
      c = { isin: row.isin, name: row.name, sector: null, industry: null, listings: [] };
      map.set(row.isin, c);
    }
    const dup = c.listings.findIndex((l) => l.exchange === row.exchange);
    if (dup >= 0) {
      conflicts.push(
        `${row.isin}: duplicate ${row.exchange} listing (${c.listings[dup].segment} → ${row.segment}); keeping latest`,
      );
      c.listings.splice(dup, 1);
    }
    c.listings.push(row);
    if (row.exchange === "NSE") c.name = row.name;
    c.sector ??= row.sector;
    c.industry ??= row.industry;
  }
  return { companies: [...map.values()], conflicts };
}
