/**
 * Parsers for NSE corporate-filing CSV exports, downloaded manually by the operator from
 * nseindia.com (Companies > Corporate Filings). The exchange's terms prohibit automated collection.
 *
 *  - "Financial Results": one row per results filing, with the exchange broadcast time.
 *  - "Board Meetings": intimations of upcoming meetings, including "Financial Results" ones.
 *
 * NSE has changed these layouts before, so columns are found by name (several aliases each),
 * and an unrecognised file fails with the list of headers it does contain.
 */
import { norm, parseExchangeDate, readCsv } from "./master-files";

export interface ResultFiling {
  symbol: string | null;
  companyName: string;
  periodEnd: Date | null;
  /** Exchange broadcast time (UTC instant; source is IST). */
  broadcastAt: Date;
  consolidated: boolean | null;
  period: string | null;
  /** True for "Revision" submissions (Integrated Filing); the original announcement is a separate row. */
  revision: boolean;
}

export interface BoardMeetingRow {
  symbol: string | null;
  companyName: string;
  meetingDate: Date;
  purpose: string;
  intimatedAt: Date | null;
}

export interface FilingParse<T> {
  rows: T[];
  skipped: { line: number; reason: string }[];
}

function pick(headers: string[], aliases: string[]): string | undefined {
  const set = new Set(headers);
  for (const a of aliases.map(norm)) if (set.has(a)) return a;
  // Fallback: a header that contains the alias (e.g. "BROADCASTDATETIMEIST").
  for (const a of aliases.map(norm)) {
    const h = headers.find((x) => x.includes(a));
    if (h) return h;
  }
  return undefined;
}

function columns<K extends string>(recs: Record<string, string>[], spec: Record<K, string[]>, required: NoInfer<K>[], file: string): Record<K, string | undefined> {
  if (!recs.length) throw new Error(`${file}: file contains no data rows`);
  const headers = Object.keys(recs[0]);
  const out = {} as Record<K, string | undefined>;
  for (const k of Object.keys(spec) as K[]) out[k] = pick(headers, spec[k]);
  const missing = required.filter((k) => !out[k]);
  if (missing.length) throw new Error(`${file}: unrecognised layout, could not find ${missing.join(", ")}. Found headers: ${headers.join(", ")}`);
  return out;
}

const IST_OFFSET = 5.5 * 3600_000;

/** "14-Nov-2026 18:32:10", "14-Nov-2026 18:32", "2026-11-14 18:32:10", "14/11/2026 6:32 PM" (IST) → UTC instant. */
export function parseIstDateTime(s: string | undefined): Date | null {
  if (!s) return null;
  const m = /^\s*(\S+)(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?)?\s*$/.exec(s);
  if (!m) return null;
  const d = parseExchangeDate(m[1]);
  if (!d) return null;
  let h = m[2] ? Number(m[2]) : 0;
  const min = m[3] ? Number(m[3]) : 0;
  const sec = m[4] ? Number(m[4]) : 0;
  if (m[5]) {
    const pm = m[5].toUpperCase() === "PM";
    if (h === 12) h = pm ? 12 : 0;
    else if (pm) h += 12;
  }
  if (h > 23 || min > 59 || sec > 59) return null;
  return new Date(d.getTime() + ((h * 60 + min) * 60 + sec) * 1000 - IST_OFFSET);
}

const yesNoConsolidated = (s: string | undefined): boolean | null => {
  if (!s) return null;
  const t = s.toUpperCase();
  if (t.includes("NON") || t.includes("STANDALONE")) return false;
  if (t.includes("CONSOLIDATED")) return true;
  return null;
};

