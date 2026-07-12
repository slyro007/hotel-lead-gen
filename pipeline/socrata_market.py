"""Pull city/county Local Hotel Occupancy Tax reporting from data.texas.gov.

Public Socrata datasets (no auth; optional SOCRATA_APP_TOKEN avoids throttling)
carry the *annual* self-reported HOT revenue for each Texas municipality and
county — the market dashboard's context series. Property-level data comes from
SIFT, not from here.

Reality of the datasets (inspected 2026-07): one dataset per report vintage,
ANNUAL fiscal-year totals, revenue in chapter-coded fields (351 = municipal
HOT, 352/334 = county/venue). We store rows with quarter=0 meaning "full
fiscal year" — the UI treats market_stats as an annual series.

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

# dataset id -> (label, default fiscal year, field names)
DATASETS = {
    "qik7-ypfg": {
        "label": "Local HOT Reporting 2023", "default_year": 2023,
        "name": "name", "type": "type", "year": None,
        "city_revenue": "totalrevenue", "county_revenue": "totalrevenue334",
    },
    "ifh4-9tpn": {
        "label": "Local HOT Reporting 2024", "default_year": 2024,
        "name": "name", "type": "type", "year": None,
        "city_revenue": "totalrevenue351", "county_revenue": "totalrevenue334",
    },
    "er34-v24h": {
        "label": "Local HOT Reporting 2025", "default_year": 2025,
        "name": "name", "type": "type", "year": "fiscalyear",
        "city_revenue": "total_revenue_351", "county_revenue": "total_revenue_334",
    },
}


def to_money(v) -> float | None:
    """Handles Socrata money strings like '$   3,260,385.68' and '$   - 0'."""
    if v is None:
        return None
    s = re.sub(r"[,$\s]", "", str(v))
    if s in ("", "-", "-0"):
        return 0.0
    try:
        return float(s)
    except ValueError:
        return None


UPSERT_SQL = """
INSERT INTO market_stats (geography, year, quarter, reported_receipts, tax_collected,
    source_dataset, updated_at)
VALUES (%s, %s, 0, NULL, %s, %s, now())
ON CONFLICT (geography, year, quarter, source_dataset) DO UPDATE SET
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

    rows_out = []  # (geography, year, tax_collected, dataset)
    for ds_id, cfg in DATASETS.items():
        offset, found = 0, 0
        while True:
            try:
                resp = requests.get(
                    BASE.format(id=ds_id),
                    params={"$limit": 5000, "$offset": offset,
                            "$where": f"lower({cfg['name']}) like '%dallas%'"},
                    headers=headers, timeout=120)
                resp.raise_for_status()
            except requests.RequestException as e:
                log.warning("%s (%s): fetch failed: %s — skipping", ds_id, cfg["label"], e)
                break
            page = resp.json()
            if isinstance(page, dict):  # Socrata error object
                log.warning("%s: %s — skipping", ds_id, page.get("message", page))
                break
            for rec in page:
                name = str(rec.get(cfg["name"], "")).strip().lower()
                etype = str(rec.get(cfg["type"], "")).strip().lower()
                if name != "dallas" and name != "city of dallas":
                    continue
                year = rec.get(cfg["year"]) if cfg["year"] else None
                year = int(year) if year else cfg["default_year"]
                if etype == "city":
                    geo, revenue = "city:Dallas", to_money(rec.get(cfg["city_revenue"]))
                elif etype == "county":
                    geo, revenue = "county:Dallas", to_money(rec.get(cfg["county_revenue"]))
                else:
                    continue
                rows_out.append((geo, year, revenue, ds_id))
                found += 1
            offset += len(page)
            if len(page) < 5000:
                break
        log.info("%s (%s): %d Dallas rows", ds_id, cfg["label"], found)

    for row in rows_out:
        log.info("  %s FY%d tax_collected=%s (%s)", *row)
    if args.dry_run or not rows_out:
        return

    conn = get_conn()
    run_id = start_run(conn, "socrata_market", params={"datasets": list(DATASETS)})
    try:
        with conn.cursor() as cur:
            for geo, year, revenue, ds in rows_out:
                cur.execute(UPSERT_SQL, (geo, year, revenue, ds))
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
