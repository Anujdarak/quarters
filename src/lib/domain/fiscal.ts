/**
 * Indian financial-year utilities.
 *
 * Convention: a fiscal year is labelled by the calendar year in which it ENDS.
 *   FY2027 = 1 Apr 2026 to 31 Mar 2027, displayed as "FY 2026-27".
 *   Q1 = Apr-Jun, Q2 = Jul-Sep, Q3 = Oct-Dec, Q4 = Jan-Mar.
 *   H1 = Apr-Sep, H2 = Oct-Mar (SME half-yearly reporting).
 *
 * All dates are handled as UTC calendar dates (no time component) to avoid
 * timezone drift. A non-March year end can be passed as `fyEndMonth` (1-12).
 */

export type Quarter = 1 | 2 | 3 | 4;
export type Half = 1 | 2;

function assertMonth(m: number): void {
  if (!Number.isInteger(m) || m < 1 || m > 12) throw new RangeError(`Invalid month: ${m}`);
}

/** UTC date-only constructor; month is 1-12. */
export function ymd(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

/** Last calendar day of a month (month 1-12). */
export function endOfMonth(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 0));
}

/** Fiscal year (labelled by ending calendar year) containing `date`. */
export function fiscalYearOf(date: Date, fyEndMonth = 3): number {
  assertMonth(fyEndMonth);
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  return m > fyEndMonth ? y + 1 : y;
}

/** First month (1-12) of the fiscal year. */
function fyStartMonth(fyEndMonth: number): number {
  return (fyEndMonth % 12) + 1;
}

/** Fiscal quarter (1-4) containing `date`. */
export function fiscalQuarterOf(date: Date, fyEndMonth = 3): Quarter {
  assertMonth(fyEndMonth);
  const m = date.getUTCMonth() + 1;
  const offset = (m - fyStartMonth(fyEndMonth) + 12) % 12; // 0..11 months into FY
  return (Math.floor(offset / 3) + 1) as Quarter;
}

export interface PeriodBounds {
  start: Date;
  end: Date;
}

/** Start/end dates of fiscal quarter `q` of fiscal year `fy`. */
export function quarterBounds(fy: number, q: Quarter, fyEndMonth = 3): PeriodBounds {
  assertMonth(fyEndMonth);
  if (![1, 2, 3, 4].includes(q)) throw new RangeError(`Invalid quarter: ${q}`);
  const startMonth0 = fyStartMonth(fyEndMonth) - 1 + (q - 1) * 3; // 0-based, may exceed 11
  // The fiscal year starts in the calendar year before `fy` unless the year ends in December.
  const fyStartYear = fyEndMonth === 12 ? fy : fy - 1;
  const startYear = fyStartYear + Math.floor(startMonth0 / 12);
  const sm = (startMonth0 % 12) + 1;
  const endMonth0 = startMonth0 + 2;
  const endYear = fyStartYear + Math.floor(endMonth0 / 12);
  const em = (endMonth0 % 12) + 1;
  return { start: ymd(startYear, sm, 1), end: endOfMonth(endYear, em) };
}

/** Start/end of half-year `h` of fiscal year `fy`. */
export function halfYearBounds(fy: number, h: Half, fyEndMonth = 3): PeriodBounds {
  const first = quarterBounds(fy, h === 1 ? 1 : 3, fyEndMonth);
  const second = quarterBounds(fy, h === 1 ? 2 : 4, fyEndMonth);
  return { start: first.start, end: second.end };
}

/** "FY 2026-27" for fy=2027. */
export function fiscalYearLabel(fy: number): string {
  return `FY ${fy - 1}-${String(fy % 100).padStart(2, "0")}`;
}

/** "Q2 FY 2026-27". */
export function quarterLabel(fy: number, q: Quarter): string {
  return `Q${q} ${fiscalYearLabel(fy)}`;
}

/** The quarter immediately before (fy, q). */
export function previousQuarter(fy: number, q: Quarter): { fy: number; q: Quarter } {
  return q === 1 ? { fy: fy - 1, q: 4 } : { fy, q: (q - 1) as Quarter };
}

/** Same quarter of the previous fiscal year (the YoY comparator). */
export function sameQuarterLastYear(fy: number, q: Quarter): { fy: number; q: Quarter } {
  return { fy: fy - 1, q };
}

/**
 * Latest quarter that has fully ended on or before `asOf`.
 * Results for it may or may not have been published yet.
 */
export function latestCompletedQuarter(asOf: Date, fyEndMonth = 3): { fy: number; q: Quarter } {
  const fy = fiscalYearOf(asOf, fyEndMonth);
  const q = fiscalQuarterOf(asOf, fyEndMonth);
  return previousQuarter(fy, q);
}
