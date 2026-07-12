"""SIFT hotel tax receipts file acquisition.

Two paths:

  Manual (always works, zero setup):
    python pipeline/sift_fetch.py --manual
      Lists what's in data/downloads/sift/. You download the quarter's ZIP by
      hand from https://data-secure.comptroller.texas.gov/home/login → Public
      Files, drop it there, then run sift_parse.py.

  Scripted (convenience — Danny runs it himself; credentials never leave the box):
    python pipeline/sift_fetch.py --quarter 26Q2 --headed --debug
      Playwright logs in with SIFT_USERNAME / SIFT_PASSWORD from the repo-root
      .env, opens Public Files, downloads the HOT<quarter> file into
      data/downloads/sift/, and extracts HOT<quarter>.CSV from the ZIP.

The SIFT DOM isn't documented and may change, so the scripted path is built
defensively: it tries a few common selectors, screenshots each step under
--debug (data/downloads/sift/_debug/), reuses a saved login via --storage-state,
and on any MFA / CAPTCHA / selector failure it prints the manual fallback and
exits non-zero rather than guessing. Run it --headed --debug the first time to
confirm the selectors against the live site.

Credentials are read from the environment and never logged.
"""

from __future__ import annotations

import argparse
import glob
import logging
import os
import re
import zipfile

from common import DOWNLOADS_DIR, REPO_ROOT, ensure_dirs

try:
    from dotenv import load_dotenv
except ImportError:  # common.py already loads it in practice
    load_dotenv = None

log = logging.getLogger("sift_fetch")

SIFT_DIR = os.path.join(DOWNLOADS_DIR, "sift")
DEBUG_DIR = os.path.join(SIFT_DIR, "_debug")
LOGIN_URL = "https://data-secure.comptroller.texas.gov/home/login"
STORAGE_STATE = os.path.join(SIFT_DIR, ".sift_storage_state.json")  # gitignored (data/)
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)

MANUAL_HINT = (
    "Manual fallback: sign in at %s, open Public Files, download the quarter's "
    "ZIP into %s, then run `python pipeline/sift_parse.py <file>`." % (LOGIN_URL, SIFT_DIR)
)


# ---------------------------------------------------------------------------
# manual validation
# ---------------------------------------------------------------------------
def list_drop_folder() -> list[str]:
    files = sorted(
        (f for f in glob.glob(os.path.join(SIFT_DIR, "*")) if os.path.isfile(f)),
        key=os.path.getmtime,
    )
    if not files:
        log.info("No files in %s.", SIFT_DIR)
        log.info(MANUAL_HINT)
        return []
    for f in files:
        log.info("%8.1f MB  %s", os.path.getsize(f) / 1e6, os.path.basename(f))
    return files


# ---------------------------------------------------------------------------
# scripted download (defensive — selectors verified on first live run)
# ---------------------------------------------------------------------------
def normalize_quarter(q: str) -> str:
    """Accept '26Q2', '2026Q2', '2026-Q2' -> 'HOT26Q2' stem."""
    m = re.search(r"(\d{2,4}).*?q?([1-4])", q, re.I)
    if not m:
        raise SystemExit(f"Could not parse --quarter {q!r} (try 26Q2).")
    yy = m.group(1)[-2:]
    return f"HOT{yy}Q{m.group(2)}"


def snap(page, name: str, debug: bool) -> None:
    if not debug:
        return
    os.makedirs(DEBUG_DIR, exist_ok=True)
    path = os.path.join(DEBUG_DIR, f"{name}.png")
    try:
        page.screenshot(path=path, full_page=True)
        log.info("  debug shot: %s", path)
    except Exception:  # never let a screenshot abort the run
        pass


def looks_like_challenge(page) -> str | None:
    """Detect MFA/OTP/CAPTCHA that can't be automated. Returns a reason or None."""
    body = ""
    try:
        body = (page.content() or "").lower()
    except Exception:
        return None
    for needle, label in [
        ("captcha", "CAPTCHA"),
        ("recaptcha", "CAPTCHA"),
        ("one-time", "one-time passcode"),
        ("verification code", "MFA verification code"),
        ("two-factor", "two-factor prompt"),
        ("authenticator", "authenticator prompt"),
    ]:
        if needle in body:
            return label
    return None


def fill_first(page, selectors: list[str], value: str) -> bool:
    for sel in selectors:
        try:
            el = page.locator(sel).first
            if el.count() and el.is_visible():
                el.fill(value)
                return True
        except Exception:
            continue
    return False


def click_first(page, selectors: list[str]) -> bool:
    for sel in selectors:
        try:
            el = page.locator(sel).first
            if el.count() and el.is_visible():
                el.click()
                return True
        except Exception:
            continue
    return False


