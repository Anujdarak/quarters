import { describe, expect, it } from "vitest";
import { parseUpstoxInstruments } from "./upstox-instruments";

const nse = [
  { segment: "NSE_EQ", name: "RELIANCE INDUSTRIES LTD", isin: "INE002A01018", instrument_type: "EQ", trading_symbol: "RELIANCE", exchange_token: "2885" },
  { segment: "NSE_EQ", name: "SDL RJ 7.49% 2035", isin: "IN2920250163", instrument_type: "SG", trading_symbol: "749RJ35" },
  { segment: "NSE_EQ", name: "SOME NCD", isin: "INE002A07018", instrument_type: "N0", trading_symbol: "X" },
  { segment: "NSE_EQ", name: "TINY SME LTD", isin: "INE467B01029", instrument_type: "SM", trading_symbol: "tiny", security_type: "SME" },
  { segment: "NSE_FO", name: "RELIANCE FUT", isin: "INE002A01018", instrument_type: "FUT", trading_symbol: "RELIANCE26NOVFUT" },
];
const bse = [
  { segment: "BSE_EQ", name: "Reliance Industries Ltd", isin: "INE002A01018", instrument_type: "A", trading_symbol: "RELIANCE", exchange_token: "500325" },
  { segment: "BSE_EQ", name: "Some Debt", isin: "INE002A07018", instrument_type: "F", trading_symbol: "D", exchange_token: "9" },
  { segment: "BSE_EQ", name: "Bse Sme Co Limited", isin: "INE009A01021", instrument_type: "M", trading_symbol: "BSME", exchange_token: "543475" },
];

describe("parseUpstoxInstruments", () => {
  const r = parseUpstoxInstruments(nse, bse);

  it("keeps only equity shares", () => {
    expect(r.nse.rows.map((x) => x.isin)).toEqual(["INE002A01018", "INE467B01029"]);
    expect(r.bse.rows.map((x) => x.isin)).toEqual(["INE002A01018", "INE009A01021"]);
  });

  it("maps identifiers and SME segments", () => {
    expect(r.nse.rows[0]).toMatchObject({ exchange: "NSE", symbol: "RELIANCE", scripCode: null, segment: "MAINBOARD" });
    expect(r.nse.rows[1]).toMatchObject({ symbol: "TINY", segment: "SME" });
    expect(r.bse.rows[0]).toMatchObject({ exchange: "BSE", scripCode: "500325", symbol: null, segment: "MAINBOARD" });
    expect(r.bse.rows[1].segment).toBe("SME");
  });

  it("uses the longer name, preferring BSE on ties", () => {
    expect(r.nse.rows[0].name).toBe("Reliance Industries Ltd");
    expect(r.bse.rows[0].name).toBe("Reliance Industries Ltd");
  });
});
