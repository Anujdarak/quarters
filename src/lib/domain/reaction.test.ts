import { describe, expect, it } from "vitest";
import { ymd } from "./fiscal";
import { computeReaction } from "./reaction";

// Sessions Mon 2 Nov .. Fri 13 Nov 2026 (weekend 7–8 Nov), closes 100, 101, ...
const days = [2, 3, 4, 5, 6, 9, 10, 11, 12, 13];
const bars = days.map((d, i) => ({ date: ymd(2026, 11, d), close: 100 + i }));
const ist = (d: number, h: number, m = 0) => new Date(Date.UTC(2026, 10, d, h, m) - 330 * 60_000);

describe("computeReaction", () => {
  it("results day is the announcement date; later days count sessions after it", () => {
    const r = computeReaction(bars, ist(4, 18, 30))!; // Wed 4 Nov, after market close
    expect(r.base.date).toEqual(ymd(2026, 11, 3));
    expect(r.points.map((p) => p.day)).toEqual([0, 1, 3, 5, 7]);
    expect(r.points.map((p) => p.date.getUTCDate())).toEqual([4, 5, 9, 11, 13]); // day 3 skips the weekend
  });

  it("changes are sequential, each against the previous point", () => {
    const r = computeReaction(bars, ist(4, 18, 30))!;
    expect(r.points[0].changePct).toBeCloseTo(((102 - 101) / 101) * 100); // results day vs price before
    expect(r.points[1].changePct).toBeCloseTo(((103 - 102) / 102) * 100); // day 1 vs results day
    expect(r.points[2].changePct).toBeCloseTo(((105 - 103) / 103) * 100); // day 3 vs day 1
    expect(r.points[2].cumulativePct).toBeCloseTo(((105 - 101) / 101) * 100);
  });

  it("a fall after a rise shows as a fall (₹600 → ₹580 = −3.3%)", () => {
    const b = [
      { date: ymd(2026, 11, 3), close: 576.92 },
      { date: ymd(2026, 11, 4), close: 600 },
      { date: ymd(2026, 11, 5), close: 580 },
    ];
    const r = computeReaction(b, ist(4, 10, 0))!;
    expect(r.points[0].changePct).toBeCloseTo(4, 1);
    expect(r.points[1].changePct).toBeCloseTo(-3.33, 2);
  });

  it("weekend announcement: no results-day session, day 1 is Monday vs Friday's close", () => {
    const r = computeReaction(bars, ist(7, 11, 0))!; // Saturday
    expect(r.base.date).toEqual(ymd(2026, 11, 6));
    expect(r.points[0].day).toBe(1);
    expect(r.points[0].date).toEqual(ymd(2026, 11, 9));
  });

  it("returns only the sessions that have happened", () => {
    expect(computeReaction(bars, ist(12, 19, 0))!.points.map((p) => p.day)).toEqual([0, 1]);
  });

  it("null when no session closed before the announcement date", () => {
    expect(computeReaction(bars, ist(2, 12, 0))).toBeNull();
  });
});
