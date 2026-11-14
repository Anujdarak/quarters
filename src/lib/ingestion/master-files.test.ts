import { describe, expect, it } from "vitest";
import { mergeByIsin, parseBseList, parseExchangeDate, parseNseList } from "./master-files";

// Layout fixtures mirror the official file headers. The rows use real, publicly listed ISINs
// purely to exercise check-digit validation; they are test inputs, not app data.
const NSE_EQ = `SYMBOL,NAME OF COMPANY, SERIES, DATE OF LISTING, PAID UP VALUE, MARKET LOT, ISIN NUMBER, FACE VALUE
RELIANCE,Reliance Industries Limited,EQ,29-NOV-1995,10,1,INE002A01018,10
BADISIN,Bad Isin Limited,EQ,01-JAN-2020,10,1,INE002A01019,10
`;

const NSE_SME = `SYMBOL,NAME_OF_COMPANY,SERIES,DATE_OF_LISTING,PAID_UP_VALUE,MARKET_LOT,ISIN_NUMBER,FACE_VALUE
INFY,Infosys Limited,SM,08-FEB-1995,5,1,INE009A01021,5
`;

const BSE = `Security Code,Issuer Name,Security Id,Security Name,Status,Group,Face Value,ISIN No,Industry,Instrument
500325,Reliance Industries Ltd,RELIANCE,RELIANCE INDUSTRIES LTD.,Active,A ,10.00,INE002A01018,Refineries & Marketing,Equity
999999,Some Bond,SBOND,SOME BOND,Active,F ,1000,INE002A01018,,Debentures and Bonds
500209,Infosys Ltd,INFY,INFOSYS LTD.,Suspended,MT,5.00,INE009A01021,IT Services,Equity
`;

describe("date parsing", () => {
  it("parses exchange formats and rejects impossible dates", () => {
    expect(parseExchangeDate("29-NOV-1995")?.toISOString().slice(0, 10)).toBe("1995-11-29");
    expect(parseExchangeDate("06-Oct-08")?.toISOString().slice(0, 10)).toBe("2008-10-06");
    expect(parseExchangeDate("2024-02-29")?.toISOString().slice(0, 10)).toBe("2024-02-29");
    expect(parseExchangeDate("31/12/2020")?.toISOString().slice(0, 10)).toBe("2020-12-31");
    expect(parseExchangeDate("31-FEB-2020")).toBeNull();
    expect(parseExchangeDate("")).toBeNull();
    expect(parseExchangeDate("garbage")).toBeNull();
  });
});

describe("NSE list parser", () => {
  it("parses mainboard rows and reports invalid ISINs instead of dropping silently", () => {
    const { rows, skipped } = parseNseList(NSE_EQ, "MAINBOARD");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ exchange: "NSE", segment: "MAINBOARD", symbol: "RELIANCE", series: "EQ" });
    expect(skipped).toHaveLength(1);
    expect(skipped[0].line).toBe(3);
  });

  it("accepts the SME underscore header variant", () => {
    const { rows } = parseNseList(NSE_SME, "SME");
    expect(rows[0]).toMatchObject({ segment: "SME", symbol: "INFY", faceValue: 5 });
  });

  it("fails loudly on an unknown layout", () => {
    expect(() => parseNseList("A,B\n1,2\n", "MAINBOARD", "x.csv")).toThrow(/unrecognised layout/);
  });
});

describe("BSE list parser", () => {
  it("filters non-equity instruments and maps status and SME group", () => {
    const { rows, skipped } = parseBseList(BSE, "auto");
    expect(rows).toHaveLength(2);
    expect(skipped[0].reason).toMatch(/non-equity/);
    expect(rows[0]).toMatchObject({ scripCode: "500325", segment: "MAINBOARD", status: "ACTIVE" });
    expect(rows[1]).toMatchObject({ scripCode: "500209", segment: "SME", status: "SUSPENDED" });
  });

  it("respects an explicit segment", () => {
    const { rows } = parseBseList(BSE, "MAINBOARD");
    expect(rows.every((r) => r.segment === "MAINBOARD")).toBe(true);
  });
});

describe("cross-exchange merge", () => {
  it("creates one company per ISIN and keeps both exchange identifiers", () => {
    const nse = parseNseList(NSE_EQ, "MAINBOARD").rows;
    const bse = parseBseList(BSE, "auto").rows;
    const { companies, conflicts } = mergeByIsin([...bse, ...nse]);
    expect(companies).toHaveLength(2);
    const ril = companies.find((c) => c.isin === "INE002A01018")!;
    expect(ril.name).toBe("Reliance Industries Limited"); // NSE name preferred
    expect(ril.listings.map((l) => l.exchange).sort()).toEqual(["BSE", "NSE"]);
    expect(ril.industry).toBe("Refineries & Marketing");
    expect(conflicts).toEqual([]);
  });

  it("reports duplicate same-exchange listings", () => {
    const a = parseNseList(NSE_EQ, "MAINBOARD").rows;
    const b = parseNseList(NSE_EQ, "SME").rows;
    const { companies, conflicts } = mergeByIsin([...a, ...b]);
    expect(companies[0].listings).toHaveLength(1);
    expect(companies[0].listings[0].segment).toBe("SME");
    expect(conflicts).toHaveLength(1);
  });
});
