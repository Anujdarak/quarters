/**
 * Imports official exchange company-master files that the operator has downloaded manually.
 *
 *   npm run import:master -- --nse-eq data/raw/EQUITY_L.csv \
 *                           --nse-sme data/raw/SME_EQUITY_L.csv \
 *                           --bse data/raw/bse_equity.csv --bse-segment auto [--dry-run]
 *
 *   npm run import:master -- --upstox      # download + import the Upstox instrument masters instead
 *
 * Behaviour:
 *  - Companies are matched across exchanges by ISIN. Each exchange listing is a separate security.
 *  - Symbol, segment and status changes are recorded as security_events, never silently overwritten.
 *  - When a FULL NSE file for a segment is imported, active NSE listings in that segment that are
 *    absent from the file are marked INACTIVE (not deleted), with an event.
 *  - Invalid rows are skipped and reported in ingestion_logs.errors.
 *
 * Performance: existing state is loaded in a few queries, the diff is computed in memory, and
 * writes go out in batched transactions. That matters for a remote database such as Turso,
 * where every query is a network round trip.
 */
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import type { ExchangeCode, ListingSegment, ListingStatus, Prisma, SecurityEventType } from "@prisma/client";
import { companySlug, uniqueSlug } from "../src/lib/domain/identifiers";
import { parseUpstoxInstruments, type UpstoxInstrument } from "../src/lib/ingestion/upstox-instruments";
import { mergeByIsin, parseBseList, parseNseList, type MasterRow, type RowIssue, type Segment } from "../src/lib/ingestion/master-files";
import { createPrismaClient } from "../src/lib/prisma-client";
import { ensureReferenceData } from "./lib/reference";

const prisma = createPrismaClient();
const BATCH = 200;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const dryRun = process.argv.includes("--dry-run");

interface Input {
  file: string;
  sourceKey: string;
  sourceName: string;
  sourceUrl: string;
  rows: MasterRow[];
  skipped: RowIssue[];
  hash: string;
  fullSegment?: { exchange: ExchangeCode; segment: ListingSegment };
}

const UPSTOX_URL = (x: "NSE" | "BSE") => `https://assets.upstox.com/market-quote/instruments/exchange/${x}.json.gz`;

