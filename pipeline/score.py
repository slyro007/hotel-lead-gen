"""Compute market benchmarks and per-hotel lead scores.

The "standard hotel success" model: a hotel's implied RevPAR
(room_receipts / (rooms * days_in_quarter)) is benchmarked against its comp
set's median. Benchmarks are recomputed for every quarter x segment; scores
for the as-of quarter (default: latest in the dataset). Formulas live ONLY
here; the UI reads hotel_scores.score_breakdown for full transparency.

Score components (0-100 total):
  underperformance 0-40   RevPAR index 100 -> 0 pts, 50 or below -> 40 pts (linear)
  trend            0-25   YoY trailing-revenue change (<= -25% -> 15) + 8q slope (<= -3%/q -> 10)
  distress         0-20   stopped filing 1q -> 12, >=2q -> 20; single-quarter collapse >40% -> 8;
                          recovery ratio < 0.75 -> +4 (capped at 20)
  profile          0-15   independent 7, 20-120 rooms 4, built <1990 2, improvement/room < comp P25 2

Usage:
    python pipeline/score.py                  # as-of latest ingested quarter
    python pipeline/score.py --as-of 2026Q1
    python pipeline/score.py --dry-run
"""

from __future__ import annotations

import argparse
import json
import logging

from common import days_in_quarter, finish_run, get_conn, parse_period, quarter_index, start_run

log = logging.getLogger("score")

MIN_ROOMS = 10          # benchmark guard: tiny properties are B&B noise
MIN_COMPSET = 8         # min properties for a comp set before falling back
ROOM_BANDS = [(1, 49, "1-49"), (50, 99, "50-99"), (100, 199, "100-199"), (200, 10 ** 6, "200+")]


def room_band(rooms: int | None) -> str | None:
    if not rooms:
        return None
    for lo, hi, label in ROOM_BANDS:
        if lo <= rooms <= hi:
            return label
    return None


# ---------------------------------------------------------------- benchmarks

BENCHMARK_SQL = """
WITH filings AS (
    SELECT f.year, f.quarter,
        h.city, h.brand_class, h.rooms,
        f.room_receipts / (h.rooms * %(days)s::numeric) AS revpar
    FROM hotel_filings f
    JOIN hotels h ON h.id = f.hotel_id
    WHERE f.year = %(year)s AND f.quarter = %(quarter)s
      AND h.rooms >= %(min_rooms)s AND f.room_receipts > 0
),
banded AS (
    SELECT *, CASE
        WHEN rooms BETWEEN 1 AND 49 THEN '1-49'
        WHEN rooms BETWEEN 50 AND 99 THEN '50-99'
        WHEN rooms BETWEEN 100 AND 199 THEN '100-199'
        ELSE '200+' END AS band
    FROM filings
),
grid AS (
    SELECT 'dallas_county' AS geography, band, coalesce(brand_class,'unknown') AS bclass, revpar, rooms FROM banded
    UNION ALL SELECT 'dallas_county', band, 'any', revpar, rooms FROM banded
    UNION ALL SELECT 'dallas_county', 'any', coalesce(brand_class,'unknown'), revpar, rooms FROM banded
    UNION ALL SELECT 'dallas_county', 'any', 'any', revpar, rooms FROM banded
    UNION ALL SELECT 'city:' || city, band, coalesce(brand_class,'unknown'), revpar, rooms FROM banded WHERE city IS NOT NULL
    UNION ALL SELECT 'city:' || city, band, 'any', revpar, rooms FROM banded WHERE city IS NOT NULL
    UNION ALL SELECT 'city:' || city, 'any', 'any', revpar, rooms FROM banded WHERE city IS NOT NULL
)
INSERT INTO market_benchmarks (year, quarter, geography, room_band, brand_class,
    property_count, total_rooms, total_receipts,
    revpar_p25, revpar_median, revpar_p75, revpar_mean, computed_at)
SELECT %(year)s, %(quarter)s, geography, band, bclass,
    count(*), sum(rooms), sum(revpar * rooms * %(days)s::numeric),
    percentile_cont(0.25) WITHIN GROUP (ORDER BY revpar),
    percentile_cont(0.5)  WITHIN GROUP (ORDER BY revpar),
    percentile_cont(0.75) WITHIN GROUP (ORDER BY revpar),
    avg(revpar), now()
FROM grid
GROUP BY geography, band, bclass
ON CONFLICT (year, quarter, geography, room_band, brand_class) DO UPDATE SET
    property_count = EXCLUDED.property_count, total_rooms = EXCLUDED.total_rooms,
    total_receipts = EXCLUDED.total_receipts, revpar_p25 = EXCLUDED.revpar_p25,
    revpar_median = EXCLUDED.revpar_median, revpar_p75 = EXCLUDED.revpar_p75,
    revpar_mean = EXCLUDED.revpar_mean, computed_at = now();
"""


