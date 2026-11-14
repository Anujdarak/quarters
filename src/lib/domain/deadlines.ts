/**
 * Statutory results deadlines under SEBI LODR Regulation 33(3):
 *  - quarterly results (other than the last quarter): within 45 days of the end of the quarter;
 *  - the last quarter, filed with the annual audited results: within 60 days of the end of the year.
 * Deadlines are a legal upper bound, not a prediction of the actual announcement date.
 */
import { endOfMonth } from "./fiscal";

const DAY = 86_400_000;

/** End of the quarter after the one ending on `periodEnd` (both UTC date-only). */
export function nextQuarterEnd(periodEnd: Date): Date {
  return endOfMonth(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth() + 1 + 3);
}

/** Last date results for the quarter ending `periodEnd` may be filed. */
export function resultsDeadline(periodEnd: Date, fyEndMonth = 3): Date {
  const isFyEnd = periodEnd.getUTCMonth() + 1 === fyEndMonth;
  return new Date(periodEnd.getTime() + (isFyEnd ? 60 : 45) * DAY);
}

/**
 * The next results a company owes, given its latest reported quarter: the following quarter
 * once that quarter has ended. Returns null while the following quarter is still running.
 */
export function pendingResults(latestReported: Date, today: Date, fyEndMonth = 3): { periodEnd: Date; deadline: Date } | null {
  const periodEnd = nextQuarterEnd(latestReported);
  if (periodEnd.getTime() >= today.getTime()) return null;
  return { periodEnd, deadline: resultsDeadline(periodEnd, fyEndMonth) };
}

/** Today's calendar date in India (IST), as UTC date-only. */
export function istToday(now: Date = new Date()): Date {
  const ist = new Date(now.getTime() + 5.5 * 3600_000);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
}
