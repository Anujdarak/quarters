import Link from "next/link";
import type { ReactNode } from "react";
import { upstoxDisplayAllowed } from "@/lib/providers/upstox";
import { DataUnavailable, cx } from "./ui";

const cr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

/** ₹ crore figure, right-aligned in tables via num-cell. */
export function Cr({ v }: { v: number | undefined | null }) {
  if (v === undefined || v === null) return <span className="text-mute">—</span>;
  return <span className={v < 0 ? "text-down" : undefined}>{cr.format(v)}</span>;
}

/** Signed % change; null renders "n.m." (not meaningful: zero or negative base). */
export function Pct({ v, title }: { v: number | null | undefined; title?: string }) {
  if (v === null || v === undefined) {
    return (
      <span className="text-mute" title={title ?? "Not meaningful: zero or negative base, or no prior figure"}>
        n.m.
      </span>
    );
  }
  const s = (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(1) + "%";
  return <span className={cx(v > 0 ? "text-up" : v < 0 ? "text-down" : "text-mute")}>{s}</span>;
}

/**
 * Upstox-derived content renders only where allowed (always on localhost; publicly only with
 * PUBLIC_DISPLAY_UPSTOX=true). Elsewhere an honest notice replaces it.
 */
export function UpstoxGate({ children, what = "This data" }: { children: ReactNode; what?: string }) {
  if (upstoxDisplayAllowed()) return <>{children}</>;
  return (
    <DataUnavailable title="Not available on the public site">
      {what} comes from a market-data provider whose terms do not yet allow public display. See{" "}
      <Link href="/methodology" className="underline">
        Methodology
      </Link>
      .
    </DataUnavailable>
  );
}

/** Small source/freshness line shown under Upstox-derived tables. */
export function SourceNote({ children }: { children: ReactNode }) {
  return <p className="px-3 py-2 text-[11px] leading-relaxed text-mute">{children}</p>;
}
