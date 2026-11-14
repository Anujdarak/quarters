import "server-only";

/**
 * DATA_MODE controls which company records are visible:
 *  - "demo": only fictional seeded records (isDemo = true) with a DEMO banner on every page.
 *  - "live": only records imported from real sources (isDemo = false).
 * The two are never mixed, so demo data cannot be mistaken for market information.
 */
export type DataMode = "demo" | "live";

export function dataMode(): DataMode {
  return process.env.DATA_MODE === "live" ? "live" : "demo";
}

export const isDemo = () => dataMode() === "demo";
