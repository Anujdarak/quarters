import { describe, expect, it } from "vitest";
import { pctChange } from "./growth";

describe("pctChange", () => {
  it("computes growth on a positive base", () => {
    expect(pctChange(120, 100)).toBeCloseTo(20);
    expect(pctChange(80, 100)).toBeCloseTo(-20);
  });
  it("is not meaningful for zero/negative base, sign change or missing data", () => {
    expect(pctChange(10, 0)).toBeNull();
    expect(pctChange(10, -5)).toBeNull();
    expect(pctChange(-5, 10)).toBeNull();
    expect(pctChange(undefined, 10)).toBeNull();
  });
});
