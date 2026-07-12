"""Shared helpers for the Hotel Lead Gen ingestion pipeline.

Every stage script imports from here: database connection (Neon via
DATABASE_URL), ingestion_runs bookkeeping, address normalization / the
location_key dedupe key, and quarter math.
"""

from __future__ import annotations

import json
import logging
import os
import re
from datetime import date

import psycopg
from dotenv import load_dotenv

log = logging.getLogger("common")

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(REPO_ROOT, "data")
DOWNLOADS_DIR = os.path.join(DATA_DIR, "downloads")
PARSED_DIR = os.path.join(DATA_DIR, "parsed")
REVIEW_DIR = os.path.join(DATA_DIR, "review")


def get_conn() -> psycopg.Connection:
    load_dotenv(os.path.join(REPO_ROOT, ".env"))
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        raise SystemExit("DATABASE_URL not set — copy .env.example to .env and fill it in")
    return psycopg.connect(dsn)


def ensure_dirs() -> None:
    for d in (DOWNLOADS_DIR, PARSED_DIR, REVIEW_DIR,
              os.path.join(DOWNLOADS_DIR, "sift"), os.path.join(DOWNLOADS_DIR, "dcad")):
        os.makedirs(d, exist_ok=True)


# --- ingestion_runs bookkeeping -------------------------------------------------

def start_run(conn: psycopg.Connection, stage: str, source_file: str | None = None,
              params: dict | None = None) -> str:
    row = conn.execute(
        """INSERT INTO ingestion_runs (stage, status, source_file, params, started_at)
           VALUES (%s, 'running', %s, %s, now()) RETURNING id""",
        (stage, source_file, json.dumps(params or {})),
    ).fetchone()
    conn.commit()
    return row[0]


def finish_run(conn: psycopg.Connection, run_id: str, status: str = "success",
               processed: int = 0, inserted: int = 0, updated: int = 0,
               skipped: int = 0, notes: str | None = None) -> None:
    conn.execute(
        """UPDATE ingestion_runs SET status=%s, rows_processed=%s, rows_inserted=%s,
           rows_updated=%s, rows_skipped=%s, notes=%s, finished_at=now() WHERE id=%s""",
        (status, processed, inserted, updated, skipped, notes, run_id),
    )
    conn.commit()


# --- address normalization / location_key ---------------------------------------

# USPS-style suffix + directional abbreviations. Applied word-by-word after
# stripping punctuation, so "1600 North Stemmons Freeway" == "1600 N STEMMONS FWY".
_ABBREV = {
    "STREET": "ST", "AVENUE": "AVE", "BOULEVARD": "BLVD", "DRIVE": "DR",
    "LANE": "LN", "ROAD": "RD", "COURT": "CT", "CIRCLE": "CIR", "PLACE": "PL",
    "PARKWAY": "PKWY", "HIGHWAY": "HWY", "FREEWAY": "FWY", "EXPRESSWAY": "EXPY",
    "TRAIL": "TRL", "TERRACE": "TER", "SQUARE": "SQ", "PLAZA": "PLZ",
    "CROSSING": "XING", "CENTER": "CTR", "CENTRE": "CTR",
    "NORTH": "N", "SOUTH": "S", "EAST": "E", "WEST": "W",
    "NORTHEAST": "NE", "NORTHWEST": "NW", "SOUTHEAST": "SE", "SOUTHWEST": "SW",
    # unit designators dropped entirely (suite numbers churn between filings)
    "SUITE": "", "STE": "", "UNIT": "", "APT": "", "BLDG": "", "FLOOR": "", "FL": "",
}
# interstate variants: "IH-35", "IH 35", "I 35" → "I35"
_INTERSTATE = re.compile(r"\b(?:IH|I)[\s-]*(\d+)")


def normalize_address(addr: str | None) -> str:
    if not addr:
        return ""
    s = addr.upper()
    s = _INTERSTATE.sub(r"I\1", s)
    s = re.sub(r"[^\w\s]", " ", s)
    words = [_ABBREV.get(w, w) for w in s.split()]
    # drop unit designator *and* its trailing token ("STE 200" → "")
    out: list[str] = []
    skip_next = False
    for orig, mapped in zip(s.split(), words):
        if skip_next:
            skip_next = False
            continue
        if mapped == "" :
            skip_next = True
            continue
        out.append(mapped)
    return " ".join(out)


def location_key(zip_code: str | None, address: str | None) -> str:
    zip5 = re.sub(r"\D", "", zip_code or "")[:5]
    return f"{zip5}|{normalize_address(address)}"


# --- quarter math ----------------------------------------------------------------

def days_in_quarter(year: int, quarter: int) -> int:
    starts = {1: date(year, 1, 1), 2: date(year, 4, 1), 3: date(year, 7, 1), 4: date(year, 10, 1)}
    ends = {1: date(year, 4, 1), 2: date(year, 7, 1), 3: date(year, 10, 1), 4: date(year + 1, 1, 1)}
    return (ends[quarter] - starts[quarter]).days


def period_str(year: int, quarter: int) -> str:
    return f"{year}Q{quarter}"


def parse_period(s: str) -> tuple[int, int]:
    m = re.fullmatch(r"(\d{4})Q([1-4])", s.strip().upper())
    if not m:
        raise ValueError(f"bad period {s!r}, expected e.g. 2026Q1")
    return int(m.group(1)), int(m.group(2))


def prev_quarter(year: int, quarter: int, n: int = 1) -> tuple[int, int]:
    idx = year * 4 + (quarter - 1) - n
    return idx // 4, idx % 4 + 1


def quarter_index(year: int, quarter: int) -> int:
    """Monotonic integer for ordering/diffing quarters."""
    return year * 4 + (quarter - 1)
