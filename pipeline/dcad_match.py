"""Match hotels to DCAD appraisal accounts -> owner_enrichment.

Streams the extracted DCAD roll CSVs (see dcad_fetch.py), keeping only
accounts in zip codes where we have hotels, and matches each hotel by
normalized address+zip (fuzzy same-zip fallback). Writes owner name/mailing
address and appraised values into owner_enrichment. Unmatched hotels go to
data/review/dcad_review.csv.

Column names verified against the real DCAD2026_CURRENT export
(ACCOUNT_INFO.CSV, ACCOUNT_APPRL_YEAR.CSV, COM_DETAIL.CSV — quoted CSVs,
UTF-8/latin-1, headers in caps). See "TABLES AND FIELD NAMES.xlsx" in the
extract for the layout doc.

Usage:
    python pipeline/dcad_match.py                      # newest extract under data/downloads/dcad/
    python pipeline/dcad_match.py --dir data/downloads/dcad/DCAD2026_CURRENT
    python pipeline/dcad_match.py --dry-run
"""

from __future__ import annotations

import argparse
import csv
import difflib
import glob
import logging
import os
import re
import sys

from common import (DOWNLOADS_DIR, REVIEW_DIR, ensure_dirs, finish_run, get_conn,
                    normalize_address, start_run)

log = logging.getLogger("dcad_match")

DCAD_DIR = os.path.join(DOWNLOADS_DIR, "dcad")

# Prefer real-property commercial rows over business-personal-property (BPP)
# rows that share the same situs address.
DIVISION_RANK = {"COM": 0, "RES": 1, "BPP": 2}


def open_dcad_csv(path: str):
    f = open(path, newline="", encoding="latin-1", errors="replace")
    return f, csv.DictReader(f)


def find_extract_dir(arg: str | None) -> str:
    if arg:
        return arg
    dirs = [d for d in glob.glob(os.path.join(DCAD_DIR, "*")) if os.path.isdir(d)]
    if not dirs:
        raise SystemExit("No DCAD extract found — run dcad_fetch.py first.")
    return max(dirs, key=os.path.getmtime)


def find_file(extract_dir: str, name: str) -> str:
    for path in glob.glob(os.path.join(extract_dir, "**", "*"), recursive=True):
        if os.path.basename(path).upper() == name:
            return path
    log.error("%s not found under %s", name, extract_dir)
    sys.exit(1)


def zip5(v: str | None) -> str:
    return re.sub(r"\D", "", v or "")[:5]


def to_num(v: str | None) -> float | None:
    if not v:
        return None
    try:
        return float(re.sub(r"[,$]", "", v))
    except ValueError:
        return None


def load_accounts(extract_dir: str, hotel_zips: set[str]) -> dict[str, dict]:
    """address key 'zip5|NORM STREET' -> account record, hotels' zips only."""
    path = find_file(extract_dir, "ACCOUNT_INFO.CSV")
    f, reader = open_dcad_csv(path)
    accounts: dict[str, dict] = {}
    n = 0
    for row in reader:
        n += 1
        z = zip5(row.get("PROPERTY_ZIPCODE"))
        if z not in hotel_zips:
            continue
        street = f"{row.get('STREET_NUM', '')} {row.get('FULL_STREET_NAME', '')}".strip()
        if not street:
            continue
        key = f"{z}|{normalize_address(street)}"
        division = (row.get("DIVISION_CD") or "").strip().upper()
        existing = accounts.get(key)
        if existing and DIVISION_RANK.get(existing["division"], 9) <= DIVISION_RANK.get(division, 9):
            continue
        owner_addr = " ".join(
            x for x in (row.get("OWNER_ADDRESS_LINE1"), row.get("OWNER_ADDRESS_LINE2"),
                        row.get("OWNER_ADDRESS_LINE3"), row.get("OWNER_ADDRESS_LINE4"))
            if x and x.strip())
        accounts[key] = {
            "account_num": (row.get("ACCOUNT_NUM") or "").strip(),
            "owner_name": (row.get("OWNER_NAME1") or "").strip() or None,
            "biz_name": (row.get("BIZ_NAME") or "").strip() or None,
            "owner_addr": owner_addr or None,
            "owner_city": (row.get("OWNER_CITY") or "").strip() or None,
            "owner_state": (row.get("OWNER_STATE") or "").strip() or None,
            "owner_zip": zip5(row.get("OWNER_ZIPCODE")) or None,
            "division": division,
        }
    f.close()
    log.info("Indexed %d DCAD accounts in %d hotel zips (%d rows scanned).",
             len(accounts), len(hotel_zips), n)
    return accounts


def load_values(extract_dir: str, account_nums: set[str]) -> dict[str, dict]:
    """account_num -> values/year built, streaming only the accounts we matched."""
    values: dict[str, dict] = {a: {} for a in account_nums}

    path = find_file(extract_dir, "ACCOUNT_APPRL_YEAR.CSV")
    f, reader = open_dcad_csv(path)
    for row in reader:
        acct = (row.get("ACCOUNT_NUM") or "").strip()
        if acct not in values:
            continue
        rec = values[acct]
        rec["market_value"] = to_num(row.get("TOT_VAL"))
        rec["improvement_value"] = to_num(row.get("IMPR_VAL"))
        rec["land_value"] = to_num(row.get("LAND_VAL"))
        rec["sptb"] = (row.get("SPTD_CODE") or "").strip() or None
        rec["tax_year"] = int(to_num(row.get("APPRAISAL_YR")) or 0) or None
    f.close()

    path = find_file(extract_dir, "COM_DETAIL.CSV")
    f, reader = open_dcad_csv(path)
    for row in reader:
        acct = (row.get("ACCOUNT_NUM") or "").strip()
        if acct not in values:
            continue
        rec = values[acct]
        yb = to_num(row.get("YEAR_BUILT"))
        sqft = to_num(row.get("GROSS_BLDG_AREA"))
        units = to_num(row.get("NUM_UNITS"))
        if yb and not rec.get("year_built"):
            rec["year_built"] = int(yb)
        if sqft and not rec.get("building_sqft"):
            rec["building_sqft"] = int(sqft)
        if units and not rec.get("dcad_units"):
            rec["dcad_units"] = int(units)
    f.close()
    return values