def compute_benchmarks(conn) -> int:
    quarters = conn.execute(
        "SELECT DISTINCT year, quarter FROM hotel_filings ORDER BY year, quarter").fetchall()
    for year, quarter in quarters:
        conn.execute(BENCHMARK_SQL, {
            "year": year, "quarter": quarter,
            "days": days_in_quarter(year, quarter), "min_rooms": MIN_ROOMS,
        })
    conn.commit()
    n = conn.execute("SELECT count(*) FROM market_benchmarks").fetchone()[0]
    log.info("Benchmarks recomputed for %d quarters (%d segment rows).", len(quarters), n)
    return n


# ---------------------------------------------------------------- comp sets

def load_benchmarks(conn) -> dict:
    """(year, quarter, geography, band, bclass) -> {median, p25, count}"""
    out = {}
    for y, q, geo, band, bclass, cnt, median, p25 in conn.execute(
            """SELECT year, quarter, geography, room_band, brand_class,
                      property_count, revpar_median, revpar_p25 FROM market_benchmarks"""):
        out[(y, q, geo, band, bclass)] = {
            "median": float(median) if median is not None else None,
            "p25": float(p25) if p25 is not None else None,
            "count": cnt,
        }
    return out


def pick_compset(benchmarks: dict, year: int, quarter: int, city: str | None,
                 band: str | None, bclass: str | None) -> tuple[str, dict] | None:
    """Fallback chain: tightest segment with >= MIN_COMPSET properties."""
    geo_city = f"city:{city}" if city else None
    chain = []
    if geo_city and band and bclass:
        chain.append((geo_city, band, bclass))
    if geo_city and band:
        chain.append((geo_city, band, "any"))
    if band and bclass:
        chain.append(("dallas_county", band, bclass))
    if band:
        chain.append(("dallas_county", band, "any"))
    if geo_city:
        chain.append((geo_city, "any", "any"))
    chain.append(("dallas_county", "any", "any"))
    for geo, b, c in chain:
        bm = benchmarks.get((year, quarter, geo, b, c))
        if bm and bm["count"] >= MIN_COMPSET and bm["median"]:
            return f"{geo}|{b}|{c}", bm
    return None


# ---------------------------------------------------------------- per-hotel math

def trailing_revpar(filings: list[dict], end_qi: int, rooms: int, n: int = 4
                    ) -> tuple[float | None, float | None, int]:
    """(revpar, revenue, days) over up to n quarters ending at end_qi (inclusive)."""
    window = [f for f in filings if end_qi - n < f["qi"] <= end_qi and f["receipts"]]
    if not window or not rooms:
        return None, None, 0
    revenue = sum(f["receipts"] for f in window)
    day_count = sum(f["days"] for f in window)
    return revenue / (rooms * day_count), revenue, day_count


def ols_slope_pct(filings: list[dict], end_qi: int, rooms: int, n: int = 8) -> float | None:
    """OLS slope of quarterly RevPAR over the last n quarters, as % of mean per quarter."""
    pts = [(f["qi"], f["receipts"] / (rooms * f["days"]))
           for f in filings if end_qi - n < f["qi"] <= end_qi and f["receipts"] and rooms]
    if len(pts) < 4:
        return None
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    mx, my = sum(xs) / len(xs), sum(ys) / len(ys)
    denom = sum((x - mx) ** 2 for x in xs)
    if denom == 0 or my == 0:
        return None
    slope = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / denom
    return 100 * slope / my


def clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def score_hotel(h: dict, filings: list[dict], benchmarks: dict,
                as_of: tuple[int, int], dataset_max_qi: int) -> dict | None:
    year, quarter = as_of
    end_qi = quarter_index(year, quarter)
    rooms = h["rooms"]
    if not rooms or rooms < MIN_ROOMS:
        return None

    t_revpar, t_revenue, t_days = trailing_revpar(filings, end_qi, rooms)
    prior_revpar, prior_revenue, prior_days = trailing_revpar(filings, end_qi - 4, rooms)
    latest = next((f for f in sorted(filings, key=lambda x: -x["qi"]) if f["receipts"]), None)
    latest_revpar = latest["receipts"] / (rooms * latest["days"]) if latest else None

    # comp set + index
    band = room_band(rooms)
    comp = pick_compset(benchmarks, year, quarter, h["city"], band, h["brand_class"])
    revpar_index = None
    comp_key, comp_count, comp_p25 = None, None, None
    if comp and t_revpar:
        comp_key, bm = comp
        comp_count, comp_p25 = bm["count"], bm["p25"]
        # trailing index vs the as-of quarter's comp median (both same segment)
        revpar_index = 100 * t_revpar / bm["median"]

    # trend — windows can be unequal length when history is short (e.g. only 6
    # quarters ingested), so compare revenue *per day* and require the prior
    # window to cover at least ~2 quarters before trusting a YoY number.
    yoy = None
    if t_revenue and prior_revenue and t_days and prior_days >= 180:
        yoy = 100 * ((t_revenue / t_days) / (prior_revenue / prior_days) - 1)
    slope = ols_slope_pct(filings, end_qi, rooms)

    # recovery vs 2019
    revpar_2019, _, _ = trailing_revpar(filings, quarter_index(2019, 4), rooms)
    recovery = t_revpar / revpar_2019 if (t_revpar and revpar_2019) else None

    # distress: stopped filing (vs dataset's own latest quarter)
    last_filed_qi = max((f["qi"] for f in filings), default=None)
    quarters_since = dataset_max_qi - last_filed_qi if last_filed_qi is not None else None
    stopped = quarters_since is not None and quarters_since >= 1

    # single-quarter collapse: latest filed quarter vs same quarter prior year
    collapse = False
    if latest:
        same_q_prior = next((f for f in filings if f["qi"] == latest["qi"] - 4 and f["receipts"]), None)
        if same_q_prior and same_q_prior["receipts"] > 0:
            collapse = latest["receipts"] / same_q_prior["receipts"] < 0.6

    # --- components ---
    s_under = 0.0
    if revpar_index is not None:
        s_under = clamp((100 - revpar_index) * (40 / 50), 0, 40)

    s_trend = 0.0
    if yoy is not None and yoy < 0:
        s_trend += clamp(-yoy * (15 / 25), 0, 15)
    if slope is not None and slope < 0:
        s_trend += clamp(-slope * (10 / 3), 0, 10)
    s_trend = clamp(s_trend, 0, 25)

    s_distress = 0.0
    if stopped:
        s_distress = 20 if quarters_since >= 2 else 12
    elif collapse:
        s_distress = 8
    if recovery is not None and recovery < 0.75:
        s_distress += 4
    s_distress = clamp(s_distress, 0, 20)

    s_profile = 0.0
    if h["brand_class"] == "independent":
        s_profile += 7
    if 20 <= rooms <= 120:
        s_profile += 4
    if h["year_built"] and h["year_built"] < 1990:
        s_profile += 2
    if (h["improvement_value"] and comp_p25 and t_revpar
            and h["improvement_value"] / rooms < 40000):  # low improvement value per room
        s_profile += 2
    s_profile = clamp(s_profile, 0, 15)

    lead_score = round(s_under + s_trend + s_distress + s_profile)

    return {
        "hotel_id": h["id"],
        "as_of_year": year, "as_of_quarter": quarter,
        "trailing_revenue_4q": round(t_revenue, 2) if t_revenue else None,
        "latest_revpar": round(latest_revpar, 2) if latest_revpar else None,
        "trailing_revpar_4q": round(t_revpar, 2) if t_revpar else None,
        "revpar_index": round(revpar_index, 1) if revpar_index is not None else None,
        "comp_set_key": comp_key, "comp_set_count": comp_count,
        "yoy_revenue_change_pct": round(yoy, 1) if yoy is not None else None,
        "slope_8q": round(slope, 3) if slope is not None else None,
        "recovery_ratio": round(recovery, 2) if recovery is not None else None,
        "stopped_filing": stopped,
        "quarters_since_last_filing": quarters_since,
        "score_underperformance": round(s_under),
        "score_trend": round(s_trend),
        "score_distress": round(s_distress),
        "score_profile": round(s_profile),
        "lead_score": lead_score,
        "score_breakdown": json.dumps({
            "inputs": {
                "rooms": rooms, "brand_class": h["brand_class"], "city": h["city"],
                "year_built": h["year_built"],
                "improvement_value": float(h["improvement_value"]) if h["improvement_value"] else None,
                "trailing_revpar_4q": t_revpar, "comp_median_revpar":
                    (t_revpar / (revpar_index / 100)) if (revpar_index and t_revpar) else None,
                "comp_set": comp_key, "comp_set_count": comp_count,
                "yoy_pct": yoy, "slope_8q_pct_per_q": slope, "recovery_vs_2019": recovery,
                "stopped_filing": stopped, "quarters_since_last_filing": quarters_since,
                "single_quarter_collapse": collapse,
            },
            "components": {
                "underperformance": {"points": round(s_under, 1), "max": 40,
                                     "rule": "linear: index 100 -> 0 pts, 50 -> 40 pts"},
                "trend": {"points": round(s_trend, 1), "max": 25,
                          "rule": "YoY <= -25% -> 15; slope <= -3%/q -> 10"},
                "distress": {"points": round(s_distress, 1), "max": 20,
                             "rule": "stopped 1q -> 12, 2q+ -> 20; collapse >40% -> 8; recovery < 0.75 -> +4"},
                "profile": {"points": round(s_profile, 1), "max": 15,
                            "rule": "independent 7; 20-120 rooms 4; built <1990 2; low improvement/room 2"},
            },
        }),
    }


