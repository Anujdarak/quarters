/**
 * Share-price reaction to a results announcement, in trading sessions.
 *
 * - Price before: the close of the last session dated before the announcement date (IST).
 * - Results day (day 0): the session on the announcement date. Missing when the announcement came
 *   on a weekend or holiday.
 * - Day N (1, 3, 5, 7): the Nth session after the announcement date.
 *
 * Changes are sequential: each point is measured against the previous point that exists
 * (results day vs price before, day 1 vs results day, day 3 vs day 1, …). The cumulative change
 * since the price before is also returned. Only sessions with an actual price count; a missing
 * session is never filled in.
 */

export const REACTION_DAYS = [0, 1, 3, 5, 7] as const;
export type ReactionDay = (typeof REACTION_DAYS)[number];

export const reactionDayLabel = (d: number) => (d === 0 ? "Results day" : `${d} day${d > 1 ? "s" : ""}`);

export interface Bar {
  date: Date; // session date, UTC date-only
  close: number;
}

export interface ReactionPoint {
  day: ReactionDay;
  date: Date;
  close: number;
  /** ₹ change against the previous point (sequential). */
  change: number;
  /** % change against the previous point (sequential). */
  changePct: number;
  /** % change since the price before the announcement. */
  cumulativePct: number;
}

export interface Reaction {
  base: Bar;
  points: ReactionPoint[]; // only sessions that have happened
}

const IST_MS = 330 * 60_000;

/** IST calendar date of an instant, as UTC date-only milliseconds. */
function istDate(at: Date): number {
  const ist = new Date(at.getTime() + IST_MS);
  return Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate());
}

export function computeReaction(bars: Bar[], announcedAt: Date): Reaction | null {
  const sorted = [...bars].sort((a, b) => a.date.getTime() - b.date.getTime());
  const day = istDate(announcedAt);
  let baseIdx = -1;
  for (let i = 0; i < sorted.length && sorted[i].date.getTime() < day; i++) baseIdx = i;
  if (baseIdx < 0) return null;
  const base = sorted[baseIdx];
  // Session on the announcement date, if the market was open that day.
  const sameIdx = sorted[baseIdx + 1]?.date.getTime() === day ? baseIdx + 1 : -1;
  const anchor = sameIdx >= 0 ? sameIdx : baseIdx; // day N counts sessions after the announcement date

  const points: ReactionPoint[] = [];
  let prev = base;
  for (const d of REACTION_DAYS) {
    const b = d === 0 ? (sameIdx >= 0 ? sorted[sameIdx] : undefined) : sorted[anchor + d];
    if (!b) {
      if (d === 0) continue; // no results-day session (weekend/holiday): later days still count
      break;
    }
    const change = b.close - prev.close;
    points.push({
      day: d,
      date: b.date,
      close: b.close,
      change,
      changePct: (change / prev.close) * 100,
      cumulativePct: ((b.close - base.close) / base.close) * 100,
    });
    prev = b;
  }
  return { base, points };
}

/** IST trading-session timing of an announcement. Weekends count as non-trading; exchange holidays are not known. */
export function announcementTiming(at: Date): "PRE_MARKET" | "MARKET_HOURS" | "POST_MARKET" | "NON_TRADING_DAY" {
  const ist = new Date(at.getTime() + IST_MS);
  const day = ist.getUTCDay();
  if (day === 0 || day === 6) return "NON_TRADING_DAY";
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  if (mins < 9 * 60 + 15) return "PRE_MARKET";
  if (mins <= 15 * 60 + 30) return "MARKET_HOURS";
  return "POST_MARKET";
}
