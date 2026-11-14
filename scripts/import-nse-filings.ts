/**
 * Imports NSE corporate-filing CSVs that the operator downloaded from nseindia.com
 * (Companies > Corporate Filings > Financial Results / Board Meetings > Download .csv):
 *
 *   npm run import:nse -- --results data/raw/nse/results.csv [--results more.csv] --board data/raw/nse/board.csv
 *
 * - Financial Results → earnings_announcements with the exact exchange broadcast time
 *   (sourceKey "nse-financial-results"). These take precedence over sync-detected dates.
 * - Board Meetings → board_meetings; future "financial results" meetings become OFFICIAL
 *   upcoming results with the meeting date.
 * Companies are matched by NSE symbol, falling back to a normalised company name.
 * Re-importing the same file is safe: existing rows are skipped.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { AnnouncementTiming, Prisma } from "@prisma/client";
import { istToday } from "../src/lib/domain/deadlines";
import { endOfMonth, fiscalQuarterOf, fiscalYearOf } from "../src/lib/domain/fiscal";
import { announcementTiming } from "../src/lib/domain/reaction";
import { isResultsMeeting, nameKey, parseNseBoardMeetings, parseNseFinancialResults } from "../src/lib/ingestion/nse-filings";
import { createPrismaClient } from "../src/lib/prisma-client";
import { ensureReferenceData } from "./lib/reference";

const prisma = createPrismaClient();
const RESULTS_KEY = "nse-financial-results";
const BOARD_KEY = "nse-board-meetings";
const FILINGS_URL = "https://www.nseindia.com/companies-listing/corporate-filings-financial-results";
const BOARD_URL = "https://www.nseindia.com/companies-listing/corporate-filings-board-meetings";

const args = (name: string) => process.argv.flatMap((a, i, all) => (a === `--${name}` && all[i + 1] ? [all[i + 1]] : []));

async function main() {
  const resultFiles = args("results");
  const boardFiles = args("board");
  if (!resultFiles.length && !boardFiles.length) {
    console.error("Pass --results <csv> and/or --board <csv> (downloaded from nseindia.com corporate filings).");
    process.exit(2);
  }

  // ---- Company lookup ----
  const companies = await prisma.company.findMany({
    where: { isDemo: false },
    select: { id: true, name: true, fyEndMonth: true, securities: { select: { exchange: true, symbol: true } } },
  });
  const bySymbol = new Map<string, (typeof companies)[number]>();
  const byName = new Map<string, (typeof companies)[number] | null>(); // null = ambiguous
  for (const c of companies) {
    for (const s of c.securities) if (s.exchange === "NSE" && s.symbol) bySymbol.set(s.symbol, c);
    const k = nameKey(c.name);
    byName.set(k, byName.has(k) ? null : c);
  }
  const find = (symbol: string | null, name: string) => (symbol && bySymbol.get(symbol)) || byName.get(nameKey(name)) || undefined;
  const unmatched = new Set<string>();

  // ---- Financial results ----
  if (resultFiles.length) {
    const src = await ensureReferenceData(prisma, {
      key: RESULTS_KEY,
      name: "NSE Corporate Filings: Financial Results (operator download)",
      homepage: FILINGS_URL,
      licenceNotes: "Downloaded manually from nseindia.com; exchange terms prohibit automated collection. Announcement facts with links to filings.",
      publicDisplay: false,
      isDemo: false,
    });
    const existing = await prisma.earningsAnnouncement.findMany({ where: { sourceKey: RESULTS_KEY }, select: { companyId: true, announcedAt: true, basis: true, version: true } });
    const seen = new Set(existing.map((e) => `${e.companyId}|${e.announcedAt.getTime()}|${e.basis}|${e.version}`));
    const creates: Prisma.EarningsAnnouncementCreateManyInput[] = [];
    let read = 0;
    let skipped = 0;
    for (const f of resultFiles) {
      const parsed = parseNseFinancialResults(readFileSync(f, "utf8"), path.basename(f));
      read += parsed.rows.length;
      skipped += parsed.skipped.length;
      for (const r of parsed.rows) {
        const c = find(r.symbol, r.companyName);
        if (!c) {
          unmatched.add(r.symbol ?? r.companyName);
          continue;
        }
        // Without a period-end column, results are for the last quarter that ended before the broadcast.
        const b = new Date(r.broadcastAt.getTime() + 5.5 * 3600_000);
        const periodEnd = r.periodEnd ?? lastQuarterEndBefore(new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate())));
        const basis = r.consolidated === null ? null : r.consolidated ? "CONSOLIDATED" : "STANDALONE";
        const version = r.revision ? "REVISED" : "ORIGINAL";
        const key = `${c.id}|${r.broadcastAt.getTime()}|${basis}|${version}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const period = (r.period ?? "").toUpperCase();
        creates.push({
          companyId: c.id,
          exchange: "NSE",
          fiscalYear: fiscalYearOf(periodEnd, c.fyEndMonth),
          periodType: period.includes("HALF") ? "HALF_YEAR" : "QUARTER",
          fiscalPart: fiscalQuarterOf(periodEnd, c.fyEndMonth),
          periodEnd,
          announcedAt: r.broadcastAt,
          timing: announcementTiming(r.broadcastAt) as AnnouncementTiming,
          basis,
          version,
          subject: `Financial results (${r.period ?? "quarterly"}${r.revision ? ", revised" : ""})`,
          sourceKey: RESULTS_KEY,
          sourceUrl: FILINGS_URL,
          fetchedAt: new Date(),
        });
      }
    }
    for (let i = 0; i < creates.length; i += 500) await prisma.earningsAnnouncement.createMany({ data: creates.slice(i, i + 500) });
    await prisma.ingestionLog.create({
      data: { dataSourceId: src.id, job: "import:nse-results", status: "SUCCEEDED", finishedAt: new Date(), recordsRead: read, inserted: creates.length, skipped, inputRef: resultFiles.map((f) => path.basename(f)).join(",") },
    });
    console.log(`financial results: ${read} rows, ${creates.length} new announcements, ${skipped} unparseable`);
  }

  // ---- Board meetings ----
  if (boardFiles.length) {
    const src = await ensureReferenceData(prisma, {
      key: BOARD_KEY,
      name: "NSE Corporate Filings: Board Meetings (operator download)",
      homepage: BOARD_URL,
      licenceNotes: "Downloaded manually from nseindia.com; exchange terms prohibit automated collection.",
      publicDisplay: false,
      isDemo: false,
    });
    const existing = await prisma.boardMeeting.findMany({ where: { sourceKey: BOARD_KEY }, select: { id: true, companyId: true, meetingDate: true, purpose: true } });
    const byKey = new Map(existing.map((e) => [`${e.companyId}|${e.meetingDate.getTime()}|${e.purpose}`, e.id]));
    const today = istToday();
    let read = 0;
    let inserted = 0;
    let official = 0;
    for (const f of boardFiles) {
      const parsed = parseNseBoardMeetings(readFileSync(f, "utf8"), path.basename(f));
      read += parsed.rows.length;
      for (const r of parsed.rows) {
        const c = find(r.symbol, r.companyName);
        if (!c) {
          unmatched.add(r.symbol ?? r.companyName);
          continue;
        }
        const key = `${c.id}|${r.meetingDate.getTime()}|${r.purpose}`;
        let id = byKey.get(key);
        if (!id) {
          id = (
            await prisma.boardMeeting.create({
              data: { companyId: c.id, exchange: "NSE", meetingDate: r.meetingDate, purpose: r.purpose, intimatedAt: r.intimatedAt, sourceKey: BOARD_KEY, sourceUrl: BOARD_URL, fetchedAt: new Date() },
            })
          ).id;
          byKey.set(key, id);
          inserted++;
        }
        if (!isResultsMeeting(r.purpose) || r.meetingDate.getTime() < today.getTime()) continue;
        const periodEnd = lastQuarterEndBefore(r.meetingDate);
        const fy = fiscalYearOf(periodEnd, c.fyEndMonth);
        const q = fiscalQuarterOf(periodEnd, c.fyEndMonth);
        await prisma.upcomingResult.upsert({
          where: { companyId_fiscalYear_periodType_fiscalPart: { companyId: c.id, fiscalYear: fy, periodType: "QUARTER", fiscalPart: q } },
          create: { companyId: c.id, fiscalYear: fy, periodType: "QUARTER", fiscalPart: q, status: "OFFICIAL", expectedDate: r.meetingDate, boardMeetingId: id, method: "NSE board meeting intimation", sourceUrl: BOARD_URL },
          update: { status: "OFFICIAL", expectedDate: r.meetingDate, boardMeetingId: id, method: "NSE board meeting intimation", sourceUrl: BOARD_URL },
        });
        official++;
      }
    }
    await prisma.ingestionLog.create({
      data: { dataSourceId: src.id, job: "import:nse-board", status: "SUCCEEDED", finishedAt: new Date(), recordsRead: read, inserted, inputRef: boardFiles.map((f) => path.basename(f)).join(",") },
    });
    console.log(`board meetings: ${read} rows, ${inserted} new, ${official} upcoming results dates set`);
  }

  if (unmatched.size) console.log(`${unmatched.size} companies not matched (e.g. ${[...unmatched].slice(0, 8).join(", ")})`);
}

/** Last calendar quarter end (Mar/Jun/Sep/Dec) strictly before `d`. */
function lastQuarterEndBefore(d: Date): Date {
  let y = d.getUTCFullYear();
  let m = d.getUTCMonth() + 1; // 1-12
  m = m - ((m - 1) % 3) - 1; // previous quarter's last month
  if (m <= 0) {
    m += 12;
    y -= 1;
  }
  return endOfMonth(y, m);
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
