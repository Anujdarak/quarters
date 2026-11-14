import "server-only";
import { prisma } from "@/lib/db";

/**
 * Plain SQL for the few heavy, page-wide queries. Prisma's relation loading is ~8× slower for
 * them over the network (measured: 3.6 s vs 0.43 s for one quarter's figures on Turso).
 */
export function sql<T>(query: string, ...params: (string | number | null)[]): Promise<T[]> {
  return prisma.$queryRawUnsafe<T[]>(query, ...params);
}

/**
 * DateTime values are stored as integer milliseconds by the local SQLite engine but as ISO text
 * ("2026-09-30T00:00:00.000+00:00") by the libSQL adapter used on Turso. Comparisons pass both
 * forms so the same query works against either store.
 */
export function dateArgs(d: Date): [string, number] {
  return [d.toISOString().replace("Z", "+00:00"), d.getTime()];
}

export function toDate(v: unknown): Date {
  return typeof v === "string" ? new Date(v) : new Date(Number(v));
}

export function toNum(v: unknown): number | undefined {
  return v === null || v === undefined ? undefined : Number(v);
}
