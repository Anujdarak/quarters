import type { PrismaClient } from "@prisma/client";

/** Ensures exchanges exist and registers a data source, returning it. */
export async function ensureReferenceData(
  prisma: PrismaClient,
  source: { key: string; name: string; homepage?: string; licenceNotes?: string; publicDisplay: boolean; isDemo: boolean },
) {
  await prisma.exchange.upsert({
    where: { code: "NSE" },
    create: { code: "NSE", name: "National Stock Exchange of India", website: "https://www.nseindia.com" },
    update: {},
  });
  await prisma.exchange.upsert({
    where: { code: "BSE" },
    create: { code: "BSE", name: "BSE Limited", website: "https://www.bseindia.com" },
    update: {},
  });
  return prisma.dataSource.upsert({
    where: { key: source.key },
    create: source,
    update: { name: source.name, homepage: source.homepage, licenceNotes: source.licenceNotes },
  });
}
