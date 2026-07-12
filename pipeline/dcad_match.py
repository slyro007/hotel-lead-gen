"""Match hotels to DCAD appraisal accounts -> owner_enrichment.

Loads the extracted DCAD roll CSVs (see dcad_fetch.py), indexes accounts by
normalized address, and matches each hotel by address+zip (fuzzy name match as
fallback). Writes owner name/mailing address and appraised values into
owner_enrichment. Ambiguous or unmatched hotels go to data/review/dcad_review.csv.

The DCAD export layout is confirmed at first download — the FILE_MAP /
COLUMN_MAP dicts at the top are the only things that should need adjusting.

Usage:
    python pipeline/dcad_match.py                      # auto-find newest extract under data/downloads/dcad/
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

from common import DOWNLOADS_DIR, REVIEW_DIR, ensure_dirs, finish_run, get_conn, normalize_address, start_run

log = logging.getLogger("dcad_match")

DCAD_DIR = os.path.join(DOWNLOADS_DIR, "dcad")

# Filenames inside the DCAD export (case-insensitive substring match).
FILE_MAP = {
    "account_info": ["account_info"],          # situs address, owner name+mailing address
    "account_apprl_year": ["account_apprl", "apprl_year"],  # values, year built lives in RES/COM detail
    "com_detail": ["com_detail", "commercial"],  # commercial building detail (year built, sqft)
}

# canonical -> candidate header substrings (lowercased)
COLUMN_MAP = {
    "account_num": ["account_num", "account number", "acct"],
    "street_num": ["street_num", "situs_num"],
    "street_name": ["street_name", "situs_street", "street_half_num"],
    "street_suffix": ["street_suffix", "suffix"],
    "situs_zip": ["property_zipcode", "situs_zip", "zip"],
    "owner_name": ["owner_name1", "owner name", "owner_name"],
    "owner_addr1": ["owner_address_line1", "owner_addr1", "owner address"],
    "owner_addr2": ["owner_address_line2", "owner_addr2"],
    "owner_city": ["owner_city"],
    "owner_state": ["owner_state"],
    "owner_zip": ["owner_zipcode", "owner_zip"],
    "division": ["division_cd", "division"],
    "sptb": ["sptd_code", "sptb", "state_cd", "spt"],
    "market_value": ["tot_val", "market_val", "total_val"],
    "improvement_value": ["impr_val", "improvement"],
    "land_value": ["land_val"],
    "year_built": ["yr_built", "year_built", "act_yr_built"],
    "building_sqft": ["tot_main_sf", "bldg_area", "gross_bldg_area", "sqft"],
    "tax_year": ["appraisal_yr", "tax_yr", "year"],
}


def open_dcad_csv(path: str):
    f = open(path, newline="", encoding="latin-1", errors="replace")
    sample = f.read(32 * 1024)
    f.seek(0)
    delim = "|" if sample.count("|") > sample.count(",") else ","
    return f, csv.reader(f, delimiter=delim)


def map_cols(headers: list[str]) -> dict[str, int]:
    lowered = [h.strip().lower() for h in headers]
    out = {}
    for field, cands in COLUMN_MAP.items():
        for c in cands:
            hit = next((i for i, h in enumerate(lowered) if c in h), None)
            if hit is not None:
                out[field] = hit
                break
    return out


def find_extract_dir(arg: str | None) -> str:
    if arg:
        return arg
    dirs = [d for d in glob.glob(os.path.join(DCAD_DIR, "*")) if os.path.isdir(d)]
    if not dirs:
        raise SystemExit("No DCAD extract found — run dcad_fetch.py first.")
    return max(dirs, key=os.path.getmtime)


def find_file(extract_dir: str, keys: list[str]) -> str | None:
    for path in glob.glob(os.path.join(extract_dir, "**", "*"), recursive=True):
        base = os.path.basename(path).lower()
        if any(k in base for k in keys) and base.endswith((".csv", ".txt")):
            return path
    return None


def get(row: list[str], cols: dict[str, int], field: str) -> str | None:
    idx = cols.get(field)
    if idx is None or idx >= len(row):
        return None
    v = row[idx].strip()
    return v or None


def to_num(v: str | None) -> float | None:
    if not v:
        return None
    try:
        return float(re.sub(r"[,$]", "", v))
    except ValueError:
        return None


def load_accounts(extract_dir: str) -> dict[str, dict]:
    """address key 'zip5|NORM STREET' -> account record."""
    path = find_file(extract_dir, FILE_MAP["account_info"])
    if not path:
        log.error("account_info file not found under %s — check FILE_MAP.", extract_dir)
        sys.exit(1)
    f, reader = open_dcad_csv(path)
    headers = next(reader)
    cols = map_cols(headers)
    log.info("account_info: %s — mapped %d columns", os.path.basename(path), len(cols))

    accounts: dict[str, dict] = {}
    n = 0
    for row in reader:
        n += 1
        num = get(row, cols, "street_num") or ""
        name = get(row, cols, "street_name") or ""
        suffix = get(row, cols, "street_suffix") or ""
        zip5 = re.sub(r"\D", "", get(row, cols, "situs_zip") or "")[:5]
        if not name or not zip5:
            continue
        key = f"{zip5}|{normalize_address(f'{num} {name} {suffix}')}"
        accounts[key] = {
            "account_num": get(row, cols, "account_num"),
            "owner_name": get(row, cols, "owner_name"),
            "owner_addr": " ".join(x for x in (get(row, cols, "owner_addr1"), get(row, cols, "owner_addr2")) if x),
            "owner_city": get(row, cols, "owner_city"),
            "owner_state": get(row, cols, "owner_state"),
            "owner_zip": get(row, cols, "owner_zip"),
            "division": get(row, cols, "division"),
            "sptb": get(row, cols, "sptb"),
        }
    f.close()
    log.info("Indexed %d DCAD accounts (%d rows scanned).", len(accounts), n)
    return accounts


def load_values(extract_dir: str) -> dict[str, dict]:
    """account_num -> appraisal values / year built."""
    values: dict[str, dict] = {}
    for part in ("account_apprl_year", "com_detail"):
        path = find_file(extract_dir, FILE_MAP[part])
        if not path:
            log.warning("%s file not found — values/year_built may be missing.", part)
            continue
        f, reader = open_dcad_csv(path)
        headers = next(reader)
        cols = map_cols(headers)
        for row in reader:
            acct = get(row, cols, "account_num")
            if not acct:
                continue
            rec = values.setdefault(acct, {})
            for field in ("market_value", "improvement_value", "land_value",
                          "year_built", "building_sqft", "tax_year"):
                v = to_num(get(row, cols, field))
                if v is not None and rec.get(field) is None:
                    rec[field] = v
        f.close()
        log.info("%s: %s loaded.", part, os.path.basename(path))
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
    accounts = load_accounts(extract_dir)
    values = load_values(extract_dir)

    conn = get_conn()
    try:
        hotels = conn.execute(
            "SELECT id::text, location_key, location_name FROM hotels").fetchall()
        matched, review = [], []
        addr_keys = list(accounts.keys())
        for hid, lkey, name in hotels:
            rec = accounts.get(lkey)
            method, confidence = "address", 1.0
            if not rec:
                # fuzzy fallback: closest DCAD address in the same zip
                zip5 = lkey.split("|")[0]
                same_zip = [k for k in addr_keys if k.startswith(zip5 + "|")]
                close_match = difflib.get_close_matches(lkey, same_zip, n=1, cutoff=0.88)
                if close_match:
                    rec = accounts[close_match[0]]
                    method, confidence = "address_fuzzy", 0.8
            if rec:
                vals = values.get(rec["account_num"] or "", {})
                matched.append({
                    "hotel_id": hid, "account": rec["account_num"],
                    "sptb": rec["sptb"], "division": rec["division"],
                    "owner_name": rec["owner_name"], "owner_addr": rec["owner_addr"],
                    "owner_city": rec["owner_city"], "owner_state": rec["owner_state"],
                    "owner_zip": rec["owner_zip"],
                    "market_value": vals.get("market_value"),
                    "improvement_value": vals.get("improvement_value"),
                    "land_value": vals.get("land_value"),
                    "year_built": int(vals["year_built"]) if vals.get("year_built") else None,
                    "building_sqft": int(vals["building_sqft"]) if vals.get("building_sqft") else None,
                    "tax_year": int(vals["tax_year"]) if vals.get("tax_year") else None,
                    "method": method, "confidence": confidence,
                })
            else:
                review.append({"hotel_id": hid, "location_key": lkey, "location_name": name})

        log.info("Matched %d/%d hotels (%.0f%%); %d unmatched.",
                 len(matched), len(hotels), 100 * len(matched) / max(len(hotels), 1), len(review))
        if args.dry_run:
            return

        run_id = start_run(conn, "dcad_match", params={"extract": os.path.basename(extract_dir)})
        try:
            with conn.cursor() as cur:
                for m in matched:
                    cur.execute(UPSERT_SQL, m)
            conn.commit()
            if review:
                path = os.path.join(REVIEW_DIR, "dcad_review.csv")
                with open(path, "w", newline="") as f:
                    w = csv.DictWriter(f, fieldnames=["hotel_id", "location_key", "location_name"])
                    w.writeheader()
                    w.writerows(review)
                log.info("Unmatched hotels -> %s", path)
            finish_run(conn, run_id, processed=len(hotels), updated=len(matched), skipped=len(review))
        except Exception as e:
            conn.rollback()
            finish_run(conn, run_id, status="failed", notes=str(e)[:500])
            raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
