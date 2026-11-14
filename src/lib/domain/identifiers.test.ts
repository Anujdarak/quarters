import { describe, expect, it } from "vitest";
import { companySlug, isIndianEquityIsin, isValidIsin, uniqueSlug } from "./identifiers";

describe("ISIN validation", () => {
  it("accepts valid ISINs", () => {
    expect(isValidIsin("INE002A01018")).toBe(true);
    expect(isValidIsin("INE009A01021")).toBe(true);
    expect(isValidIsin("US0378331005")).toBe(true);
    expect(isValidIsin(" ine002a01018 ")).toBe(true);
  });

  it("rejects bad check digits and malformed values", () => {
    expect(isValidIsin("INE002A01019")).toBe(false);
    expect(isValidIsin("INE002A0101")).toBe(false);
    expect(isValidIsin("")).toBe(false);
    expect(isValidIsin("1NE002A01018")).toBe(false);
  });

  it("restricts to Indian company equity ISINs", () => {
    expect(isIndianEquityIsin("INE002A01018")).toBe(true);
    expect(isIndianEquityIsin("US0378331005")).toBe(false);
  });
});

describe("company slugs", () => {
  it("strips legal suffixes and punctuation", () => {
    expect(companySlug("Reliance Industries Limited")).toBe("reliance-industries");
    expect(companySlug("Tata Motors Ltd.")).toBe("tata-motors");
    expect(companySlug("Larsen & Toubro Limited")).toBe("larsen-and-toubro");
    expect(companySlug("  ")).toBe("company");
  });

  it("disambiguates collisions deterministically", () => {
    const taken = new Set(["abc-industries"]);
    expect(uniqueSlug("abc-industries", "INE123A01016", taken)).toBe("abc-industries-a01016");
    expect(uniqueSlug("xyz", "INE123A01016", taken)).toBe("xyz");
  });
});
