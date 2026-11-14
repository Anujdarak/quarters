import { describe, expect, it } from "vitest";
import {
  fiscalQuarterOf,
  fiscalYearLabel,
  fiscalYearOf,
  halfYearBounds,
  latestCompletedQuarter,
  previousQuarter,
  quarterBounds,
  quarterLabel,
  sameQuarterLastYear,
  ymd,
} from "./fiscal";

const iso = (d: Date) => d.toISOString().slice(0, 10);

describe("Indian fiscal year (April-March)", () => {
  it("labels FY by ending year", () => {
    expect(fiscalYearOf(ymd(2026, 4, 1))).toBe(2027);
    expect(fiscalYearOf(ymd(2026, 3, 31))).toBe(2026);
    expect(fiscalYearOf(ymd(2026, 12, 31))).toBe(2027);
    expect(fiscalYearOf(ymd(2027, 1, 1))).toBe(2027);
  });

  it("maps months to quarters", () => {
    expect(fiscalQuarterOf(ymd(2026, 4, 1))).toBe(1);
    expect(fiscalQuarterOf(ymd(2026, 6, 30))).toBe(1);
    expect(fiscalQuarterOf(ymd(2026, 7, 1))).toBe(2);
    expect(fiscalQuarterOf(ymd(2026, 10, 15))).toBe(3);
    expect(fiscalQuarterOf(ymd(2027, 3, 31))).toBe(4);
  });

  it("returns exact quarter bounds for FY 2026-27", () => {
    const q = (n: 1 | 2 | 3 | 4) => {
      const b = quarterBounds(2027, n);
      return [iso(b.start), iso(b.end)];
    };
    expect(q(1)).toEqual(["2026-04-01", "2026-06-30"]);
    expect(q(2)).toEqual(["2026-07-01", "2026-09-30"]);
    expect(q(3)).toEqual(["2026-10-01", "2026-12-31"]);
    expect(q(4)).toEqual(["2027-01-01", "2027-03-31"]);
  });

  it("handles leap-year February inside Q4", () => {
    expect(iso(quarterBounds(2028, 4).end)).toBe("2028-03-31");
  });

  it("returns half-year bounds for SME reporting", () => {
    const h1 = halfYearBounds(2027, 1);
    const h2 = halfYearBounds(2027, 2);
    expect([iso(h1.start), iso(h1.end)]).toEqual(["2026-04-01", "2026-09-30"]);
    expect([iso(h2.start), iso(h2.end)]).toEqual(["2026-10-01", "2027-03-31"]);
  });

  it("supports a December year-end company", () => {
    expect(fiscalYearOf(ymd(2026, 12, 31), 12)).toBe(2026);
    expect(fiscalQuarterOf(ymd(2026, 2, 1), 12)).toBe(1);
    const b = quarterBounds(2026, 4, 12);
    expect([iso(b.start), iso(b.end)]).toEqual(["2026-10-01", "2026-12-31"]);
  });

  it("formats labels", () => {
    expect(fiscalYearLabel(2027)).toBe("FY 2026-27");
    expect(fiscalYearLabel(2000)).toBe("FY 1999-00");
    expect(quarterLabel(2027, 2)).toBe("Q2 FY 2026-27");
  });

  it("navigates comparator quarters", () => {
    expect(previousQuarter(2027, 1)).toEqual({ fy: 2026, q: 4 });
    expect(previousQuarter(2027, 3)).toEqual({ fy: 2027, q: 2 });
    expect(sameQuarterLastYear(2027, 2)).toEqual({ fy: 2026, q: 2 });
  });

  it("finds the latest completed quarter", () => {
    expect(latestCompletedQuarter(ymd(2026, 11, 12))).toEqual({ fy: 2027, q: 2 });
    expect(latestCompletedQuarter(ymd(2026, 4, 1))).toEqual({ fy: 2026, q: 4 });
  });

  it("rejects invalid inputs", () => {
    expect(() => fiscalYearOf(ymd(2026, 1, 1), 13)).toThrow(RangeError);
    // @ts-expect-error invalid quarter on purpose
    expect(() => quarterBounds(2027, 5)).toThrow(RangeError);
  });
});
