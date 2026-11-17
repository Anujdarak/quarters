import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { MarketPanel } from "@/components/live-market";
import { fmtInt } from "@/components/ui";
import { companyCount } from "@/lib/queries/companies";

const FEATURES = [
  {
    href: "/companies",
    title: "Companies",
    text: "Search and browse every NSE and BSE listed company, mainboard and SME.",
  },
  {
    href: "/upcoming",
    title: "Upcoming Results",
    text: "Which companies announce their quarterly results in the coming weeks.",
  },
  {
    href: "/results",
    title: "Quarterly Results",
    text: "Quarter 1–4: who posted good results, who is still to announce, and how prices moved after.",
  },
  {
    href: "/reactions",
    title: "Market Reactions",
    text: "How share prices moved after each results announcement.",
  },
] as const;

export default function HomePage() {
  return (
    <div className="mx-auto max-w-3xl py-10 sm:py-16">
      <h1 className="text-[26px] font-semibold tracking-tight text-ink sm:text-[32px]">Indian earnings, in one place.</h1>
      <p className="mt-2 text-[14px] text-mute">
        Research NSE and BSE listed companies around their quarterly results.{" "}
        <Suspense fallback={null}>
          <CompanyCount />
        </Suspense>
      </p>

      <form action="/companies" method="get" role="search" className="mt-6 flex gap-2">
        <label htmlFor="home-q" className="sr-only">
          Search companies
        </label>
        <input
          id="home-q"
          name="q"
          placeholder="Company name, NSE symbol, BSE code or ISIN"
          className="h-10 w-full border border-line bg-panel px-3 text-[14px] text-ink placeholder:text-mute focus:border-accent focus:outline-none"
        />
        <button type="submit" className="h-10 shrink-0 bg-accent px-4 text-[13px] font-medium text-canvas hover:bg-accent/90">
          Search
        </button>
      </form>

      <ul className="mt-10 grid gap-3 sm:grid-cols-2">
        {FEATURES.map((f) => (
          <li key={f.href}>
            <Link href={f.href} className="block h-full border border-line bg-panel p-4 hover:border-ink">
              <span className="text-[14px] font-semibold text-ink">{f.title} →</span>
              <span className="mt-1 block text-[12.5px] text-mute">{f.text}</span>
            </Link>
          </li>
        ))}
      </ul>

      <MarketPanel />
    </div>
  );
}

async function CompanyCount() {
  await connection();
  const companies = await companyCount();
  if (companies === 0) return null;
  return <span className="num text-ink">{fmtInt(companies)} companies tracked.</span>;
}
