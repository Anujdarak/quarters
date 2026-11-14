import { describe, expect, it } from "vitest";
import { ymd } from "./fiscal";
import { nextQuarterEnd, pendingResults, resultsDeadline } from "./deadlines";

describe("results deadlines (SEBI LODR Reg 33)", () => {
  it("next quarter end", () => {
    expect(nextQuarterEnd(ymd(2026, 6, 30))).toEqual(ymd(2026, 9, 30));
    expect(nextQuarterEnd(ymd(2026, 12, 31))).toEqual(ymd(2027, 3, 31));
  });

  it("45 days for Q1-Q3, 60 days for the March quarter", () => {
    expect(resultsDeadline(ymd(2026, 9, 30))).toEqual(ymd(2026, 11, 14));
    expect(resultsDeadline(ymd(2026, 12, 31))).toEqual(ymd(2027, 2, 14));
    expect(resultsDeadline(ymd(2027, 3, 31))).toEqual(ymd(2027, 5, 30));
  });

  it("pending only once the next quarter has ended", () => {
    expect(pendingResults(ymd(2026, 6, 30), ymd(2026, 11, 14))).toEqual({ periodEnd: ymd(2026, 9, 30), deadline: ymd(2026, 11, 14) });
    expect(pendingResults(ymd(2026, 9, 30), ymd(2026, 11, 14))).toBeNull();
  });
});