/** Downloads the public Upstox instrument masters into data/raw/upstox and splits them into four full-segment inputs. */
async function loadUpstox(): Promise<Input[]> {
  const dir = path.join("data", "raw", "upstox");
  mkdirSync(dir, { recursive: true });
  const files = {} as Record<"NSE" | "BSE", { records: UpstoxInstrument[]; hash: string; file: string }>;
  for (const x of ["NSE", "BSE"] as const) {
    const res = await fetch(UPSTOX_URL(x), { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`Download failed for ${UPSTOX_URL(x)}: HTTP ${res.status}`);
    const gz = Buffer.from(await res.arrayBuffer());
    const file = path.join(dir, `${x}.json.gz`);
    writeFileSync(file, gz);
    const text = gunzipSync(gz).toString("utf8");
    files[x] = { records: JSON.parse(text), hash: createHash("sha256").update(text).digest("hex").slice(0, 16), file };
  }
  const parsed = parseUpstoxInstruments(files.NSE.records, files.BSE.records);
  const mk = (x: "NSE" | "BSE", segment: ListingSegment): Input => {
    const p = x === "NSE" ? parsed.nse : parsed.bse;
    return {
      file: files[x].file,
      sourceKey: `upstox-instruments-${x.toLowerCase()}-${segment.toLowerCase()}`,
      sourceName: `Upstox instrument master (${x} ${segment === "SME" ? "SME" : "mainboard"} equity)`,
      sourceUrl: UPSTOX_URL(x),
      hash: files[x].hash,
      fullSegment: { exchange: x, segment },
      rows: p.rows.filter((r) => r.segment === segment),
      skipped: segment === "MAINBOARD" ? p.skipped : [],
    };
  };
  return [mk("NSE", "MAINBOARD"), mk("NSE", "SME"), mk("BSE", "MAINBOARD"), mk("BSE", "SME")];
}

function load(): Input[] {
  const inputs: Input[] = [];
  const read = (f: string) => {
    const text = readFileSync(f, "utf8");
    return { text, hash: createHash("sha256").update(text).digest("hex").slice(0, 16) };
  };
  const nseUrl = "https://www.nseindia.com/static/market-data/securities-available-for-trading";
  const nseEq = arg("nse-eq");
  if (nseEq) {
    const { text, hash } = read(nseEq);
    inputs.push({ file: nseEq, sourceKey: "nse-equity-list", sourceName: "NSE Securities available for trading (EQUITY_L)", sourceUrl: nseUrl, hash, fullSegment: { exchange: "NSE", segment: "MAINBOARD" }, ...parseNseList(text, "MAINBOARD", path.basename(nseEq)) });
  }
  const nseSme = arg("nse-sme");
  if (nseSme) {
    const { text, hash } = read(nseSme);
    inputs.push({ file: nseSme, sourceKey: "nse-sme-list", sourceName: "NSE Emerge securities available for trading (SME_EQUITY_L)", sourceUrl: nseUrl, hash, fullSegment: { exchange: "NSE", segment: "SME" }, ...parseNseList(text, "SME", path.basename(nseSme)) });
  }
  const bse = arg("bse");
  if (bse) {
    const seg = (arg("bse-segment") ?? "auto").toUpperCase();
    const segment: Segment | "auto" = seg === "SME" ? "SME" : seg === "MAINBOARD" ? "MAINBOARD" : "auto";
    const { text, hash } = read(bse);
    inputs.push({ file: bse, sourceKey: "bse-scrip-list", sourceName: "BSE List of Scrips", sourceUrl: "https://www.bseindia.com/corporates/List_Scrips.html", hash, ...parseBseList(text, segment, path.basename(bse)) });
  }
  if (!inputs.length) {
    console.error("No input files. Pass --nse-eq, --nse-sme and/or --bse (see docs/API_SETUP.md).");
    process.exit(2);
  }
  return inputs;
}

async function runBatched(ops: Prisma.PrismaPromise<unknown>[], label: string) {
  for (let i = 0; i < ops.length; i += BATCH) {
    await prisma.$transaction(ops.slice(i, i + BATCH));
    process.stdout.write(`\r${label}: batch ${i / BATCH + 1}/${Math.ceil(ops.length / BATCH)}`);
  }
  if (ops.length) process.stdout.write("\n");
}

async function main() {
  const inputs = process.argv.includes("--upstox") ? await loadUpstox() : load();
  const { companies, conflicts } = mergeByIsin(inputs.flatMap((i) => i.rows));
  const rowSource = new Map<MasterRow, Input>();
  for (const i of inputs) for (const r of i.rows) rowSource.set(r, i);

  for (const i of inputs) console.log(`${path.basename(i.file)}: ${i.rows.length} rows parsed, ${i.skipped.length} skipped`);
  console.log(`${companies.length} unique companies by ISIN; ${conflicts.length} same-exchange conflicts`);
  if (dryRun) {
    for (const i of inputs) i.skipped.slice(0, 10).forEach((s) => console.log(`  skip ${path.basename(i.file)}:${s.line} ${s.reason}`));
    conflicts.slice(0, 10).forEach((c) => console.log(`  conflict ${c}`));
    return;
  }

  // ---- Register sources and open ingestion logs ----
  const logs = new Map<string, string>();
  for (const i of inputs) {
    const src = await ensureReferenceData(prisma, {
      key: i.sourceKey,
      name: i.sourceName,
      homepage: i.sourceUrl,
      licenceNotes: i.sourceKey.startsWith("upstox-")
        ? "Public Upstox instrument master file (company identifiers only, no prices). Public display of these identifiers: UNCONFIRMED, see DATA_SOURCES.md."
        : "Official exchange list, downloaded manually by the operator (exchange website terms prohibit automated collection). " +
          "Public display of these identifiers: UNCONFIRMED, see DATA_SOURCES.md.",
      publicDisplay: false,
      isDemo: false,
    });
    const log = await prisma.ingestionLog.create({
      data: { dataSourceId: src.id, job: `master:${i.sourceKey}`, status: "RUNNING", recordsRead: i.rows.length, inputRef: `${path.basename(i.file)}#${i.hash}` },
    });
    logs.set(i.sourceKey, log.id);
  }

  try {
    // ---- Load existing state (3 queries) ----
    const [existingCompanies, existingSecurities, existingIndustries] = await Promise.all([
      prisma.company.findMany({ select: { id: true, isin: true, name: true, slug: true, industryId: true, isDemo: true } }),
      prisma.security.findMany({ select: { id: true, companyId: true, exchange: true, segment: true, symbol: true, scripCode: true, status: true } }),
      prisma.industry.findMany({ where: { scheme: "BSE" } }),
    ]);
    const companyByIsin = new Map(existingCompanies.map((c) => [c.isin, c]));
    const secByKey = new Map(existingSecurities.map((s) => [`${s.companyId}|${s.exchange}`, s]));
    // Owner of each exchange identifier, to detect reuse by a different company before writing.
    const symbolOwner = new Map(existingSecurities.filter((s) => s.symbol).map((s) => [`${s.exchange}|${s.symbol}`, s.id]));
    const scripOwner = new Map(existingSecurities.filter((s) => s.scripCode).map((s) => [`${s.exchange}|${s.scripCode}`, s.id]));
    const industryByKey = new Map(existingIndustries.map((i) => [`${i.sector}|${i.industry}`, i.id]));
    const takenSlugs = new Set(existingCompanies.map((c) => c.slug));

    // ---- Compute the diff in memory ----
    const now = new Date();
    const industryCreates: Prisma.IndustryCreateManyInput[] = [];
    const companyCreates: Prisma.CompanyCreateManyInput[] = [];
    const securityCreates: Prisma.SecurityCreateManyInput[] = [];
    const eventCreates: Prisma.SecurityEventCreateManyInput[] = [];
    const updates: Prisma.PrismaPromise<unknown>[] = [];
    const counts = new Map<string, { inserted: number; updated: number; errors: string[] }>();
    const stat = (k: string) => {
      let c = counts.get(k);
      if (!c) counts.set(k, (c = { inserted: 0, updated: 0, errors: [] }));
      return c;
    };
    const seen = new Set<string>();

    for (const mc of companies) {
      let industryId: string | undefined;
      if (mc.industry) {
        const sector = mc.sector ?? "Unclassified";
        const key = `${sector}|${mc.industry}`;
        industryId = industryByKey.get(key);
        if (!industryId) {
          industryId = randomUUID();
          industryByKey.set(key, industryId);
          industryCreates.push({ id: industryId, scheme: "BSE", sector, industry: mc.industry });
        }
      }

      let company = companyByIsin.get(mc.isin);
      if (company?.isDemo) throw new Error(`ISIN ${mc.isin} collides with a demo record; demo ISINs must never be real`);
      if (!company) {
        const slug = uniqueSlug(companySlug(mc.name), mc.isin, takenSlugs);
        takenSlugs.add(slug);
        company = { id: randomUUID(), isin: mc.isin, name: mc.name, slug, industryId: industryId ?? null, isDemo: false };
        companyCreates.push({ id: company.id, isin: mc.isin, name: mc.name, slug, industryId });
      } else if (company.name !== mc.name || (industryId && company.industryId !== industryId)) {
        updates.push(prisma.company.update({ where: { id: company.id }, data: { name: mc.name, industryId: industryId ?? company.industryId } }));
      }

      for (const row of mc.listings) {
        const src = rowSource.get(row)!;
        const existing = secByKey.get(`${company.id}|${row.exchange}`);
        const selfId = existing?.id ?? randomUUID();

        // An identifier now held by a different security means reuse or a data error: skip and report.
        const idKey = row.symbol ? `${row.exchange}|${row.symbol}` : `${row.exchange}|${row.scripCode}`;
        const owners = row.symbol ? symbolOwner : scripOwner;
        const owner = owners.get(idKey);
        if (owner && owner !== selfId) {
          stat(src.sourceKey).errors.push(`${row.isin} ${row.exchange}: identifier ${row.symbol ?? row.scripCode} already belongs to another listing; skipped for review`);
          continue;
        }
        owners.set(idKey, selfId);
        seen.add(selfId);

        const data = {
          segment: row.segment,
          symbol: row.symbol,
          scripCode: row.scripCode,
          series: row.series,
          listingDate: row.listingDate,
          faceValue: row.faceValue,
          status: row.status as ListingStatus,
          sourceKey: src.sourceKey,
          sourceUrl: src.sourceUrl,
          fetchedAt: now,
        };
        if (!existing) {
          securityCreates.push({ id: selfId, companyId: company.id, exchange: row.exchange, ...data });
          eventCreates.push({ securityId: selfId, type: "LISTED", effectiveOn: row.listingDate, newValue: row.symbol ?? row.scripCode, sourceKey: src.sourceKey });
          stat(src.sourceKey).inserted++;
          continue;
        }
        const ev = (type: SecurityEventType, oldValue: string | null, newValue: string | null) =>
          eventCreates.push({ securityId: existing.id, type, oldValue, newValue, sourceKey: src.sourceKey });
        if (row.exchange === "NSE" && existing.symbol !== row.symbol) {
          if (existing.symbol) symbolOwner.delete(`NSE|${existing.symbol}`);
          ev("SYMBOL_CHANGE", existing.symbol, row.symbol);
        }
        if (existing.segment !== row.segment)
          ev(existing.segment === "SME" && row.segment === "MAINBOARD" ? "MIGRATED_SME_TO_MAINBOARD" : "OTHER", existing.segment, row.segment);
        if (existing.status !== row.status)
          ev(row.status === "SUSPENDED" ? "SUSPENDED" : row.status === "DELISTED" ? "DELISTED" : "OTHER", existing.status, row.status);
        updates.push(prisma.security.update({ where: { id: existing.id }, data }));
        stat(src.sourceKey).updated++;
      }
    }

    // Full-file imports: listings that disappeared become INACTIVE (never deleted).
    const demoCompanyIds = new Set(existingCompanies.filter((c) => c.isDemo).map((c) => c.id));
    for (const i of inputs) {
      if (!i.fullSegment) continue;
      const gone = existingSecurities.filter(
        (s) => s.exchange === i.fullSegment!.exchange && s.segment === i.fullSegment!.segment && s.status === "ACTIVE" && !seen.has(s.id) && !demoCompanyIds.has(s.companyId),
      );
      for (const g of gone) {
        updates.push(prisma.security.update({ where: { id: g.id }, data: { status: "INACTIVE" } }));
        eventCreates.push({ securityId: g.id, type: "OTHER", oldValue: "ACTIVE", newValue: "INACTIVE (absent from latest official list)", sourceKey: i.sourceKey });
      }
      if (gone.length) console.log(`${i.sourceKey}: ${gone.length} listings absent from latest file → INACTIVE`);
    }

    // ---- Write: creates in dependency order, then updates, then events ----
    const chunks = <T,>(xs: T[]) => Array.from({ length: Math.ceil(xs.length / BATCH) }, (_, k) => xs.slice(k * BATCH, (k + 1) * BATCH));
    await runBatched(chunks(industryCreates).map((data) => prisma.industry.createMany({ data })), "industries");
    await runBatched(chunks(companyCreates).map((data) => prisma.company.createMany({ data })), "companies");
    await runBatched(chunks(securityCreates).map((data) => prisma.security.createMany({ data })), "securities");
    await runBatched(updates, "updates");
    await runBatched(chunks(eventCreates).map((data) => prisma.securityEvent.createMany({ data })), "events");

    // ---- Close logs ----
    for (const i of inputs) {
      const c = stat(i.sourceKey);
      const errors = [...i.skipped.map((s) => `line ${s.line}: ${s.reason}`), ...c.errors, ...conflicts.filter((x) => i.rows.some((r) => x.startsWith(r.isin)))];
      await prisma.ingestionLog.update({
        where: { id: logs.get(i.sourceKey)! },
        data: { status: c.errors.length ? "PARTIAL" : "SUCCEEDED", finishedAt: new Date(), inserted: c.inserted, updated: c.updated, skipped: i.skipped.length + c.errors.length, errors: errors.length ? errors.slice(0, 500) : undefined },
      });
      console.log(`${i.sourceKey}: inserted ${c.inserted}, updated ${c.updated}, skipped ${i.skipped.length + c.errors.length}`);
    }
  } catch (e) {
    for (const id of logs.values())
      await prisma.ingestionLog.update({ where: { id }, data: { status: "FAILED", finishedAt: new Date(), errors: [(e as Error).message] } }).catch(() => {});
    throw e;
  }
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
