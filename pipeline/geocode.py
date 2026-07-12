"""Geocode hotels via the free US Census batch geocoder.

Fills hotels.latitude/longitude/geocode_source for rows where they're null.
The batch endpoint takes a CSV of up to 10,000 addresses per POST — all of
Dallas County fits in one request. No API key required.

Usage:
    python pipeline/geocode.py
    python pipeline/geocode.py --limit 50
    python pipeline/geocode.py --dry-run
"""

from __future__ import annotations

import argparse
import csv
import io
import logging

import requests

from common import finish_run, get_conn, start_run

log = logging.getLogger("geocode")

CENSUS_URL = "https://geocoding.geo.census.gov/geocoder/locations/addressbatch"


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    p = argparse.ArgumentParser(description="Census-geocode hotels missing lat/lng.")
    p.add_argument("--limit", type=int)
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()

    conn = get_conn()
    try:
        sql = """SELECT id::text, address, city, state, zip FROM hotels
                 WHERE latitude IS NULL AND address IS NOT NULL"""
        if args.limit:
            sql += f" LIMIT {int(args.limit)}"
        rows = conn.execute(sql).fetchall()
        if not rows:
            log.info("Nothing to geocode.")
            return
        if args.dry_run:
            log.info("[dry-run] would geocode %d hotels.", len(rows))
            return

        run_id = start_run(conn, "geocode", params={"count": len(rows)})
        try:
            buf = io.StringIO()
            w = csv.writer(buf)
            for r in rows:
                w.writerow([r[0], r[1], r[2] or "", r[3] or "TX", r[4] or ""])
            resp = requests.post(
                CENSUS_URL,
                files={"addressFile": ("hotels.csv", buf.getvalue(), "text/csv")},
                data={"benchmark": "Public_AR_Current"},
                timeout=300,
            )
            resp.raise_for_status()

            matched = 0
            for out in csv.reader(io.StringIO(resp.text)):
                # columns: id, input addr, match flag, match type, matched addr, "lng,lat", tigerline, side
                if len(out) >= 6 and out[2] == "Match" and out[5]:
                    lng, lat = out[5].split(",")
                    conn.execute(
                        """UPDATE hotels SET latitude=%s, longitude=%s,
                           geocode_source='census', updated_at=now() WHERE id=%s""",
                        (float(lat), float(lng), out[0]),
                    )
                    matched += 1
            conn.commit()
            finish_run(conn, run_id, processed=len(rows), updated=matched)
            log.info("Geocoded %d/%d hotels (%.0f%%).", matched, len(rows), 100 * matched / len(rows))
        except Exception as e:
            conn.rollback()
            finish_run(conn, run_id, status="failed", notes=str(e)[:500])
            raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
