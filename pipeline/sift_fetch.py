"""SIFT hotel tax receipts file acquisition.

Primary path (v1): download the file BY HAND from the Comptroller's SIFT site
(https://data-secure.comptroller.texas.gov/home/login) into
data/downloads/sift/, then run sift_parse.py on it. `--manual` just validates
that a plausible file is present.

Scripted download via Playwright is a later convenience — SIFT sits behind a
login and the flow isn't worth automating until the quarterly cadence gets
annoying. Credentials would come from SIFT_USERNAME / SIFT_PASSWORD in .env
(never hardcode them).

Usage:
    python pipeline/sift_fetch.py --manual     # check the drop folder
"""

from __future__ import annotations

import argparse
import glob
import logging
import os

from common import DOWNLOADS_DIR, ensure_dirs

log = logging.getLogger("sift_fetch")

SIFT_DIR = os.path.join(DOWNLOADS_DIR, "sift")


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    p = argparse.ArgumentParser(description="Validate (or later, fetch) SIFT files.")
    p.add_argument("--manual", action="store_true",
                   help="validate that files exist in the drop folder")
    args = p.parse_args()
    ensure_dirs()

    files = sorted(glob.glob(os.path.join(SIFT_DIR, "*")), key=os.path.getmtime)
    files = [f for f in files if os.path.isfile(f)]
    if not files:
        log.info("No files in %s.", SIFT_DIR)
        log.info("Download the hotel tax receipts file from "
                 "https://data-secure.comptroller.texas.gov/home/login and drop it there.")
        raise SystemExit(1)
    for f in files:
        log.info("%8.1f MB  %s", os.path.getsize(f) / 1e6, os.path.basename(f))
    log.info("%d file(s) ready — next: python pipeline/sift_parse.py %s", len(files), files[-1])

    if not args.manual:
        log.info("(Scripted SIFT download not implemented yet — manual download is the v1 path.)")


if __name__ == "__main__":
    main()
