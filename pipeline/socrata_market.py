"""Pull city/county Local Hotel Occupancy Tax collections from data.texas.gov.

Public Socrata datasets (no auth; optional SOCRATA_APP_TOKEN avoids throttling)
give market-level HOT collections reported by the City of Dallas and Dallas
County — the market dashboard's context series. Property-level data comes from
SIFT, not from here.

Dataset field names are mapped adaptively (FIELD_MAP) since Socrata schemas
drift year to year.

Usage:
    python pipeline/socrata_market.py
    python pipeline/socrata_market.py --dry-run
"""

from __future__ import annotations

import argparse
import logging
import os
import re

import requests
from dotenv import load_dotenv

from common import REPO_ROOT, finish_run, get_conn, start_run

log = logging.getLogger("socrata_market")

BASE = "https://data.texas.gov/resource/{id}.json"
# Local HOT Reporting datasets by vintage (4x4 Socrata ids)
DATASETS = {
    "vmy5-jctb": "Local HOT Data (base)",
    "qik7-ypfg": "Local HOT Reporting 2023",
    "ifh4-9tpn": "Local HOT Reporting 2024",
    "er34-v24h": "Local HOT Reporting 2025",
}

# canonical -> candidate Socrata field-name substrings
FIELD_MAP = {
    "entity_name": ["municipality", "city", "entity", "government", "name"],
    "entity_type": ["type", "level"],
    "year": ["year"],
    "quarter": ["quarter"],
    "period": ["period", "date", "month"],
    "receipts": ["taxable_receipts", "receipts", "revenue_subject"],
    "tax_collected": ["tax_collected", "collections", "amount", "revenue"],
}


def map_fields(sample: dict) -> dict[str, str]:
    keys = list(sample.keys())
    out = {}
    for canon, cands in FIELD_MAP.items():
        for c in cands:
            hit = next((k for k in keys if c in k.lower()), None)
            if hit and hit not in out.values():
                out[canon] = hit
                break
    return out


def derive_quarter(rec: dict, fm: dict) -> tuple[int | None, int | None]:
    y = rec.get(fm.get("year", ""), None)
    q = rec.get(fm.get("quarter", ""), None)
    if y and q:
        try:
            return int(float(y)), int(float(q))
        except ValueError:
            pass
    period = str(rec.get(fm.get("period", ""), ""))
    m = re.search(r"(\d{4})-(\d{2})", period)
    if m:
        return int(m.group(1)), (int(m.group(2)) - 1) // 3 + 1
    return None, None


def to_num(v) -> float | None:
    try:
        return float(re.sub(r"[,$]", "", str(v)))
    except (ValueError, TypeError):
        return None


def is_dallas(rec: dict, fm: dict) -> str | None:
    name = str(rec.get(fm.get("entity_name", ""), "")).strip().lower()
    etype = str(rec.get(fm.get("entity_type", ""), "")).strip().lower()
    if name == "dallas" or name == "city of dallas":
        return "city:Dallas"
    if "dallas" in name and "county" in (name + " " + etype):
        return "county:Dallas"
    return None


UPSERT_SQL = """
INSERT INTO market_stats (geography, year, quarter, reported_receipts, tax_collected,
    source_dataset, updated_at)
VALUES (%s, %s, %s, %s, %s, %s, now())
ON CONFLICT (geography, year, quarter, source_dataset) DO UPDATE SET
    reported_receipts = EXCLUDED.reported_receipts,
    tax_collected = EXCLUDED.tax_collected, updated_at = now();
"""


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    p = argparse.ArgumentParser(description="Pull Dallas HOT market stats from Socrata.")
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()
    load_dotenv(os.path.join(REPO_ROOT, ".env"))

    headers = {}
    if os.environ.get("SOCRATA_APP_TOKEN"):
        headers["X-App-Token"] = os.environ["SOCRATA_APP_TOKEN"]

    rows_out = []  # (geography, year, quarter, receipts, tax, dataset)
    for ds_id, label in DATASETS.items():
        url = BASE.format(id=ds_id)
        offset, fm = 0, None
        while True:
            try:
                resp = requests.get(url, params={"$limit": 5000, "$offset": offset},
                                    headers=headers, timeout=120)
                resp.raise_for_status()
            except requests.RequestException as e:
                log.warning("%s (%s): fetch failed: %s — skipping dataset", ds_id, label, e)
                break
            page = resp.json()
            if not page:
                break
            if fm is None:
                fm = map_fields(page[0])
                log.info("%s (%s): fields %s", ds_id, label, fm)
            for rec in page:
                geo = is_dallas(rec, fm)
                if not geo:
                    continue
                year, quarter = derive_quarter(rec, fm)
                if not year or not quarter:
                    continue
                rows_out.append((geo, year, quarter,
                                 to_num(rec.get(fm.get("receipts", ""))),
                                 to_num(rec.get(fm.get("tax_collected", ""))),
                                 ds_id))
            offset += len(page)
            if len(page) < 5000:
                break

    log.info("Collected %d Dallas market rows.", len(rows_out))
    if args.dry_run or not rows_out:
        return

    conn = get_conn()
    run_id = start_run(conn, "socrata_market", params={"datasets": list(DATASETS)})
    try:
        with conn.cursor() as cur:
            for row in rows_out:
                cur.execute(UPSERT_SQL, row)
        conn.commit()
        finish_run(conn, run_id, processed=len(rows_out), updated=len(rows_out))
        log.info("Upserted %d market_stats rows.", len(rows_out))
    except Exception as e:
        conn.rollback()
        finish_run(conn, run_id, status="failed", notes=str(e)[:500])
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