def scripted_fetch(quarter: str, headed: bool, debug: bool, use_state: bool) -> None:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        raise SystemExit(
            "Playwright not installed. `pip install playwright && playwright install chromium`, "
            "or use the manual path (--manual)."
        )

    if load_dotenv:
        load_dotenv(os.path.join(REPO_ROOT, ".env"))
    user = os.getenv("SIFT_USERNAME")
    pw_secret = os.getenv("SIFT_PASSWORD")
    if not user or not pw_secret:
        raise SystemExit("Set SIFT_USERNAME and SIFT_PASSWORD in .env (never commit them).")

    stem = normalize_quarter(quarter)
    log.info("Fetching %s from SIFT (headed=%s)…", stem, headed)

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=not headed)
        ctx_kwargs = {"user_agent": USER_AGENT, "accept_downloads": True}
        if use_state and os.path.exists(STORAGE_STATE):
            ctx_kwargs["storage_state"] = STORAGE_STATE
            log.info("  reusing saved login (%s)", STORAGE_STATE)
        context = browser.new_context(**ctx_kwargs)
        page = context.new_page()

        try:
            page.goto(LOGIN_URL, wait_until="domcontentloaded", timeout=45000)
            snap(page, "01-landing", debug)

            # If the saved state didn't carry us past login, sign in.
            need_login = bool(page.locator("input[type=password]").count())
            if need_login:
                fill_first(page, [
                    "input[type=email]", "input[name*=user i]", "input[name*=email i]",
                    "input[id*=user i]", "input[id*=email i]",
                ], user)
                fill_first(page, ["input[type=password]"], pw_secret)
                snap(page, "02-filled", debug)
                clicked = click_first(page, [
                    "button[type=submit]", "input[type=submit]",
                    "button:has-text('Log in')", "button:has-text('Login')",
                    "button:has-text('Sign in')",
                ])
                if not clicked:
                    page.keyboard.press("Enter")
                page.wait_for_load_state("networkidle", timeout=45000)
                snap(page, "03-after-login", debug)

                challenge = looks_like_challenge(page)
                if challenge:
                    log.error("SIFT is showing a %s that can't be automated.", challenge)
                    log.error(MANUAL_HINT)
                    raise SystemExit(2)
                if page.locator("input[type=password]").count():
                    log.error("Still on the login page — credentials rejected or the form "
                              "layout changed. Re-run with --headed --debug to inspect.")
                    log.error(MANUAL_HINT)
                    raise SystemExit(2)

                context.storage_state(path=STORAGE_STATE)
                log.info("  saved login for reuse.")

            # Open Public Files.
            if not click_first(page, [
                "a:has-text('Public Files')", "text=Public Files", "[href*=public i]",
            ]):
                log.error("Couldn't find the 'Public Files' entry. Re-run --headed --debug.")
                log.error(MANUAL_HINT)
                raise SystemExit(2)
            page.wait_for_load_state("networkidle", timeout=45000)
            snap(page, "04-public-files", debug)

            # Find and download the quarter's file/folder link.
            link = None
            for sel in (f"a:has-text('{stem}')", f"text={stem}", f"[href*='{stem}' i]"):
                cand = page.locator(sel).first
                if cand.count():
                    link = cand
                    break
            if link is None:
                log.error("No link matching %s under Public Files. Available quarters may "
                          "differ — check --headed, or download by hand.", stem)
                log.error(MANUAL_HINT)
                raise SystemExit(2)

            os.makedirs(SIFT_DIR, exist_ok=True)
            with page.expect_download(timeout=120000) as dl_info:
                link.click()
            download = dl_info.value
            suggested = download.suggested_filename or f"{stem}.zip"
            dest = os.path.join(SIFT_DIR, suggested)
            download.save_as(dest)
            log.info("  downloaded %s (%.1f MB)", suggested, os.path.getsize(dest) / 1e6)
            snap(page, "05-downloaded", debug)

            _extract_if_zip(dest, stem)

        except SystemExit:
            raise
        except Exception as e:  # any selector/timeout failure → graceful manual fallback
            snap(page, "99-error", debug)
            log.error("Scripted download failed: %s", e)
            log.error(MANUAL_HINT)
            raise SystemExit(2)
        finally:
            context.close()
            browser.close()


def _extract_if_zip(path: str, stem: str) -> None:
    if not zipfile.is_zipfile(path):
        log.info("  (not a zip — leaving as-is)")
        return
    with zipfile.ZipFile(path) as z:
        members = z.namelist()
        csv_name = next((m for m in members if m.upper().endswith(f"{stem}.CSV".upper())), None)
        if not csv_name:
            csv_name = next((m for m in members if m.upper().endswith(".CSV")), None)
        if not csv_name:
            log.warning("  zip has no CSV member: %s", members)
            return
        z.extract(csv_name, SIFT_DIR)
        # flatten to data/downloads/sift/HOTyyQn.CSV
        extracted = os.path.join(SIFT_DIR, csv_name)
        final = os.path.join(SIFT_DIR, os.path.basename(csv_name))
        if extracted != final:
            os.replace(extracted, final)
        log.info("  extracted %s", os.path.basename(final))


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    p = argparse.ArgumentParser(description="Validate or fetch SIFT hotel receipt files.")
    p.add_argument("--manual", action="store_true",
                   help="just list the drop folder (no browser)")
    p.add_argument("--quarter", help="quarter to download, e.g. 26Q2 (triggers scripted fetch)")
    p.add_argument("--headed", action="store_true", help="show the browser window")
    p.add_argument("--debug", action="store_true", help="screenshot each step to _debug/")
    p.add_argument("--no-storage-state", action="store_true",
                   help="ignore any saved login and sign in fresh")
    args = p.parse_args()
    ensure_dirs()

    if args.quarter:
        scripted_fetch(args.quarter, args.headed, args.debug, use_state=not args.no_storage_state)

    files = list_drop_folder()
    if files:
        csvs = [f for f in files if f.upper().endswith(".CSV")]
        nxt = csvs[-1] if csvs else files[-1]
        log.info("%d file(s) ready — next: python pipeline/sift_parse.py %s", len(files), nxt)
    elif not args.quarter:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
