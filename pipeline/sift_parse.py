"""Parse a Comptroller SIFT quarterly hotel receipts file (HOTyyQn.CSV) to JSON.

The SIFT export is a HEADERLESS positional CSV — layout confirmed against the
"Hotel Quarterly File Record Layout" doc shipped inside each download:

    0  Taxpayer Number        8  Location Number      16 Unit Capacity (rooms)
    1  Taxpayer Name          9  Location Name        17 Responsibility Begin Date
    2  Taxpayer Address      10  Location Address     18 Responsibility End Date
    3  Taxpayer City         11  Location City        19 Reporting Quarter ("2025Q1")
    4  Taxpayer State        12  Location State       20 Filer Type (50=monthly, 60=quarterly)
    5  Taxpayer Zip          13  Location Zip         21 Total Room Receipts
    6  Taxpayer County       14  Location County      22 Taxable Receipts
    7  Taxpayer Phone        15  Location Phone

Monthly files (HOTyymm.CSV) share the layout with a YYYYMMDD period at col 19,
but the quarterly file already contains monthly filers rolled up to the
quarter (verified numerically), so ONLY quarterly files should be ingested.

County is the Comptroller's 3-digit county code — Dallas = 057.

Usage:
    python pipeline/sift_parse.py data/downloads/sift/HOT26Q1.CSV
    python pipeline/sift_parse.py --all            # every HOT*Q*.CSV in the drop folder
    python pipeline/sift_parse.py <file> --peek    # print 3 parsed rows, write nothing
"""

from __future__ import annotations

import argparse
import csv
import glob
import json
import logging
import os
import re

from common import DOWNLOADS_DIR, PARSED_DIR, ensure_dirs, location_key

log = logging.getLogger("sift_parse")

SIFT_DIR = os.path.join(DOWNLOADS_DIR, "sift")

COL = {
    "taxpayer_number": 0,
    "taxpayer_name": 1,
    "location_number": 8,
    "location_name": 9,
    "location_address": 10,
    "location_city": 11,
    "location_state": 12,
    "location_zip": 13,
    "location_county": 14,
    "rooms": 16,
    "resp_begin": 17,
    "resp_end": 18,
    "period": 19,
    "filer_type": 20,
    "room_receipts": 21,
    "taxable_receipts": 22,
}
MIN_COLS = 23


def cell(row: list[str], name: str) -> str:
    idx = COL[name]
    return row[idx].strip() if idx < len(row) else ""


def to_money(v: str) -> float | None:
    s = re.sub(r"[,$\s]", "", v)
    if not s or s == "-":
        return None
    try:
        return float(s)
    except ValueError:
        return None


def to_int(v: str) -> int | None:
    m = to_money(v)
    return int(m) if m is not None else None


def parse_file(path: str) -> tuple[list[dict], int]:
    records, skipped = [], 0
    with open(path, newline="", encoding="latin-1", errors="replace") as f:
        for row in csv.reader(f):
            if len(row) < MIN_COLS:
                skipped += 1
                continue
            period = cell(row, "period")
            m = re.fullmatch(r"(\d{4})Q([1-4])", period)
            if not m:
                # monthly-format period (YYYYMMDD) or garbage — quarterly files only
                skipped += 1
                continue
            records.append({
                "taxpayer_number": cell(row, "taxpayer_number"),
                "taxpayer_name": cell(row, "taxpayer_name") or None,
                "location_number": cell(row, "location_number") or None,
                "location_name": cell(row, "location_name") or None,
                "location_address": cell(row, "location_address") or None,
                "location_city": cell(row, "location_city") or None,
                "location_state": cell(row, "location_state") or "TX",
                "location_zip": cell(row, "location_zip") or None,
                "location_county": cell(row, "location_county") or None,
                "location_key": location_key(cell(row, "location_zip"), cell(row, "location_address")),
                "year": int(m.group(1)),
                "quarter": int(m.group(2)),
                "rooms": to_int(cell(row, "rooms")),
                "resp_end": cell(row, "resp_end") or None,
                "filer_type": cell(row, "filer_type") or None,
                "room_receipts": to_money(cell(row, "room_receipts")),
                "taxable_receipts": to_money(cell(row, "taxable_receipts")),
                "source_file": os.path.basename(path),
            })
    return records, skipped


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    p = argparse.ArgumentParser(description="Parse SIFT quarterly hotel receipts files.")
    p.add_argument("file", nargs="?", help="a single HOTyyQn.CSV")
    p.add_argument("--all", action="store_true", help="parse every HOT*Q*.CSV in data/downloads/sift/")
    p.add_argument("--peek", action="store_true", help="print 3 parsed rows, write nothing")
    args = p.parse_args()
    ensure_dirs()

    if args.all:
        files = sorted(glob.glob(os.path.join(SIFT_DIR, "HOT*Q*.CSV")) +
                       glob.glob(os.path.join(SIFT_DIR, "HOT*q*.csv")))
    elif args.file:
        files = [args.file]
    else:
        p.error("give a file or --all")

    for path in files:
        records, skipped = parse_file(path)
        if args.peek:
            for r in records[:3]:
                log.info("%s", json.dumps(r, indent=1))
            log.info("%s: %d rows parsed, %d skipped", os.path.basename(path), len(records), skipped)
            continue
        stem = os.path.splitext(os.path.basename(path))[0]
        out_path = os.path.join(PARSED_DIR, f"sift_{stem}.json")
        with open(out_path, "w") as f:
            json.dump(records, f)
        quarters = sorted({(r["year"], r["quarter"]) for r in records})
        log.info("%s: %d filings (%d skipped) %s -> %s", os.path.basename(path),
                 len(records), skipped, [f"{y}Q{q}" for y, q in quarters], out_path)


if __name__ == "__main__":
    main()
