"""Canonicalize hotel_filings into the hotels table and backfill hotel_id.

One hotels row per physical property, keyed on location_key (zip5|normalized
street) so it survives renames and ownership changes. Latest filing wins for
name/taxpayer; rooms = most recent nonzero value; prior taxpayer numbers are
kept as an ownership-change signal. Near-duplicate candidates (same zip,
similar name, different key) go to data/review/hotel_dedupe.csv for manual
adjudication — never auto-merged.

Usage:
    python pipeline/build_hotels.py
    python pipeline/build_hotels.py --dry-run
    python pipeline/build_hotels.py --merge <keep_hotel_id> <dup_hotel_id>   # apply a reviewed merge
"""

from __future__ import annotations

import argparse
import csv
import difflib
import logging
import os

from common import REVIEW_DIR, ensure_dirs, finish_run, get_conn, start_run

log = logging.getLogger("build_hotels")

UPSERT_HOTELS_SQL = """
WITH latest AS (
    SELECT DISTINCT ON (location_key)
        location_key, location_name, location_address, location_city,
        location_state, location_zip, location_county,
        taxpayer_number, taxpayer_name
    FROM hotel_filings
    ORDER BY location_key, year DESC, quarter DESC
),
rooms AS (  -- most recent nonzero room count per property
    SELECT DISTINCT ON (location_key) location_key, rooms
    FROM hotel_filings
    WHERE rooms IS NOT NULL AND rooms > 0
    ORDER BY location_key, year DESC, quarter DESC
),
span AS (
    SELECT location_key,
        min(make_date(year, quarter*3-2, 1)) AS first_dt,
        max(make_date(year, quarter*3-2, 1)) AS last_dt,
        min(year*10+quarter) AS first_p, max(year*10+quarter) AS last_p,
        array_agg(DISTINCT taxpayer_number) AS all_taxpayers
    FROM hotel_filings GROUP BY location_key
),
dataset_max AS (SELECT max(year*10+quarter) AS max_p FROM hotel_filings)
INSERT INTO hotels (location_key, location_name, address, city, state, zip, county,
    current_taxpayer_number, current_taxpayer_name, prior_taxpayer_numbers, rooms,
    first_period, last_period, is_active, updated_at)
SELECT l.location_key, l.location_name, l.location_address, l.location_city,
    l.location_state, l.location_zip, l.location_county,
    l.taxpayer_number, l.taxpayer_name,
    array_remove(s.all_taxpayers, l.taxpayer_number),
    r.rooms,
    (s.first_p/10)::text || 'Q' || (s.first_p % 10)::text,
    (s.last_p/10)::text || 'Q' || (s.last_p % 10)::text,
    s.last_p = d.max_p,
    now()
FROM latest l
JOIN span s USING (location_key)
LEFT JOIN rooms r USING (location_key)
CROSS JOIN dataset_max d
ON CONFLICT (location_key) DO UPDATE SET
    location_name = EXCLUDED.location_name,
    address = EXCLUDED.address, city = EXCLUDED.city, state = EXCLUDED.state,
    zip = EXCLUDED.zip, county = EXCLUDED.county,
    current_taxpayer_number = EXCLUDED.current_taxpayer_number,
    current_taxpayer_name = EXCLUDED.current_taxpayer_name,
    prior_taxpayer_numbers = EXCLUDED.prior_taxpayer_numbers,
    rooms = EXCLUDED.rooms,
    first_period = EXCLUDED.first_period, last_period = EXCLUDED.last_period,
    is_active = EXCLUDED.is_active, updated_at = now();
"""

BACKFILL_SQL = """
UPDATE hotel_filings f SET hotel_id = h.id
FROM hotels h
WHERE f.location_key = h.location_key AND f.hotel_id IS DISTINCT FROM h.id;
"""


