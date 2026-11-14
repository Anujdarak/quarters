/**
 * Prisma client factory shared by the web app and CLI scripts.
 *
 * - Cloud (Turso, hosted libSQL): set TURSO_DATABASE_URL (libsql://<db>-<org>.turso.io) and
 *   TURSO_AUTH_TOKEN. Queries go through the libSQL driver adapter.
 * - Local development: leave TURSO_* unset; Prisma uses the SQLite file in DATABASE_URL
 *   (e.g. "file:./dev.db"), with no database server process.
 */
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { PrismaClient } from "@prisma/client";

export function usingTurso(): boolean {
  return Boolean(process.env.TURSO_DATABASE_URL);
}

export function createPrismaClient(): PrismaClient {
  const url = process.env.TURSO_DATABASE_URL;
  if (url) {
    const authToken = process.env.TURSO_AUTH_TOKEN;
    if (!authToken && !url.startsWith("file:")) {
      throw new Error("TURSO_AUTH_TOKEN is required when TURSO_DATABASE_URL points at a hosted database");
    }
    return new PrismaClient({ adapter: new PrismaLibSQL({ url, authToken }) });
  }
  return new PrismaClient();
}
