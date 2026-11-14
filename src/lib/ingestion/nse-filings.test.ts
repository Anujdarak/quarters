import { describe, expect, it } from "vitest";
import { ymd } from "../domain/fiscal";
import { isResultsMeeting, nameKey, parseIstDateTime, parseNseBoardMeetings, parseNseFinancialResults } from "./nse-filings";

describe("NSE filing CSVs", () => {
  it("parses IST date-times to UTC", () => {
    expect(parseIstDateTime("14-Nov-2026 18:32:10")).toEqual(new Date("2026-11-14T13:02:10Z"));
    expect(parseIstDateTime("14-Nov-2026 6:30 PM")).toEqual(new Date("2026-11-14T13:00:00Z"));
    expect(parseIstDateTime("2026-11-14 09:00")).toEqual(new Date("2026-11-14T03:30:00Z"));
    expect(parseIstDateTime("garbage")).toBeNull();
  });

  it("parses a financial results export", () => {
    const csv = [
      '"SYMBOL","COMPANY NAME","AUDITED / UNAUDITED","CONSOLIDATED / NON-CONSOLIDATED","PERIOD","PERIOD ENDED","BROADCAST DATE/TIME"',
      '"RELIANCE","Reliance Industries Limited","Un-Audited","Consolidated","Quarterly","30-Sep-2026","17-Oct-2026 19:45:12"',
      '"BAD","Bad Co","","","","","not a date"',
    ].join("\n");
    const r = parseNseFinancialResults(csv);
    expect(r.skipped).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ symbol: "RELIANCE", periodEnd: ymd(2026, 9, 30), consolidated: true, period: "Quarterly" });
    expect(r.rows[0].broadcastAt).toEqual(new Date("2026-10-17T14:15:12Z"));
  });

  it("parses the real NSE 'Financial Results' export layout (Nov 2026)", () => {
    const csv = [
      '﻿"COMPANY NAME","AUDITED / UNAUDITED","CUMULATIVE / NON-CUMULATIVE","CONSOLIDATED / NON-CONSOLIDATED","IND AS/ NON IND AS","PERIOD","PERIOD ENDED","RELATING TO","** XBRL","Exchange Received Time","Exchange Dissemination Time","Time Taken"',
      '"Kanani Industries Limited","Un-Audited","Non-cumulative","Non-Consolidated","Ind-AS New","Quarterly","30-Jun-2024","First Quarter","https://example/x.xml","06-Aug-2026 14:07:24","06-Aug-2026 14:07:55","00:00:31"',
    ].join("\n");
    const r = parseNseFinancialResults(csv);
    expect(r.rows[0]).toMatchObject({ symbol: null, companyName: "Kanani Industries Limited", periodEnd: ymd(2024, 6, 30), consolidated: false });
    expect(r.rows[0].broadcastAt).toEqual(new Date("2026-08-06T08:37:55Z")); // dissemination time, not received time
  });

  it("reports the headers of an unknown layout", () => {
    expect(() => parseNseFinancialResults('"A","B"\n"1","2"')).toThrow(/Found headers: A, B/);
  });

  it("parses board meetings and spots results meetings", () => {
    const csv = ['"SYMBOL","COMPANY NAME","PURPOSE","BOARD MEETING DATE","DATE OF INTIMATION"', '"TCS","Tata Consultancy Services Limited","Financial Results","08-Jan-2027","20-Dec-2026 10:00"'].join("\n");
    const r = parseNseBoardMeetings(csv);
    expect(r.rows[0]).toMatchObject({ symbol: "TCS", meetingDate: ymd(2027, 1, 8), purpose: "Financial Results" });
    expect(isResultsMeeting("Financial Results/Dividend")).toBe(true);
    expect(isResultsMeeting("Fund Raising")).toBe(false);
  });

  it("normalises names for matching", () => {
    expect(nameKey("Reliance Industries Ltd.")).toBe(nameKey("RELIANCE INDUSTRIES LIMITED"));
  });
});
