import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "../client";
import { hotelScores, hotels, marketBenchmarks, marketStats } from "../schema";

// County-wide "any|any" rollup rows — the market page's source series.
const countyRollup = and(
  eq(marketBenchmarks.geography, "dallas_county"),
  eq(marketBenchmarks.roomBand, "any"),
  eq(marketBenchmarks.brandClass, "any")
);

export async function getMarketTrend() {
  return db
    .select({
      year: marketBenchmarks.year,
      quarter: marketBenchmarks.quarter,
      propertyCount: marketBenchmarks.propertyCount,
      totalRooms: marketBenchmarks.totalRooms,
      totalReceipts: marketBenchmarks.totalReceipts,
      revparMedian: marketBenchmarks.revparMedian,
      revparP25: marketBenchmarks.revparP25,
      revparP75: marketBenchmarks.revparP75,
    })
    .from(marketBenchmarks)
    .where(countyRollup)
    .orderBy(asc(marketBenchmarks.year), asc(marketBenchmarks.quarter));
}

export interface MarketKpis {
  year: number;
  quarter: number;
  propertyCount: number | null;
  totalRooms: number | null;
  totalReceipts: string | null;
  revparMedian: string | null;
  receiptsYoyPct: number | null;
}

export async function getMarketKpis(): Promise<MarketKpis | null> {
  const trend = await getMarketTrend();
  if (trend.length === 0) return null;
  const latest = trend[trend.length - 1];
  const prior = trend.find(
    (t) => t.year === latest.year - 1 && t.quarter === latest.quarter
  );
  let receiptsYoyPct: number | null = null;
  if (latest.totalReceipts && prior?.totalReceipts) {
    receiptsYoyPct =
      (parseFloat(latest.totalReceipts) / parseFloat(prior.totalReceipts) - 1) * 100;
  }
  return { ...latest, receiptsYoyPct };
}

/** Hotels with the steepest trailing-revenue decline in the latest scores. */
export async function getTopDecliners(limit = 10) {
  return db
    .select({
      id: hotels.id,
      name: hotels.locationName,
      city: hotels.city,
      rooms: hotels.rooms,
      yoy: hotelScores.yoyRevenueChangePct,
      leadScore: hotelScores.leadScore,
      revparIndex: hotelScores.revparIndex,
    })
    .from(hotelScores)
    .innerJoin(hotels, eq(hotels.id, hotelScores.hotelId))
    .where(
      sql`${hotelScores.asOfYear} * 10 + ${hotelScores.asOfQuarter} =
          (select max(as_of_year * 10 + as_of_quarter) from hotel_scores)
          and ${hotelScores.yoyRevenueChangePct} < 0`
    )
    .orderBy(asc(hotelScores.yoyRevenueChangePct))
    .limit(limit);
}

/** Annual city/county HOT revenue reported to the Comptroller (Socrata). */
export async function getReportedHotRevenue() {
  return db
    .select({
      geography: marketStats.geography,
      year: marketStats.year,
      taxCollected: marketStats.taxCollected,
    })
    .from(marketStats)
    .orderBy(asc(marketStats.year), desc(marketStats.geography));
}
