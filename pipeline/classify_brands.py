"""Classify hotel brand/chain from location names via the Claude Batches API.

Fills hotels.brand_family / brand_name / brand_class / classification_confidence
for rows where classified_at is null. Independent (non-branded) is a lead-score
input, so "independent" vs "branded" is the call that matters; the family/flag
are display metadata. Batches run at 50% of standard price; ~900 hotels costs
on the order of a dollar.

Usage:
    python pipeline/classify_brands.py            # submit batch, poll, apply
    python pipeline/classify_brands.py --limit 20
    python pipeline/classify_brands.py --dry-run
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import time

import anthropic
from anthropic.types.message_create_params import MessageCreateParamsNonStreaming
from anthropic.types.messages.batch_create_params import Request
from dotenv import load_dotenv

from common import REPO_ROOT, finish_run, get_conn, start_run

log = logging.getLogger("classify_brands")

MODEL = "claude-opus-4-8"

PROMPT = """Classify this Texas lodging property from its tax-filing name and address.

Name: {name}
Address: {address}, {city} TX {zip}

Respond with ONLY a JSON object, no other text:
{{"brand_family": "<parent company, e.g. Marriott, Hilton, IHG, Wyndham, Choice, Hyatt, Best Western, G6, or null if independent/unknown>",
"brand_name": "<specific flag, e.g. Courtyard, Hampton Inn, Motel 6, or null>",
"brand_class": "<branded | independent | unknown>",
"confidence": <0.0-1.0>}}

Rules: a franchise flag in the name (e.g. "SUPER 8 DALLAS") = branded. A unique
name with no chain affiliation (e.g. "THE ADOLPHUS", "LUCKY LODGE") = independent
(boutique/historic hotels without a chain flag count as independent). If the name
is too generic to tell (e.g. "DALLAS HOTEL LLC"), use unknown with low confidence."""


def parse_result(text: str) -> dict | None:
    try:
        start, end = text.index("{"), text.rindex("}") + 1
        d = json.loads(text[start:end])
        if d.get("brand_class") in ("branded", "independent", "unknown"):
            return d
    except (ValueError, json.JSONDecodeError):
        pass
    return None


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    p = argparse.ArgumentParser(description="Claude-classify hotel brands.")
    p.add_argument("--limit", type=int)
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()
    load_dotenv(os.path.join(REPO_ROOT, ".env"))

    conn = get_conn()
    try:
        sql = """SELECT id::text, location_name, address, city, zip FROM hotels
                 WHERE classified_at IS NULL AND location_name IS NOT NULL"""
        if args.limit:
            sql += f" LIMIT {int(args.limit)}"
        rows = conn.execute(sql).fetchall()
        if not rows:
            log.info("Nothing to classify.")
            return
        if args.dry_run:
            log.info("[dry-run] would classify %d hotels via %s (Batches).", len(rows), MODEL)
            return

        client = anthropic.Anthropic()
        requests_ = [
            Request(
                custom_id=r[0],
                params=MessageCreateParamsNonStreaming(
                    model=MODEL,
                    max_tokens=300,
                    messages=[{"role": "user", "content": PROMPT.format(
                        name=r[1], address=r[2] or "", city=r[3] or "", zip=r[4] or "")}],
                ),
            )
            for r in rows
        ]

        run_id = start_run(conn, "classify_brands", params={"count": len(rows), "model": MODEL})
        try:
            batch = client.messages.batches.create(requests=requests_)
            log.info("Batch %s submitted (%d requests); polling...", batch.id, len(rows))
            while True:
                batch = client.messages.batches.retrieve(batch.id)
                if batch.processing_status == "ended":
                    break
                log.info("  status=%s processing=%d", batch.processing_status,
                         batch.request_counts.processing)
                time.sleep(30)

            applied, failed = 0, 0
            for result in client.messages.batches.results(batch.id):
                if result.result.type != "succeeded":
                    failed += 1
                    continue
                msg = result.result.message
                text = next((b.text for b in msg.content if b.type == "text"), "")
                d = parse_result(text)
                if not d:
                    failed += 1
                    continue
                conn.execute(
                    """UPDATE hotels SET brand_family=%s, brand_name=%s, brand_class=%s,
                       classification_confidence=%s, classified_at=now(), updated_at=now()
                       WHERE id=%s""",
                    (d.get("brand_family"), d.get("brand_name"), d["brand_class"],
                     d.get("confidence"), result.custom_id),
                )
                applied += 1
            conn.commit()
            finish_run(conn, run_id, processed=len(rows), updated=applied, skipped=failed,
                       notes=f"batch {batch.id}")
            log.info("Classified %d hotels (%d failed/unparseable).", applied, failed)
        except Exception as e:
            conn.rollback()
            finish_run(conn, run_id, status="failed", notes=str(e)[:500])
            raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
