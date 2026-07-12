"""Franchise-tax owner enrichment — find a human behind each hotel's LLC.

Every hotel files taxes under a state taxpayer number (already stored on
`hotels.current_taxpayer_number`). The Comptroller exposes a FREE public JSON
endpoint keyed by that number that returns the entity's **registered agent**
(a real person/company legally required to receive its mail) and its
**officers/directors** (often the actual humans who run it). No API key.

    GET https://comptroller.texas.gov/data-search/franchise-tax/{taxpayerId}
    -> { data: { registeredAgentName, registeredOfficeAddress*, rightToTransactTX,
                 officerInfo: [ {AGNT_NM, AGNT_TITL_TX, AGNT_ACTV_YR, ...} ] } }

We store the agent + officers on `owner_enrichment` (columns already exist),
upserting by hotel_id so it merges with the DCAD owner row. This is the cheapest
possible owner-contact path — $0, vs. paid skip-trace.

Usage:
    python pipeline/franchise_lookup.py --dry-run
    python pipeline/franchise_lookup.py --limit 5      # first 5 (testing)
    python pipeline/franchise_lookup.py                # all missing
    python pipeline/franchise_lookup.py --refresh      # re-fetch even if present
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import time

import requests

from common import REVIEW_DIR, ensure_dirs, finish_run, get_conn, start_run

log = logging.getLogger("franchise_lookup")

API = "https://comptroller.texas.gov/data-search/franchise-tax/{tid}"
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)
DELAY_SEC = 0.4  # be polite to a free public endpoint
REVIEW_CSV = os.path.join(REVIEW_DIR, "franchise_review.csv")


def clean_tid(v: str | None) -> str | None:
    if not v:
        return None
    tid = "".join(ch for ch in v if ch.isdigit())
    # all-zero / too-short taxpayer numbers aren't real entities
    if len(tid) < 8 or set(tid) == {"0"}:
        return None
    return tid


def fetch(tid: str) -> dict | None:
    url = API.format(tid=tid)
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
        "Referer": f"https://comptroller.texas.gov/taxes/franchise/account-status/search/{tid}",
    }
    for attempt in range(3):
        try:
            r = requests.get(url, headers=headers, timeout=30)
            if r.status_code == 404:
                return None
            r.raise_for_status()
            body = r.json()
            return body.get("data") if body.get("success") else None
        except requests.RequestException as e:
            if attempt == 2:
                log.warning("  %s failed: %s", tid, e)
                return None
            time.sleep(2 * (attempt + 1))
    return None


def parse(data: dict) -> tuple[dict | None, list[dict]]:
    """(registered_agent, officers) from the API payload."""
    agent = None
    name = (data.get("registeredAgentName") or "").strip()
    if name:
        addr = " ".join(
            str(data.get(k) or "").strip()
            for k in ("registeredOfficeAddressStreet", "registeredOfficeAddressCity")
        ).strip()
        st = (data.get("registeredOfficeAddressState") or "").strip()
        zp = (data.get("registeredOfficeAddressZip") or "").strip()
        full = ", ".join(p for p in [addr, f"{st} {zp}".strip()] if p)
        agent = {"name": name, "address": full or None, "status": data.get("rightToTransactTX")}

    officers: list[dict] = []
    seen: set[tuple[str, str]] = set()
    for o in data.get("officerInfo") or []:
        onm = (o.get("AGNT_NM") or "").strip()
        title = (o.get("AGNT_TITL_TX") or "").strip()
        if not onm:
            continue
        key = (onm.upper(), title.upper())
        if key in seen:
            continue
        seen.add(key)
        officers.append({"name": onm, "title": title or None, "year": o.get("AGNT_ACTV_YR")})
    return agent, officers


UPSERT = """
INSERT INTO owner_enrichment (hotel_id, registered_agent, officers, updated_at)
VALUES (%s, %s, %s, now())
ON CONFLICT (hotel_id) DO UPDATE SET
    registered_agent = EXCLUDED.registered_agent,
    officers = EXCLUDED.officers,
    updated_at = now()
"""


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    p = argparse.ArgumentParser(description="Franchise-tax registered agent / officer lookup.")
    p.add_argument("--dry-run", action="store_true", help="fetch + report, write nothing")
    p.add_argument("--limit", type=int, help="only the first N hotels (testing)")
    p.add_argument("--refresh", action="store_true", help="re-fetch even where data exists")
    args = p.parse_args()
    ensure_dirs()

    conn = get_conn()

    # Hotels with a usable taxpayer number, missing franchise data (unless --refresh).
    where_missing = "" if args.refresh else (
        " and (e.registered_agent is null)"
    )
    rows = conn.execute(
        f"""
        select h.id, h.location_name, h.current_taxpayer_number
        from hotels h
        left join owner_enrichment e on e.hotel_id = h.id
        where h.current_taxpayer_number is not null{where_missing}
        order by h.location_name
        """
    ).fetchall()

    targets = []
    for hid, name, tid_raw in rows:
        tid = clean_tid(tid_raw)
        if tid:
            targets.append((hid, name, tid))
    if args.limit:
        targets = targets[: args.limit]

    log.info("%d hotels to look up%s", len(targets), " (dry-run)" if args.dry_run else "")

    run_id = None if args.dry_run else start_run(conn, "franchise_lookup", params={"count": len(targets)})
    found = matched_agent = no_data = 0
    review: list[str] = []

    try:
        for i, (hid, name, tid) in enumerate(targets, 1):
            data = fetch(tid)
            time.sleep(DELAY_SEC)
            if not data:
                no_data += 1
                review.append(f"{tid},{name}")
                continue
            agent, officers = parse(data)
            found += 1
            if agent:
                matched_agent += 1
            if args.dry_run:
                if i <= 5:
                    log.info("  %s -> agent=%s, %d officers", name,
                             agent["name"] if agent else "—", len(officers))
                continue
            conn.execute(
                UPSERT,
                (hid, json.dumps(agent) if agent else None, json.dumps(officers) if officers else None),
            )
            if i % 50 == 0:
                conn.commit()
                log.info("  %d/%d …", i, len(targets))

        if not args.dry_run:
            conn.commit()
            if review:
                with open(REVIEW_CSV, "w") as f:
                    f.write("taxpayer_number,hotel_name\n" + "\n".join(review) + "\n")
            finish_run(conn, run_id, processed=len(targets), updated=found)

        log.info(
            "Done: %d entities found (%d with a named agent), %d had no franchise record%s.",
            found, matched_agent, no_data,
            f" -> {REVIEW_CSV}" if (review and not args.dry_run) else "",
        )
    except Exception as e:  # noqa: BLE001
        if run_id:
            finish_run(conn, run_id, status="failed", notes=str(e)[:500])
        raise


if __name__ == "__main__":
    main()
