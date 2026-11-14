import { describe, expect, it } from "vitest";
import { ymd } from "../domain/fiscal";
import { parseIncomeStatement, parsePeriodLabel } from "./upstox-fundamentals";

describe("Upstox income statement parsing", () => {
  it("parses month labels to month end", () => {
    expect(parsePeriodLabel("Sep 2026")).toEqual(ymd(2026, 9, 30));
    expect(parsePeriodLabel("Feb 2024")).toEqual(ymd(2024, 2, 29));
    expect(parsePeriodLabel("2026-09")).toBeNull();
  });

  it("pivots categories into quarters, newest first", () => {
    const rows = parseIncomeStatement({
      status: "success",
      data: {
        income_statement: [
          { category: "revenue", history: [{ value: 100, period: "Jun 2026" }, { value: 120, period: "Sep 2026" }] },
          { category: "net_profit", history: [{ value: 9, period: "Sep 2026" }] },
          { category: "unknown", history: [{ value: 1, period: "Sep 2026" }] },
        ],
      },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ fiscalYear: 2027, fiscalQuarter: 2, metrics: { revenue_from_operations: 120, net_profit: 9 } });
    expect(rows[1]).toMatchObject({ fiscalYear: 2027, fiscalQuarter: 1, metrics: { revenue_from_operations: 100 } });
  });

  it("returns nothing for an empty statement", () => {
    expect(parseIncomeStatement({ status: "success", data: { income_statement: [{ category: "revenue", history: [] }] } })).toEqual([]);
  });
});
