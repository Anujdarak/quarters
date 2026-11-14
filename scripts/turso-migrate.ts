/**
 * Applies Prisma migrations (prisma/migrations/<name>/migration.sql) to a Turso database.
 * The Prisma 6 CLI cannot migrate a libsql:// URL directly, so migrations are created locally
 * with `npm run db:migrate` (against the SQLite dev file) and shipped to Turso with this script.
 *
 *   TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... npm run db:migrate:turso
 *
 * Applied migrations are recorded in `_turso_migrations` with a checksum. An already-applied
 * migration whose file has since changed is reported as an error and never re-run.
 */
import { createClient } from "@libsql/client";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

async function main() {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) throw new Error("Set TURSO_DATABASE_URL (and TURSO_AUTH_TOKEN) to the target Turso database");
  const db = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });

  await db.execute(
    "CREATE TABLE IF NOT EXISTS _turso_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)",
  );
  const applied = new Map(
    (await db.execute("SELECT name, checksum FROM _turso_migrations")).rows.map((r) => [String(r.name), String(r.checksum)]),
  );

  const dir = path.resolve("prisma/migrations");
  if (!existsSync(dir)) throw new Error("No prisma/migrations folder. Run `npm run db:migrate` locally first.");
  const names = readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(path.join(dir, d.name, "migration.sql")))
    .map((d) => d.name)
    .sort();

  let ran = 0;
  for (const name of names) {
    const sql = readFileSync(path.join(dir, name, "migration.sql"), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const prev = applied.get(name);
    if (prev) {
      if (prev !== checksum) throw new Error(`Migration ${name} was modified after being applied to Turso. Create a new migration instead.`);
      continue;
    }
    console.log(`applying ${name}`);
    // executeMultiple runs the whole script; the tracking row is written only after it succeeds.
    await db.executeMultiple(sql);
    await db.execute({ sql: "INSERT INTO _turso_migrations (name, checksum, applied_at) VALUES (?, ?, ?)", args: [name, checksum, new Date().toISOString()] });
    ran++;
  }
  console.log(ran ? `applied ${ran} migration(s)` : "Turso schema is up to date");
  db.close();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