UPSERT_SQL = """
INSERT INTO owner_enrichment (hotel_id, dcad_account_number, sptb_code, division_cd,
    owner_name, owner_address, owner_city, owner_state, owner_zip,
    market_value, improvement_value, land_value, year_built, building_sqft,
    tax_year, match_method, match_confidence, updated_at)
VALUES (%(hotel_id)s, %(account)s, %(sptb)s, %(division)s,
    %(owner_name)s, %(owner_addr)s, %(owner_city)s, %(owner_state)s, %(owner_zip)s,
    %(market_value)s, %(improvement_value)s, %(land_value)s, %(year_built)s,
    %(building_sqft)s, %(tax_year)s, %(method)s, %(confidence)s, now())
ON CONFLICT (hotel_id) DO UPDATE SET
    dcad_account_number = EXCLUDED.dcad_account_number,
    sptb_code = EXCLUDED.sptb_code, division_cd = EXCLUDED.division_cd,
    owner_name = EXCLUDED.owner_name, owner_address = EXCLUDED.owner_address,
    owner_city = EXCLUDED.owner_city, owner_state = EXCLUDED.owner_state,
    owner_zip = EXCLUDED.owner_zip, market_value = EXCLUDED.market_value,
    improvement_value = EXCLUDED.improvement_value, land_value = EXCLUDED.land_value,
    year_built = EXCLUDED.year_built, building_sqft = EXCLUDED.building_sqft,
    tax_year = EXCLUDED.tax_year, match_method = EXCLUDED.match_method,
    match_confidence = EXCLUDED.match_confidence, updated_at = now();
"""


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    p = argparse.ArgumentParser(description="Match hotels to DCAD accounts.")
    p.add_argument("--dir", help="extracted DCAD directory")
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()
    ensure_dirs()

    extract_dir = find_extract_dir(args.dir)
    log.info("Using DCAD extract: %s", extract_dir)

    conn = get_conn()
    try:
        hotels = conn.execute(
            "SELECT id::text, location_key, location_name FROM hotels").fetchall()
        if not hotels:
            raise SystemExit("No hotels yet — run the SIFT stages first.")
        hotel_zips = {lkey.split("|")[0] for _, lkey, _ in hotels if lkey.split("|")[0]}
        accounts = load_accounts(extract_dir, hotel_zips)
        addr_keys = list(accounts.keys())

        matched, review = [], []
        for hid, lkey, name in hotels:
            rec = accounts.get(lkey)
            method, confidence = "address", 1.0
            if not rec:
                z = lkey.split("|")[0]
                same_zip = [k for k in addr_keys if k.startswith(z + "|")]
                close_match = difflib.get_close_matches(lkey, same_zip, n=1, cutoff=0.88)
                if close_match:
                    rec = accounts[close_match[0]]
                    method, confidence = "address_fuzzy", 0.8
            if rec:
                matched.append((hid, rec, method, confidence))
            else:
                review.append({"hotel_id": hid, "location_key": lkey, "location_name": name})

        log.info("Matched %d/%d hotels (%.0f%%); %d unmatched.",
                 len(matched), len(hotels), 100 * len(matched) / max(len(hotels), 1), len(review))
        if args.dry_run:
            return

        values = load_values(extract_dir, {rec["account_num"] for _, rec, _, _ in matched})

        run_id = start_run(conn, "dcad_match", params={"extract": os.path.basename(extract_dir)})
        try:
            with conn.cursor() as cur:
                for hid, rec, method, confidence in matched:
                    vals = values.get(rec["account_num"], {})
                    cur.execute(UPSERT_SQL, {
                        "hotel_id": hid, "account": rec["account_num"],
                        "sptb": vals.get("sptb"), "division": rec["division"],
                        "owner_name": rec["owner_name"], "owner_addr": rec["owner_addr"],
                        "owner_city": rec["owner_city"], "owner_state": rec["owner_state"],
                        "owner_zip": rec["owner_zip"],
                        "market_value": vals.get("market_value"),
                        "improvement_value": vals.get("improvement_value"),
                        "land_value": vals.get("land_value"),
                        "year_built": vals.get("year_built"),
                        "building_sqft": vals.get("building_sqft"),
                        "tax_year": vals.get("tax_year"),
                        "method": method, "confidence": confidence,
                    })
            conn.commit()
            if review:
                path = os.path.join(REVIEW_DIR, "dcad_review.csv")
                with open(path, "w", newline="") as f:
                    w = csv.DictWriter(f, fieldnames=["hotel_id", "location_key", "location_name"])
                    w.writeheader()
                    w.writerows(review)
                log.info("Unmatched hotels -> %s", path)
            finish_run(conn, run_id, processed=len(hotels), updated=len(matched),
                       skipped=len(review))
        except Exception as e:
            conn.rollback()
            finish_run(conn, run_id, status="failed", notes=str(e)[:500])
            raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
