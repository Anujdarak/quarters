import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { NavLinks, NavList } from "./nav-links";
import { ThemeToggle } from "./theme-toggle";
import { MarketTicker } from "./live-market";

/** The four main features. Methodology and Risk Disclosures live in the footer. */
export const NAV = [
  { href: "/companies", label: "Companies" },
  { href: "/upcoming", label: "Upcoming Results" },
  { href: "/results", label: "Quarterly Results" },
  { href: "/reactions", label: "Market Reactions" },
] as const;

export function DemoBanner() {
  return (
    <div role="status" className="border-b border-warn/40 bg-warn/10 px-4 py-1.5 text-center text-[12px] text-warn">
      <strong className="font-semibold">DEMO ENVIRONMENT:</strong> companies shown are fictional test records, not real
      market information. Do not use for investment research.
    </div>
  );
}

export function AppShell({ children, demo }: { children: ReactNode; demo: boolean }) {
  return (
    <div className="flex min-h-dvh flex-col">
      {demo && <DemoBanner />}
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/95 backdrop-blur-sm">
        <div className="flex h-11 items-center gap-4 px-4">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <span aria-hidden className="grid h-5 w-5 place-items-center bg-accent font-mono text-[10px] font-bold text-canvas">
              Q
            </span>
            <span className="text-[13px] font-semibold tracking-tight text-ink">
              Quarters<span className="text-mute"> · Earnings Intelligence</span>
            </span>
          </Link>
          <form action="/companies" method="get" role="search" className="ml-auto w-full max-w-sm">
            <label htmlFor="global-q" className="sr-only">
              Search companies
            </label>
            <input
              id="global-q"
              name="q"
              placeholder="Search company, NSE symbol, BSE code or ISIN"
              className="h-7 w-full border border-line bg-panel px-2 text-[12px] text-ink placeholder:text-mute focus:border-accent focus:outline-none"
            />
          </form>
          <ThemeToggle />
        </div>
        <nav aria-label="Primary" className="border-t border-line">
          <Suspense fallback={<NavList items={NAV} variant="bar" path={null} />}>
            <NavLinks items={NAV} variant="bar" />
          </Suspense>
        </nav>
        <MarketTicker />
      </header>
      <main className="mx-auto w-full max-w-7xl min-w-0 flex-1 px-4 py-4 lg:px-6">{children}</main>
      <footer className="border-t border-line px-4 py-3 text-[11px] leading-relaxed text-mute lg:px-6">
        <strong className="font-semibold text-ink">
          Not registered with, authorised by, or affiliated with SEBI, NSE or BSE.
        </strong>{" "}
        Research tool, not investment advice. Historical returns do not guarantee future returns. Market data may be
        delayed or incomplete; verify against official exchange filings. See{" "}
        <Link className="text-ink underline decoration-mute underline-offset-2 hover:decoration-ink" href="/disclosures">
          Risk Disclosures
        </Link>{" "}
        and{" "}
        <Link className="text-ink underline decoration-mute underline-offset-2 hover:decoration-ink" href="/methodology">
          Methodology
        </Link>
        .
      </footer>
    </div>
  );
}