UPSERT_SCORE_SQL = """
INSERT INTO hotel_scores (hotel_id, as_of_year, as_of_quarter, trailing_revenue_4q,
    latest_revpar, trailing_revpar_4q, revpar_index, comp_set_key, comp_set_count,
    yoy_revenue_change_pct, slope_8q, recovery_ratio, stopped_filing,
    quarters_since_last_filing, score_underperformance, score_trend, score_distress,
    score_profile, lead_score, score_breakdown, computed_at)
VALUES (%(hotel_id)s, %(as_of_year)s, %(as_of_quarter)s, %(trailing_revenue_4q)s,
    %(latest_revpar)s, %(trailing_revpar_4q)s, %(revpar_index)s, %(comp_set_key)s,
    %(comp_set_count)s, %(yoy_revenue_change_pct)s, %(slope_8q)s, %(recovery_ratio)s,
    %(stopped_filing)s, %(quarters_since_last_filing)s, %(score_underperformance)s,
    %(score_trend)s, %(score_distress)s, %(score_profile)s, %(lead_score)s,
    %(score_breakdown)s, now())
ON CONFLICT (hotel_id, as_of_year, as_of_quarter) DO UPDATE SET
    trailing_revenue_4q = EXCLUDED.trailing_revenue_4q,
    latest_revpar = EXCLUDED.latest_revpar,
    trailing_revpar_4q = EXCLUDED.trailing_revpar_4q,
    revpar_index = EXCLUDED.revpar_index,
    comp_set_key = EXCLUDED.comp_set_key, comp_set_count = EXCLUDED.comp_set_count,
    yoy_revenue_change_pct = EXCLUDED.yoy_revenue_change_pct,
    slope_8q = EXCLUDED.slope_8q, recovery_ratio = EXCLUDED.recovery_ratio,
    stopped_filing = EXCLUDED.stopped_filing,
    quarters_since_last_filing = EXCLUDED.quarters_since_last_filing,
    score_underperformance = EXCLUDED.score_underperformance,
    score_trend = EXCLUDED.score_trend, score_distress = EXCLUDED.score_distress,
    score_profile = EXCLUDED.score_profile, lead_score = EXCLUDED.lead_score,
    score_breakdown = EXCLUDED.score_breakdown, computed_at = now();
"""


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    p = argparse.ArgumentParser(description="Compute benchmarks + lead scores.")
    p.add_argument("--as-of", help="scoring quarter, e.g. 2026Q1 (default: latest ingested)")
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()

    conn = get_conn()
    try:
        row = conn.execute(
            "SELECT year, quarter FROM hotel_filings ORDER BY year DESC, quarter DESC LIMIT 1"
        ).fetchone()
        if not row:
            raise SystemExit("No filings ingested yet.")
        as_of = parse_period(args.as_of) if args.as_of else (row[0], row[1])
        dataset_max_qi = quarter_index(row[0], row[1])
        log.info("Scoring as of %dQ%d (dataset max %dQ%d).", *as_of, row[0], row[1])

        if args.dry_run:
            n = conn.execute("SELECT count(*) FROM hotels WHERE rooms >= %s", (MIN_ROOMS,)).fetchone()[0]
            log.info("[dry-run] would score ~%d hotels.", n)
            return

        run_id = start_run(conn, "score", params={"as_of": f"{as_of[0]}Q{as_of[1]}"})
        try:
            compute_benchmarks(conn)
            benchmarks = load_benchmarks(conn)

            hotels = [
                {"id": r[0], "rooms": r[1], "city": r[2], "brand_class": r[3],
                 "year_built": r[4], "improvement_value": r[5]}
                for r in conn.execute(
                    """SELECT h.id::text, h.rooms, h.city, h.brand_class,
                              e.year_built, e.improvement_value
                       FROM hotels h LEFT JOIN owner_enrichment e ON e.hotel_id = h.id""")
            ]
            filings_by_hotel: dict[str, list[dict]] = {}
            for hid, y, q, receipts in conn.execute(
                    """SELECT hotel_id::text, year, quarter, room_receipts
                       FROM hotel_filings WHERE hotel_id IS NOT NULL"""):
                filings_by_hotel.setdefault(hid, []).append({
                    "qi": quarter_index(y, q), "days": days_in_quarter(y, q),
                    "receipts": float(receipts) if receipts else 0.0,
                })

            scored, skipped = 0, 0
            with conn.cursor() as cur:
                for h in hotels:
                    filings = filings_by_hotel.get(h["id"], [])
                    rec = score_hotel(h, filings, benchmarks, as_of, dataset_max_qi) if filings else None
                    if rec:
                        cur.execute(UPSERT_SCORE_SQL, rec)
                        scored += 1
                    else:
                        skipped += 1
            conn.commit()
            finish_run(conn, run_id, processed=len(hotels), updated=scored, skipped=skipped)
            log.info("Scored %d hotels (%d skipped: no filings/rooms).", scored, skipped)

            dist = conn.execute(
                """SELECT count(*) FILTER (WHERE lead_score >= 70),
                          count(*) FILTER (WHERE lead_score BETWEEN 50 AND 69),
                          count(*) FILTER (WHERE lead_score < 50),
                          round(avg(revpar_index)::numeric, 1)
                   FROM hotel_scores WHERE as_of_year=%s AND as_of_quarter=%s""", as_of).fetchone()
            log.info("Distribution: %d hot (>=70), %d warm (50-69), %d watch (<50); mean RevPAR index %s.",
                     *dist)
        except Exception as e:
            conn.rollback()
            finish_run(conn, run_id, status="failed", notes=str(e)[:500])
            raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
