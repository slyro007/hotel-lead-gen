"""Parse a raw Comptroller SIFT hotel tax receipts file into normalized JSON.

The exact SIFT export format is unknown until first download, so the parser is
adaptive: it sniffs the delimiter (CSV/TSV/pipe) and maps columns by fuzzy
header matching against HEADER_MAP. If the real file disagrees, adjust
HEADER_MAP at the top of this file — nothing else should need to change.

Usage:
    python pipeline/sift_parse.py data/downloads/sift/hotel_receipts_2026Q1.csv
    python pipeline/sift_parse.py <file> --county dallas   # filter while parsing (default: keep all)
    python pipeline/sift_parse.py <file> --peek            # print detected header mapping and 3 rows, write nothing

Output: data/parsed/sift_<file-stem>.json — a list of filing records with
canonical field names, ready for sync_filings.py.
"""

from __future__ import annotations

import argparse
import csv
import json
import logging
import os
import re
import sys

from common import PARSED_DIR, ensure_dirs, location_key

log = logging.getLogger("sift_parse")

# canonical field -> lowercase substrings to match against file headers, in
# priority order. First header containing a candidate wins.
HEADER_MAP: dict[str, list[str]] = {
    "taxpayer_number": ["taxpayer number", "taxpayer no", "taxpayer_number", "taxpayer id"],
    "taxpayer_name": ["taxpayer name", "taxpayer_name"],
    "location_name": ["location name", "location_name", "outlet name", "hotel name"],
    "location_address": ["location address", "location_address", "outlet address", "street address", "address"],
    "location_city": ["location city", "location_city", "outlet city", "city"],
    "location_state": ["location state", "location_state", "state"],
    "location_zip": ["location zip", "location_zip", "zip"],
    "location_county": ["location county", "county code", "location_county", "county"],
    "rooms": ["number of rooms", "room count", "units", "capacity", "rooms"],
    "room_receipts": ["total room receipts", "room receipt", "gross receipts", "total receipts"],
    "taxable_receipts": ["taxable receipt", "taxable_receipts"],
    # period: either explicit year/quarter columns, or a filing-period end date
    "year": ["report year", "filing year", "obligation end date year", "year"],
    "quarter": ["report quarter", "filing quarter", "quarter"],
    "period_end": ["obligation end date", "period end", "filing period", "end date"],
}

# Texas county numbers: Dallas = 57 in the Comptroller's county-code scheme.
# The file may carry names or codes — we match either.
COUNTY_CODES = {"dallas": "57"}


def sniff_dialect(sample: str) -> csv.Dialect:
    try:
        return csv.Sniffer().sniff(sample, delimiters=",\t|")
    except csv.Error:
        class D(csv.excel):
            delimiter = ","
        return D()


def map_headers(headers: list[str]) -> dict[str, int]:
    """Return canonical field -> column index. Unmatched fields are absent."""
    lowered = [h.strip().lower() for h in headers]
    mapping: dict[str, int] = {}
    claimed: set[int] = set()
    for field, candidates in HEADER_MAP.items():
        for cand in candidates:
            hit = next((i for i, h in enumerate(lowered) if cand in h and i not in claimed), None)
            if hit is not None:
                mapping[field] = hit
                claimed.add(hit)
                break
    return mapping


def to_money(v: str | None) -> float | None:
    if v is None:
        return None
    s = re.sub(r"[,$\s]", "", v)
    if s in ("", "-"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def to_int(v: str | None) -> int | None:
    m = to_money(v)
    return int(m) if m is not None else None


def derive_period(rec: dict) -> tuple[int | None, int | None]:
    if rec.get("year") and rec.get("quarter"):
        return to_int(rec["year"]), to_int(rec["quarter"])
    end = rec.get("period_end") or ""
    m = re.search(r"(\d{4})-(\d{2})-\d{2}", end) or re.search(r"(\d{2})/\d{2}/(\d{4})", end)
    if m:
        if len(m.group(1)) == 4:
            year, month = int(m.group(1)), int(m.group(2))
        else:
            year, month = int(m.group(2)), int(m.group(1))
        return year, (month - 1) // 3 + 1
    return None, None


def county_matches(value: str | None, county: str) -> bool:
    if not value:
        return False
    v = value.strip().lower()
    return county in v or v == COUNTY_CODES.get(county, "__none__")


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    p = argparse.ArgumentParser(description="Parse a SIFT hotel receipts file to JSON.")
    p.add_argument("file")
    p.add_argument("--county", help="keep only rows in this county (e.g. dallas)")
    p.add_argument("--peek", action="store_true", help="show header mapping + sample rows, write nothing")
    args = p.parse_args()
    ensure_dirs()

    with open(args.file, newline="", encoding="utf-8", errors="replace") as f:
        sample = f.read(64 * 1024)
        f.seek(0)
        dialect = sniff_dialect(sample)
        reader = csv.reader(f, dialect)
        headers = next(reader)
        mapping = map_headers(headers)

        required = {"taxpayer_number", "location_address", "room_receipts"}
        missing = required - mapping.keys()
        if missing:
            log.error("Could not map required columns: %s", sorted(missing))
            log.error("File headers were: %s", headers)
            log.error("Adjust HEADER_MAP in pipeline/sift_parse.py and re-run.")
            sys.exit(1)

        if args.peek:
            log.info("Detected delimiter: %r", dialect.delimiter)
            for field, idx in sorted(mapping.items()):
                log.info("  %-18s <- col %d %r", field, idx, headers[idx])
            for n, row in enumerate(reader):
                if n >= 3:
                    break
                log.info("row %d: %s", n, row)
            return

        records, skipped = [], 0
        for row in reader:
            if not row or len(row) < len(headers) // 2:
                continue
            raw = {field: (row[idx].strip() if idx < len(row) else None)
                   for field, idx in mapping.items()}
            year, quarter = derive_period(raw)
            if not year or not quarter:
                skipped += 1
                continue
            if args.county and not county_matches(raw.get("location_county"), args.county.lower()):
                skipped += 1
                continue
            records.append({
                "taxpayer_number": raw.get("taxpayer_number"),
                "taxpayer_name": raw.get("taxpayer_name"),
                "location_name": raw.get("location_name"),
                "location_address": raw.get("location_address"),
                "location_city": raw.get("location_city"),
                "location_state": raw.get("location_state") or "TX",
                "location_zip": raw.get("location_zip"),
                "location_county": raw.get("location_county"),
                "location_key": location_key(raw.get("location_zip"), raw.get("location_address")),
                "year": year,
                "quarter": quarter,
                "rooms": to_int(raw.get("rooms")),
                "room_receipts": to_money(raw.get("room_receipts")),
                "taxable_receipts": to_money(raw.get("taxable_receipts")),
                "source_file": os.path.basename(args.file),
            })

    stem = os.path.splitext(os.path.basename(args.file))[0]
    out_path = os.path.join(PARSED_DIR, f"sift_{stem}.json")
    with open(out_path, "w") as f:
        json.dump(records, f)
    quarters = sorted({(r["year"], r["quarter"]) for r in records})
    log.info("Parsed %d filings (%d skipped) across quarters %s -> %s",
             len(records), skipped,
             [f"{y}Q{q}" for y, q in quarters], out_path)


if __name__ == "__main__":
    main()
