import { and, eq } from "drizzle-orm";
import { db } from "../../../db/client";
import { getHotel, getHotelFilings } from "../../../db/queries/hotels";
import { marketBenchmarks } from "../../../db/schema";
import { fmtQuarter, toNum } from "../../../lib/format";
import { daysInQuarter } from "../../../lib/quarter";
import type { FilingPoint } from "../[id]/quarterly-chart";

export interface QuarterRow extends FilingPoint {
  index: number | null;
}

export type HotelDetail = NonNullable<Awaited<ReturnType<typeof loadHotelDetail>>>;

/** Shared loader for the full detail page and the slide-over panel. Returns
 *  null when the hotel doesn't exist. */
export async function loadHotelDetail(id: string) {
  const row = await getHotel(id).catch(() => null);
  if (!row) return null;
  const { hotel, score, owner } = row;

  const filings = await getHotelFilings(id);

  // Comp-set median series for the chart, from the score's own comp set key.
  let benchmarks = new Map<string, number>();
  if (score?.compSetKey) {
    const [geo, band, bclass] = score.compSetKey.split("|");
    const rows = await db
      .select({
        year: marketBenchmarks.year,
        quarter: marketBenchmarks.quarter,
        median: marketBenchmarks.revparMedian,
      })
      .from(marketBenchmarks)
      .where(
        and(
          eq(marketBenchmarks.geography, geo),
          eq(marketBenchmarks.roomBand, band),
          eq(marketBenchmarks.brandClass, bclass)
        )
      );
    benchmarks = new Map(rows.map((r) => [`${r.year}-${r.quarter}`, toNum(r.median) ?? 0]));
  }

  // A location can file more than once in a quarter (ownership change). Collapse
  // to one point per period — sum receipts, keep the largest room count — so the
  // charts/table have unique periods (mirrors pipeline/score.py and getHotelSeries).
  const byPeriod = new Map<
    string,
    { year: number; quarter: number; receipts: number | null; rooms: number | null }
  >();
  for (const f of filings) {
    const k = `${f.year}-${f.quarter}`;
    const receipts = toNum(f.roomReceipts);
    const prev = byPeriod.get(k);
    if (prev) {
      if (receipts != null) prev.receipts = (prev.receipts ?? 0) + receipts;
      if (f.rooms != null) prev.rooms = Math.max(prev.rooms ?? 0, f.rooms);
    } else {
      byPeriod.set(k, { year: f.year, quarter: f.quarter, receipts, rooms: f.rooms });
    }
  }

  const points: QuarterRow[] = [...byPeriod.values()]
    .sort((a, b) => a.year - b.year || a.quarter - b.quarter)
    .map((f) => {
      const rooms = f.rooms || hotel.rooms;
      const revpar =
        f.receipts != null && rooms ? f.receipts / (rooms * daysInQuarter(f.year, f.quarter)) : null;
      const benchmarkRevpar = benchmarks.get(`${f.year}-${f.quarter}`) ?? null;
      return {
        period: fmtQuarter(f.year, f.quarter),
        receipts: f.receipts,
        revpar,
        benchmarkRevpar,
        index: revpar != null && benchmarkRevpar ? (revpar / benchmarkRevpar) * 100 : null,
      };
    });

  return { hotel, score, owner, points };
}
