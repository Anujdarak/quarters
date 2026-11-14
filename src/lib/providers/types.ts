/**
 * Data-provider contracts. Every external source is accessed through one of these interfaces,
 * so a free provider can later be replaced by a licensed commercial one without touching
 * pages or analytics. Implementations live in this folder and run server-side only.
 */

export interface ProviderLicence {
  /** Stable key, matches data_sources.key. */
  key: string;
  name: string;
  /**
   * May data from this provider be shown to anonymous public visitors?
   * Must stay false until confirmed in writing or by a signed licence (see DATA_SOURCES.md).
   */
  publicDisplay: boolean;
  attribution: string;
  /** Fictional data: pages must show a DEMO banner. */
  isDemo: boolean;
}

export interface DailyBar {
  date: string; // YYYY-MM-DD (exchange local date)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PriceProvider {
  licence: ProviderLicence;
  /** Unadjusted daily bars, inclusive range. Must return only real data and never interpolate. */
  dailyBars(args: { exchange: "NSE" | "BSE"; isin: string; from: string; to: string }): Promise<DailyBar[]>;
}

export interface ReportedLineItem {
  key: string;
  value: number;
  unit: "INR_CR" | "INR_PER_SHARE" | "RATIO";
  sourceTag?: string;
}

export interface ReportedStatement {
  periodEnd: string; // YYYY-MM-DD
  periodType: "QUARTER" | "HALF_YEAR" | "NINE_MONTHS" | "FULL_YEAR";
  basis: "STANDALONE" | "CONSOLIDATED";
  items: ReportedLineItem[];
  documentUrl?: string;
}

export interface FundamentalsProvider {
  licence: ProviderLicence;
  statements(args: {
    isin: string;
    basis: "STANDALONE" | "CONSOLIDATED";
    periodType: "QUARTER" | "FULL_YEAR";
  }): Promise<ReportedStatement[]>;
}

/** Thrown when a provider is not configured (e.g. missing token), so callers can show an honest "unavailable" state. */
export class ProviderNotConfiguredError extends Error {
  constructor(provider: string, missing: string) {
    super(`${provider} is not configured: set ${missing} in the server environment`);
    this.name = "ProviderNotConfiguredError";
  }
}
