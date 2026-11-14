import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Risk Disclosures" };

const RISKS: [string, string][] = [
  ["Not authorised by SEBI, NSE or BSE", "This platform is independent. It is not registered with, authorised by, endorsed by or affiliated with the Securities and Exchange Board of India (SEBI), the National Stock Exchange of India (NSE) or BSE Limited. Names of exchanges are used only to identify where securities are listed and where source filings come from."],
  ["Not investment advice", "This platform is a research tool. It does not provide personalised investment advice or recommendations to buy, sell or hold any security, and it is not registered with SEBI as an Investment Adviser or Research Analyst."],
  ["Past performance", "Historical returns, including past reactions to earnings announcements, do not guarantee future returns."],
  ["Results and prices can diverge", "Strong financial results do not guarantee a positive stock-price reaction. Stocks can fall after excellent results and rise after weak results, because prices reflect expectations, guidance, valuation and wider market conditions."],
  ["SME liquidity", "SME-platform stocks can have low liquidity, large minimum lot sizes, wide bid-ask spreads and long periods without trades. Displayed prices may not be achievable in practice."],
  ["Circuit limits and suspensions", "SME and other stocks can hit price bands (circuit limits) or be suspended, so a move after results may take several sessions to appear, or may not be measurable at all."],
  ["Data may be delayed or incomplete", "Data may be delayed, incomplete or contain errors from source documents or processing. Coverage of NSE, BSE and SME companies is shown transparently and may not be complete."],
  ["AI assessments may be wrong", "Where indicative assessments are shown, they are generated with the help of a language model from structured data and may be inaccurate or incomplete. They are not predictions."],
  ["Verify with official filings", "Always verify figures against the company's official filings on NSE or BSE before acting on them. Links to source documents are provided wherever available."],
  ["Your responsibility", "Investment decisions are your own. Consider consulting a SEBI-registered investment adviser."],
];

export default function DisclosuresPage() {
  return (
    <>
      <PageHeader title="Risk Disclosures" subtitle="Read these before using any information on this platform." />
      <ol className="grid max-w-4xl gap-px border border-line bg-line">
        {RISKS.map(([title, body], i) => (
          <li key={title} className="grid grid-cols-[2.5rem_1fr] bg-panel px-3 py-2.5">
            <span className="num text-mute">{String(i + 1).padStart(2, "0")}</span>
            <div>
              <h2 className="text-[13px] font-semibold">{title}</h2>
              <p className="mt-0.5 text-[12.5px] text-ink/85">{body}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-4 max-w-4xl text-[12px] text-mute">
        A disclaimer alone does not make a product compliant with Indian securities regulations. The operators of this
        platform will obtain legal advice on SEBI Research Analyst and Investment Adviser requirements before publishing
        any research classification.
      </p>
    </>
  );
}
