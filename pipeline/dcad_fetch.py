"""Download the DCAD (Dallas Central Appraisal District) appraisal-roll export.

DCAD publishes free ZIP exports of the full appraisal roll on its Data
Products page. This stage scrapes that page for the current-year ZIP link and
downloads it to data/downloads/dcad/. The ZIP contains pipe/comma CSVs plus a
layout doc describing the fields (dcad_match.py consumes them).

If the page structure changes, download the ZIP by hand into
data/downloads/dcad/ and run dcad_match.py directly.

Usage:
    python pipeline/dcad_fetch.py
    python pipeline/dcad_fetch.py --url <direct zip url>
"""

from __future__ import annotations

import argparse
import logging
import os
import re
import zipfile

import requests

from common import DOWNLOADS_DIR, ensure_dirs

log = logging.getLogger("dcad_fetch")

DATA_PRODUCTS_URL = "https://www.dallascad.org/DataProducts.aspx"
# Direct handler URL discovered 2026-07 (works even when DataProducts.aspx
# errors). Bump the year in the filename for future rolls.
CURRENT_ZIP_URL = (
    "https://www.dallascad.org/ViewPDFs.aspx?type=3&id="
    "%5C%5CDCAD.ORG%5CWEB%5CWEBDATA%5CWEBFORMS%5CDATA%20PRODUCTS%5CDCAD2026_CURRENT.ZIP"
)
DCAD_DIR = os.path.join(DOWNLOADS_DIR, "dcad")


def find_zip_links(html: str) -> list[str]:
    links = re.findall(r'href=["\']([^"\']+\.zip)["\']', html, re.IGNORECASE)
    # prefer current-appraisal exports over GIS shapefiles
    ranked = sorted(links, key=lambda u: ("current" not in u.lower(), "gis" in u.lower()))
    return ranked


def download(url: str) -> str:
    if url.startswith("/") or not url.startswith("http"):
        url = "https://www.dallascad.org/" + url.lstrip("/")
    name = os.path.basename(url)
    dest = os.path.join(DCAD_DIR, name)
    log.info("Downloading %s ...", url)
    with requests.get(url, stream=True, timeout=600,
                      headers={"User-Agent": "Mozilla/5.0"}) as r:
        r.raise_for_status()
        with open(dest, "wb") as f:
            for chunk in r.iter_content(1 << 20):
                f.write(chunk)
    log.info("Saved %s (%.1f MB)", dest, os.path.getsize(dest) / 1e6)
    return dest


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    p = argparse.ArgumentParser(description="Download the DCAD appraisal-roll ZIP.")
    p.add_argument("--url", help="direct ZIP url (skip page scrape)")
    args = p.parse_args()
    ensure_dirs()

    if args.url:
        dest = download(args.url)
    else:
        # Try the page scrape first (keeps us current across years), fall back
        # to the known direct handler URL — the page errors out routinely.
        dest = None
        try:
            resp = requests.get(DATA_PRODUCTS_URL, timeout=60,
                                headers={"User-Agent": "Mozilla/5.0"})
            resp.raise_for_status()
            links = find_zip_links(resp.text)
            if links:
                log.info("Found %d zip link(s); taking the first: %s", len(links), links[0])
                dest = download(links[0])
        except requests.RequestException as e:
            log.warning("Data Products page unavailable (%s)", e)
        if dest is None:
            log.info("Falling back to the direct DCAD2026_CURRENT.ZIP handler URL.")
            dest = download(CURRENT_ZIP_URL)

    out_dir = os.path.join(DCAD_DIR, os.path.splitext(os.path.basename(dest))[0])
    with zipfile.ZipFile(dest) as z:
        z.extractall(out_dir)
        log.info("Extracted %d files to %s:", len(z.namelist()), out_dir)
        for n in z.namelist()[:20]:
            log.info("  %s", n)


if __name__ == "__main__":
    main()
