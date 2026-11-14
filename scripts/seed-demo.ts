/**
 * Seeds FICTIONAL demo companies for DATA_MODE=demo.
 *
 * - Names end in "(Demo)" and ISINs start with "DEMO", so they cannot be confused with real
 *   securities (a real ISIN starts with a 2-letter country code and passes a Luhn check).
 * - No prices, financial results or announcement dates are seeded. Those sections show
 *   "data not available" states rather than invented numbers.
 *
 *   npm run seed:demo
 */
import type { ExchangeCode, ListingSegment, ListingStatus } from "@prisma/client";
import { createPrismaClient } from "../src/lib/prisma-client";
import { companySlug } from "../src/lib/domain/identifiers";
import { ensureReferenceData } from "./lib/reference";

const prisma = createPrismaClient();

type L = [ExchangeCode, ListingSegment, string, ListingStatus];
const DEMO: { name: string; sector: string; industry: string; listings: L[] }[] = [
  { name: "Aravalli Cement Works (Demo)", sector: "Materials", industry: "Cement", listings: [["NSE", "MAINBOARD", "ARVCEM", "ACTIVE"], ["BSE", "MAINBOARD", "900001", "ACTIVE"]] },
  { name: "Bharat Grid Transmission (Demo)", sector: "Utilities", industry: "Power Transmission", listings: [["NSE", "MAINBOARD", "BHGRID", "ACTIVE"], ["BSE", "MAINBOARD", "900002", "ACTIVE"]] },
  { name: "Coromandel Agro Exports (Demo)", sector: "Consumer Staples", industry: "Agricultural Products", listings: [["BSE", "MAINBOARD", "900003", "ACTIVE"]] },
  { name: "Deccan Precision Components (Demo)", sector: "Industrials", industry: "Auto Components", listings: [["NSE", "SME", "DECPREC", "ACTIVE"]] },
  { name: "Eastern Ghats Pharma (Demo)", sector: "Health Care", industry: "Pharmaceuticals", listings: [["NSE", "MAINBOARD", "EGPHARMA", "ACTIVE"], ["BSE", "MAINBOARD", "900005", "ACTIVE"]] },
  { name: "Firozabad Glassware (Demo)", sector: "Consumer Discretionary", industry: "Household Products", listings: [["BSE", "SME", "900006", "ACTIVE"]] },
  { name: "Godavari Textiles (Demo)", sector: "Consumer Discretionary", industry: "Textiles", listings: [["BSE", "MAINBOARD", "900007", "SUSPENDED"]] },
  { name: "Hooghly Logistics (Demo)", sector: "Industrials", industry: "Logistics", listings: [["NSE", "SME", "HOOGLOG", "ACTIVE"]] },
  { name: "Indus Software Systems (Demo)", sector: "Information Technology", industry: "IT Services", listings: [["NSE", "MAINBOARD", "INDUSSW", "ACTIVE"], ["BSE", "MAINBOARD", "900009", "ACTIVE"]] },
  { name: "Jaipur Gems Exports (Demo)", sector: "Consumer Discretionary", industry: "Jewellery", listings: [["BSE", "MAINBOARD", "900010", "DELISTED"]] },
  { name: "Konkan Ports & Shipping (Demo)", sector: "Industrials", industry: "Ports", listings: [["NSE", "MAINBOARD", "KONKPORT", "ACTIVE"], ["BSE", "MAINBOARD", "900011", "ACTIVE"]] },
  { name: "Lucknow Food Processors (Demo)", sector: "Consumer Staples", industry: "Packaged Foods", listings: [["NSE", "SME", "LKOFOOD", "ACTIVE"], ["BSE", "SME", "900012", "ACTIVE"]] },
];

async function main() {
  const src = await ensureReferenceData(prisma, {
    key: "demo",
    name: "Demo fixtures (fictional)",
    licenceNotes: "Fictional records for development. Not market data.",
    publicDisplay: true,
    isDemo: true,
  });
  const log = await prisma.ingestionLog.create({
    data: { dataSourceId: src.id, job: "master:demo", status: "RUNNING", inputRef: "scripts/seed-demo.ts" },
  });
  const now = new Date();
  let inserted = 0;
  for (const [i, c] of DEMO.entries()) {
    const isin = `DEMO${String(i + 1).padStart(8, "0")}`;
    const industry = await prisma.industry.upsert({
      where: { scheme_sector_industry: { scheme: "demo", sector: c.sector, industry: c.industry } },
      create: { scheme: "demo", sector: c.sector, industry: c.industry },
      update: {},
    });
    const company = await prisma.company.upsert({
      where: { isin },
      create: { isin, name: c.name, slug: `demo-${companySlug(c.name.replace(" (Demo)", ""))}`, industryId: industry.id, isDemo: true },
      update: { name: c.name, slug: `demo-${companySlug(c.name.replace(" (Demo)", ""))}`, industryId: industry.id },
    });
    for (const [exchange, segment, id, status] of c.listings) {
      await prisma.security.upsert({
        where: { companyId_exchange_segment: { companyId: company.id, exchange, segment } },
        create: {
          companyId: company.id,
          exchange,
          segment,
          status,
          symbol: exchange === "NSE" ? id : null,
          scripCode: exchange === "BSE" ? id : null,
          sourceKey: "demo",
          fetchedAt: now,
        },
        update: { status },
      });
    }
    inserted++;
  }
  await prisma.ingestionLog.update({
    where: { id: log.id },
    data: { status: "SUCCEEDED", finishedAt: new Date(), recordsRead: DEMO.length, inserted },
  });
  console.log(`Seeded ${inserted} fictional demo companies.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    // Open sockets/handles (fetch keep-alive, libSQL) can keep Node alive after the work is done,
    // which would hang the scheduled daily job.
    process.exit(process.exitCode ?? 0);
  });
