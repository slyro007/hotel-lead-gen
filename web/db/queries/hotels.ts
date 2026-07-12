import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "../client";
import { hotelFilings, hotelScores, hotels, ownerEnrichment } from "../schema";

// Allow-listed sort columns — searchParams values never reach SQL directly.
const SORT_COLUMNS = {
  score: hotelScores.leadScore,
  index: hotelScores.revparIndex,
  yoy: hotelScores.yoyRevenueChangePct,
  revenue: hotelScores.trailingRevenue4q,
  rooms: hotels.rooms,
  name: hotels.locationName,
  city: hotels.city,
} as const;

export type HotelSort = keyof typeof SORT_COLUMNS;

export interface HotelFilters {
  sort?: string;
  dir?: string;
  band?: string; // hot | warm | watch
  brand?: string; // branded | independent | unknown
  city?: string;
  rooms?: string; // 1-49 | 50-99 | 100-199 | 200+
  stopped?: string; // "1"
  q?: string; // name/address search
  limit?: number;
}

// Latest scoring period — every list/detail joins scores from this period only.
const latestPeriod = sql`(
  select max(as_of_year * 10 + as_of_quarter) from hotel_scores
)`;

function scoreJoinOn() {
  return and(
    eq(hotelScores.hotelId, hotels.id),
    sql`${hotelScores.asOfYear} * 10 + ${hotelScores.asOfQuarter} = ${latestPeriod}`
  );
}

function filterConditions(f: HotelFilters): SQL[] {
  const conds: SQL[] = [];
  if (f.band === "hot") conds.push(sql`${hotelScores.leadScore} >= 70`);
  if (f.band === "warm") conds.push(sql`${hotelScores.leadScore} between 50 and 69`);
  if (f.band === "watch") conds.push(sql`${hotelScores.leadScore} < 50`);
  if (f.brand && ["branded", "independent", "unknown"].includes(f.brand))
    conds.push(eq(hotels.brandClass, f.brand));
  if (f.city) conds.push(eq(hotels.city, f.city));
  if (f.rooms === "1-49") conds.push(sql`${hotels.rooms} between 1 and 49`);
  if (f.rooms === "50-99") conds.push(sql`${hotels.rooms} between 50 and 99`);
  if (f.rooms === "100-199") conds.push(sql`${hotels.rooms} between 100 and 199`);
  if (f.rooms === "200+") conds.push(sql`${hotels.rooms} >= 200`);
  if (f.stopped === "1") conds.push(eq(hotelScores.stoppedFiling, true));
  if (f.q) {
    const needle = `%${f.q}%`;
    const search = or(ilike(hotels.locationName, needle), ilike(hotels.address, needle));
    if (search) conds.push(search);
  }
  return conds;
}

export async function listHotels(f: HotelFilters) {
  const sortCol = SORT_COLUMNS[(f.sort as HotelSort) ?? "score"] ?? hotelScores.leadScore;
  const orderExpr = f.dir === "asc" ? asc(sortCol) : desc(sortCol);

  return db
    .select({
      id: hotels.id,
      name: hotels.locationName,
      address: hotels.address,
      city: hotels.city,
      zip: hotels.zip,
      rooms: hotels.rooms,
      brandClass: hotels.brandClass,
      brandFamily: hotels.brandFamily,
      isActive: hotels.isActive,
      latitude: hotels.latitude,
      longitude: hotels.longitude,
      leadScore: hotelScores.leadScore,
      revparIndex: hotelScores.revparIndex,
      trailingRevpar: hotelScores.trailingRevpar4q,
      trailingRevenue: hotelScores.trailingRevenue4q,
      yoy: hotelScores.yoyRevenueChangePct,
      stoppedFiling: hotelScores.stoppedFiling,
      ownerName: ownerEnrichment.ownerName,
    })
    .from(hotels)
    .leftJoin(hotelScores, scoreJoinOn())
    .leftJoin(ownerEnrichment, eq(ownerEnrichment.hotelId, hotels.id))
    .where(and(...filterConditions(f)))
    .orderBy(sql`${orderExpr} nulls last`, asc(hotels.locationName))
    .limit(Math.min(f.limit ?? 500, 2000));
}

export async function getHotel(id: string) {
  const rows = await db
    .select({
      hotel: hotels,
      score: hotelScores,
      owner: ownerEnrichment,
    })
    .from(hotels)
    .leftJoin(hotelScores, scoreJoinOn())
    .leftJoin(ownerEnrichment, eq(ownerEnrichment.hotelId, hotels.id))
    .where(eq(hotels.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function getHotelFilings(hotelId: string) {
  return db
    .select({
      year: hotelFilings.year,
      quarter: hotelFilings.quarter,
      rooms: hotelFilings.rooms,
      roomReceipts: hotelFilings.roomReceipts,
      taxableReceipts: hotelFilings.taxableReceipts,
      locationName: hotelFilings.locationName,
      taxpayerName: hotelFilings.taxpayerName,
    })
    .from(hotelFilings)
    .where(eq(hotelFilings.hotelId, hotelId))
    .orderBy(asc(hotelFilings.year), asc(hotelFilings.quarter));
}

export async function listCities(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ city: hotels.city })
    .from(hotels)
    .where(sql`${hotels.city} is not null`)
    .orderBy(asc(hotels.city));
  return rows.map((r) => r.city!).filter(Boolean);
}