export function parseNseFinancialResults(text: string, file = "results CSV"): FilingParse<ResultFiling> {
  const recs = readCsv(text);
  const c = columns(
    recs,
    {
      symbol: ["SYMBOL"],
      company: ["COMPANY NAME", "COMPANY", "NAME OF COMPANY"],
      periodEnd: ["PERIOD ENDED", "QUARTER END DATE", "PERIOD END DATE", "PERIOD ENDING", "QUARTER ENDED", "TO DATE"],
      // Dissemination time is when NSE published the filing; revision rows have no broadcast time.
      broadcast: ["EXCHANGE DISSEMINATION TIME", "DISSEMINATION TIME", "BROADCAST DATE/TIME", "BROADCAST DATE AND TIME", "BROADCAST DATE", "FILING DATE"],
      consolidated: ["CONSOLIDATED / NON-CONSOLIDATED", "CONSOLIDATED / STANDALONE", "CONSOLIDATED/ NON-CONSOLIDATED", "CONSOLIDATED"],
      period: ["PERIOD", "RELATING TO"],
      submission: ["TYPE OF SUBMISSION", "SUBMISSION TYPE"],
    },
    ["company", "broadcast"],
    file,
  );
  const rows: ResultFiling[] = [];
  const skipped: FilingParse<ResultFiling>["skipped"] = [];
  recs.forEach((r, i) => {
    const broadcastAt = parseIstDateTime(r[c.broadcast!]);
    const companyName = r[c.company!]?.trim();
    if (!broadcastAt || !companyName) {
      skipped.push({ line: i + 2, reason: `missing company or unparseable broadcast time "${r[c.broadcast!] ?? ""}"` });
      return;
    }
    rows.push({
      symbol: c.symbol ? r[c.symbol]?.trim().toUpperCase() || null : null,
      companyName,
      periodEnd: c.periodEnd ? parseExchangeDate(r[c.periodEnd]) : null,
      broadcastAt,
      consolidated: c.consolidated ? yesNoConsolidated(r[c.consolidated]) : null,
      period: c.period ? r[c.period]?.trim() || null : null,
      revision: c.submission ? /revis/i.test(r[c.submission] ?? "") : false,
    });
  });
  return { rows, skipped };
}

export function parseNseBoardMeetings(text: string, file = "board meetings CSV"): FilingParse<BoardMeetingRow> {
  const recs = readCsv(text);
  const c = columns(
    recs,
    {
      symbol: ["SYMBOL"],
      company: ["COMPANY NAME", "COMPANY", "NAME OF COMPANY"],
      meetingDate: ["BOARD MEETING DATE", "MEETING DATE", "BM DATE", "DATE OF MEETING"],
      purpose: ["PURPOSE", "AGENDA", "SUBJECT"],
      intimated: ["DATE OF INTIMATION", "INTIMATION DATE", "BROADCAST DATE/TIME", "BROADCAST DATE"],
    },
    ["company", "meetingDate", "purpose"],
    file,
  );
  const rows: BoardMeetingRow[] = [];
  const skipped: FilingParse<BoardMeetingRow>["skipped"] = [];
  recs.forEach((r, i) => {
    const meetingDate = parseExchangeDate(r[c.meetingDate!]?.trim().split(/\s+/)[0]);
    const companyName = r[c.company!]?.trim();
    const purpose = r[c.purpose!]?.trim();
    if (!meetingDate || !companyName || !purpose) {
      skipped.push({ line: i + 2, reason: `missing company, purpose or meeting date "${r[c.meetingDate!] ?? ""}"` });
      return;
    }
    rows.push({
      symbol: c.symbol ? r[c.symbol]?.trim().toUpperCase() || null : null,
      companyName,
      meetingDate,
      purpose,
      intimatedAt: c.intimated ? parseIstDateTime(r[c.intimated]) : null,
    });
  });
  return { rows, skipped };
}

/** Board meetings whose purpose includes approving financial results. */
export const isResultsMeeting = (purpose: string) => /financial\s+results|quarterly\s+results|results/i.test(purpose);

/** Normalised company name for matching when a file has no symbol column. */
export function nameKey(name: string): string {
  return name
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/\b(LIMITED|LTD|THE|PRIVATE|PVT|CO|COMPANY|CORPORATION|CORP|INC)\b\.?/g, " ")
    .replace(/[^A-Z0-9]/g, "");
}
