/**
 * Copies every table from the local SQLite file into Turso, in batches.
 *
 *   npm run db:copy:turso                     # all tables
 *   npm run db:copy:turso -- historical_prices # only some tables
 *   npm run db:copy:turso -- --dates-only      # only convert integer dates already in Turso
 *
 * Run `npm run db:migrate:turso` first so the tables exist. Rows already in Turso are left alone
 * (INSERT OR IGNORE on the primary/unique keys), so the copy can be re-run to top up new rows.
 */
import { readFileSync } from "node:fs";
import { createClient, type InValue } from "@libsql/client";

const LOCAL = process.env.LOCAL_DB_FILE ?? "file:prisma/dev.db";

// Parent tables before children, so foreign keys always resolve.
const ORDER = [
  "data_sources",
  "exchanges",
  "industries",
  "companies",
  "securities",
  "security_events",
  "trading_calendar",
  "financial_periods",
  "earnings_announcements",
  "quarterly_results",
  "financial_metrics",
  "board_meetings",
  "upcoming_results",
  "historical_prices",
  "corporate_actions",
  "corporate_announcements",
  "company_news",
  "earnings_assessments",
  "ingestion_logs",
];

async function main() {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) throw new Error("Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN (.env)");
  const src = createClient({ url: LOCAL });
  const dst = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });

  const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const tables = only.length ? ORDER.filter((t) => only.includes(t)) : ORDER;

  const datesOnly = process.argv.includes("--dates-only");
  for (const table of datesOnly ? [] : tables) {
    const cols = (await src.execute(`PRAGMA table_info("${table}")`)).rows.map((r) => String(r.name));
    if (!cols.length) continue;
    const total = Number((await src.execute(`SELECT COUNT(*) AS n FROM "${table}"`)).rows[0].n);
    const before = Number((await dst.execute(`SELECT COUNT(*) AS n FROM "${table}"`)).rows[0].n);
    const perStmt = Math.max(1, Math.floor(900 / cols.length)); // stay well under SQLite's bound-variable limit
    const PAGE = perStmt * 25; // 25 statements per network round trip
    const colList = cols.map((c) => `"${c}"`).join(",");
    const rowPh = `(${cols.map(() => "?").join(",")})`;

    for (let offset = 0; offset < total; offset += PAGE) {
      const rows = (await src.execute({ sql: `SELECT ${colList} FROM "${table}" ORDER BY rowid LIMIT ? OFFSET ?`, args: [PAGE, offset] })).rows;
      const stmts = [];
      for (let i = 0; i < rows.length; i += perStmt) {
        const chunk = rows.slice(i, i + perStmt);
        stmts.push({
          sql: `INSERT OR IGNORE INTO "${table}" (${colList}) VALUES ${chunk.map(() => rowPh).join(",")}`,
          args: chunk.flatMap((r) => cols.map((c) => r[c] as InValue)),
        });
      }
      if (stmts.length) await dst.batch(stmts, "write");
      process.stdout.write(`\r${table}: ${Math.min(offset + PAGE, total)}/${total}`);
    }
    const after = Number((await dst.execute(`SELECT COUNT(*) AS n FROM "${table}"`)).rows[0].n);
    process.stdout.write(`\r${table}: ${total} local, ${after - before} copied, ${after} in Turso\n`);
  }

  await normaliseDates(dst, tables);
}

/**
 * The local SQLite file (native Prisma engine) stores DateTime as integer milliseconds, but the
 * libSQL driver adapter that the app uses on Turso binds dates as ISO text
 * ("2026-09-30T00:00:00.000+00:00"). Mixed formats make every date comparison miss, so copied
 * integer dates are rewritten into the adapter's text format.
 */
async function normaliseDates(dst: ReturnType<typeof createClient>, tables: string[]) {
  const iso = (c: string) =>
    `strftime('%Y-%m-%dT%H:%M:%S', "${c}" / 1000, 'unixepoch') || '.' || printf('%03d', "${c}" % 1000) || '+00:00'`;
  for (const [table, cols] of dateColumns()) {
    if (!tables.includes(table)) continue;
    // A re-copied row can duplicate an already-normalised one under a key that includes a date
    // (e.g. historical_prices); OR IGNORE skips it and the leftover integer copy is deleted.
    const stmts = cols.flatMap((c) => [
      `UPDATE OR IGNORE "${table}" SET "${c}" = ${iso(c)} WHERE typeof("${c}") = 'integer'`,
      `DELETE FROM "${table}" WHERE typeof("${c}") = 'integer'`,
    ]);
    await dst.batch(stmts, "write");
    console.log(`${table}: dates normalised (${cols.join(", ")})`);
  }
}

/** DateTime columns per table, read from prisma/schema.prisma (models use @@map; fields are not renamed). */
function dateColumns(): Map<string, string[]> {
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  const out = new Map<string, string[]>();
  for (const m of schema.matchAll(/^model\s+\w+\s*\{([\s\S]*?)^\}/gm)) {
    const body = m[1];
    const table = /@@map\("([^"]+)"\)/.exec(body)?.[1];
    if (!table) continue;
    const cols = [...body.matchAll(/^\s+(\w+)\s+DateTime\??(\s|$)/gm)].map((f) => f[1]);
    if (cols.length) out.set(table, cols);
  }
  return out;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
