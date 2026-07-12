"""Sync parsed SIFT JSON (data/parsed/sift_*.json) into hotel_filings.

Idempotent upsert keyed on (taxpayer_number, location_key, year, quarter) —
re-running after a re-parse only touches changed rows. The statewide file is
filtered to Dallas County here (Neon free-tier discipline); pass
--all-counties to skip the filter.

Usage:
    python pipeline/sync_filings.py                # all parsed files, Dallas County only
    python pipeline/sync_filings.py --file data/parsed/sift_x.json
    python pipeline/sync_filings.py --dry-run
"""

from __future__ import annotations

import argparse
import glob
import json
import logging
import os

from common import PARSED_DIR, finish_run, get_conn, start_run

log = logging.getLogger("sync_filings")

UPSERT_SQL = """
INSERT INTO hotel_filings (taxpayer_number, taxpayer_name, location_name,
    location_address, location_city, location_state, location_zip, location_county,
    location_key, year, quarter, rooms, room_receipts, taxable_receipts,
    source_file, ingestion_run_id, updated_at)
VALUES (%(taxpayer_number)s, %(taxpayer_name)s, %(location_name)s,
    %(location_address)s, %(location_city)s, %(location_state)s, %(location_zip)s,
    %(location_county)s, %(location_key)s, %(year)s, %(quarter)s, %(rooms)s,
    %(room_receipts)s, %(taxable_receipts)s, %(source_file)s, %(run_id)s, now())
ON CONFLICT (taxpayer_number, location_key, year, quarter) DO UPDATE SET
    taxpayer_name = EXCLUDED.taxpayer_name,
    location_name = EXCLUDED.location_name,
    location_address = EXCLUDED.location_address,
    location_city = EXCLUDED.location_city,
    location_state = EXCLUDED.location_state,
    location_zip = EXCLUDED.location_zip,
    location_county = EXCLUDED.location_county,
    rooms = EXCLUDED.rooms,
    room_receipts = EXCLUDED.room_receipts,
    taxable_receipts = EXCLUDED.taxable_receipts,
    source_file = EXCLUDED.source_file,
    ingestion_run_id = EXCLUDED.ingestion_run_id,
    updated_at = now();
"""


def is_dallas(rec: dict) -> bool:
    # Comptroller 3-digit county code: Dallas = 057.
    county = (rec.get("location_county") or "").strip().lower()
    return "dallas" in county or county.lstrip("0") == "57"


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    p = argparse.ArgumentParser(description="Upsert parsed SIFT filings into Neon.")
    p.add_argument("--file", help="a single parsed JSON file (default: all of data/parsed/sift_*.json)")
    p.add_argument("--all-counties", action="store_true", help="skip the Dallas County filter")
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()

    files = [args.file] if args.file else sorted(glob.glob(os.path.join(PARSED_DIR, "sift_*.json")))
    if not files:
        raise SystemExit("No parsed files found — run sift_parse.py first.")

    records = []
    for path in files:
        with open(path) as f:
            recs = json.load(f)
        kept = [r for r in recs if args.all_counties or is_dallas(r)]
        log.info("%s: %d filings, %d kept", os.path.basename(path), len(recs), len(kept))
        records.extend(kept)

    # skip rows that can't form a valid identity key
    valid = [r for r in records if r["taxpayer_number"] and r["location_key"].strip("|")]
    skipped = len(records) - len(valid)

    if args.dry_run:
        quarters = sorted({(r["year"], r["quarter"]) for r in valid})
        log.info("[dry-run] would upsert %d filings (%d skipped) across %s",
                 len(valid), skipped, [f"{y}Q{q}" for y, q in quarters])
        return

    conn = get_conn()
    run_id = start_run(conn, "sync_filings", params={"files": [os.path.basename(f) for f in files]})
    try:
        with conn.cursor() as cur:
            for rec in valid:
                cur.execute(UPSERT_SQL, {**rec, "run_id": run_id})
        conn.commit()
        finish_run(conn, run_id, processed=len(records), inserted=len(valid), skipped=skipped)
        log.info("Upserted %d filings (%d skipped).", len(valid), skipped)
    except Exception as e:
        conn.rollback()
        finish_run(conn, run_id, status="failed", notes=str(e)[:500])
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