def find_dedupe_candidates(conn) -> list[dict]:
    """Same zip, different location_key, similar name or similar street —
    likely address typos splitting one property into two rows."""
    rows = conn.execute(
        """SELECT id::text, location_key, location_name, address, zip, rooms
           FROM hotels ORDER BY zip, location_key"""
    ).fetchall()
    by_zip: dict[str, list] = {}
    for r in rows:
        by_zip.setdefault(r[4] or "", []).append(r)
    candidates = []
    for zip5, group in by_zip.items():
        if not zip5 or len(group) < 2:
            continue
        for i in range(len(group)):
            for j in range(i + 1, len(group)):
                a, b = group[i], group[j]
                name_sim = difflib.SequenceMatcher(
                    None, (a[2] or "").upper(), (b[2] or "").upper()).ratio()
                addr_sim = difflib.SequenceMatcher(
                    None, a[1].split("|")[1], b[1].split("|")[1]).ratio()
                if addr_sim > 0.85 or (name_sim > 0.9 and addr_sim > 0.5):
                    candidates.append({
                        "hotel_a_id": a[0], "hotel_a_name": a[2], "hotel_a_addr": a[3],
                        "hotel_b_id": b[0], "hotel_b_name": b[2], "hotel_b_addr": b[3],
                        "zip": zip5, "name_sim": round(name_sim, 2), "addr_sim": round(addr_sim, 2),
                    })
    return candidates


def apply_merge(conn, keep_id: str, dup_id: str) -> None:
    """Reviewed merge: repoint dup's filings at keep, delete dup."""
    conn.execute("UPDATE hotel_filings SET hotel_id=%s WHERE hotel_id=%s", (keep_id, dup_id))
    # keep the dup's location_key reachable by remembering it? filings retain
    # their own location_key; future build runs would recreate the dup row, so
    # rewrite those filings' location_key to the kept hotel's key.
    row = conn.execute("SELECT location_key FROM hotels WHERE id=%s", (keep_id,)).fetchone()
    conn.execute(
        """UPDATE hotel_filings SET location_key=%s
           WHERE hotel_id=%s AND location_key IN
             (SELECT location_key FROM hotels WHERE id=%s)""",
        (row[0], keep_id, dup_id))
    conn.execute("DELETE FROM hotels WHERE id=%s", (dup_id,))
    conn.commit()
    log.info("Merged hotel %s into %s.", dup_id, keep_id)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    p = argparse.ArgumentParser(description="Canonicalize hotels from filings.")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--merge", nargs=2, metavar=("KEEP_ID", "DUP_ID"),
                   help="apply a reviewed merge from hotel_dedupe.csv")
    args = p.parse_args()
    ensure_dirs()

    conn = get_conn()
    try:
        if args.merge:
            apply_merge(conn, args.merge[0], args.merge[1])
            return

        if args.dry_run:
            n = conn.execute("SELECT count(DISTINCT location_key) FROM hotel_filings").fetchone()[0]
            log.info("[dry-run] would upsert %d hotels from filings.", n)
            return

        run_id = start_run(conn, "build_hotels")
        try:
            cur = conn.execute(UPSERT_HOTELS_SQL)
            hotels_n = cur.rowcount
            cur = conn.execute(BACKFILL_SQL)
            backfilled = cur.rowcount
            conn.commit()

            candidates = find_dedupe_candidates(conn)
            if candidates:
                path = os.path.join(REVIEW_DIR, "hotel_dedupe.csv")
                with open(path, "w", newline="") as f:
                    w = csv.DictWriter(f, fieldnames=list(candidates[0].keys()))
                    w.writeheader()
                    w.writerows(candidates)
                log.info("%d dedupe candidates -> %s (review, then --merge keep dup)",
                         len(candidates), path)

            total = conn.execute("SELECT count(*) FROM hotels").fetchone()[0]
            finish_run(conn, run_id, processed=total, updated=hotels_n,
                       notes=f"backfilled {backfilled} filings; {len(candidates)} dedupe candidates")
            log.info("hotels: %d total (%d touched); %d filings backfilled.", total, hotels_n, backfilled)
        except Exception as e:
            conn.rollback()
            finish_run(conn, run_id, status="failed", notes=str(e)[:500])
            raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
