import "server-only";
import { Prisma, type ExchangeCode, type ListingSegment, type ListingStatus } from "@prisma/client";
import { cacheLife } from "next/cache";
import { prisma } from "@/lib/db";
import { isDemo } from "@/lib/env";

export const PAGE_SIZE = 50;

export interface DirectoryFilters {
  q?: string;
  exchange?: ExchangeCode;
  segment?: ListingSegment;
  status?: ListingStatus;
  sector?: string;
  industryId?: string;
  mcapMin?: number;
  mcapMax?: number;
  page?: number;
}

const EXCHANGES = ["NSE", "BSE"] as const;
const SEGMENTS = ["MAINBOARD", "SME"] as const;
const STATUSES = ["ACTIVE", "SUSPENDED", "DELISTED", "INACTIVE", "UNKNOWN"] as const;

function pick<T extends string>(v: unknown, allowed: readonly T[]): T | undefined {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
}

function posNum(v: unknown): number | undefined {
  if (typeof v !== "string" || v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** Parse untrusted URL search params into validated filters. */
export function parseFilters(sp: Record<string, string | string[] | undefined>): DirectoryFilters {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]);
  const page = Math.max(1, Math.floor(Number(one("page")) || 1));
  const q = one("q")?.trim().slice(0, 100);
  return {
    q: q || undefined,
    exchange: pick(one("exchange"), EXCHANGES),
    segment: pick(one("segment"), SEGMENTS),
    status: pick(one("status"), STATUSES),
    sector: one("sector")?.slice(0, 200) || undefined,
    industryId: one("industry")?.slice(0, 50) || undefined,
    mcapMin: posNum(one("mcapMin")),
    mcapMax: posNum(one("mcapMax")),
    page,
  };
}

export function buildWhere(f: DirectoryFilters): Prisma.CompanyWhereInput {
  const and: Prisma.CompanyWhereInput[] = [{ isDemo: isDemo() }];

  if (f.q) {
    const q = f.q;
    const upper = q.toUpperCase();
    and.push({
      OR: [
        // SQLite/libSQL LIKE is case-insensitive for ASCII, which covers exchange company names.
        { name: { contains: q } },
        { isin: upper },
        { securities: { some: { symbol: { startsWith: upper } } } },
        { securities: { some: { scripCode: q } } },
      ],
    });
  }

  // Exchange, segment and status apply to the SAME listing when combined
  // (e.g. "BSE + SME" means a BSE SME listing, not any BSE listing plus any SME listing).
  const listing: Prisma.SecurityWhereInput = {};
  if (f.exchange) listing.exchange = f.exchange;
  if (f.segment) listing.segment = f.segment;
  if (f.status) listing.status = f.status;
  if (Object.keys(listing).length) and.push({ securities: { some: listing } });

  if (f.industryId) and.push({ industryId: f.industryId });
  else if (f.sector) and.push({ industry: { sector: f.sector } });

  if (f.mcapMin !== undefined || f.mcapMax !== undefined) {
    and.push({
      marketCapCr: {
        not: null,
        ...(f.mcapMin !== undefined ? { gte: f.mcapMin } : {}),
        ...(f.mcapMax !== undefined ? { lte: f.mcapMax } : {}),
      },
    });
  }
  return { AND: and };
}

export async function searchCompanies(f: DirectoryFilters) {
  const where = buildWhere(f);
  const page = f.page ?? 1;
  const [total, rows] = await prisma.$transaction([
    prisma.company.count({ where }),
    prisma.company.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        slug: true,
        name: true,
        isin: true,
        marketCapCr: true,
        industry: { select: { sector: true, industry: true } },
        securities: {
          select: { exchange: true, segment: true, symbol: true, scripCode: true, status: true },
          orderBy: { exchange: "asc" }, // enum order: NSE first
        },
      },
    }),
  ]);
  return { total, rows, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function filterOptions() {
  const industries = await prisma.industry.findMany({
    where: { companies: { some: { isDemo: isDemo() } } },
    orderBy: [{ sector: "asc" }, { industry: "asc" }],
    select: { id: true, sector: true, industry: true },
  });
  const sectors = [...new Set(industries.map((i) => i.sector))];
  return { industries, sectors };
}

export async function getCompanyBySlug(slug: string) {
  return prisma.company.findFirst({
    where: { slug, isDemo: isDemo() },
    include: {
      industry: true,
      securities: {
        orderBy: { exchange: "asc" },
        include: { events: { orderBy: { effectiveOn: "desc" }, take: 20 } },
      },
    },
  });
}

/** Number of companies shown in the current data mode (home page). Cached: changes only on import. */
export async function companyCount(): Promise<number> {
  "use cache";
  cacheLife("hours");
  return prisma.company.count({ where: { isDemo: isDemo() } });
}
