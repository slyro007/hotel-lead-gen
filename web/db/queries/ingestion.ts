import { desc, sql } from "drizzle-orm";
import { db } from "../client";
import { hotelFilings, ingestionRuns } from "../schema";

export async function listRuns(limit = 50) {
  return db.select().from(ingestionRuns).orderBy(desc(ingestionRuns.startedAt)).limit(limit);
}

/** The dataset's own latest quarter — drives the "Data through …" banner. */
export async function getDataFreshness(): Promise<{ year: number; quarter: number } | null> {
  const rows = await db
    .select({
      year: hotelFilings.year,
      quarter: hotelFilings.quarter,
    })
    .from(hotelFilings)
    .orderBy(sql`${hotelFilings.year} * 10 + ${hotelFilings.quarter} desc`)
    .limit(1);
  return rows[0] ?? null;
}
