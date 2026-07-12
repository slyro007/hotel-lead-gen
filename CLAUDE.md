# CLAUDE.md — Hotel Lead Gen

Hotel acquisition lead gen for Dallas County, TX. Ingests Texas Comptroller hotel
occupancy tax filings, benchmarks every hotel's implied RevPAR against its comp
set, scores 0–100, and serves a Clerk-gated dashboard at
hotels.longhornhouses.com. Sibling repo (conventions source): LHH-Lead-Gen
(`/Users/pithya/Claude Projects/Lead Gen`, residential pre-foreclosures).

Read PRODUCT.md for product rules and the scoring model; DESIGN.md for the
visual system.

## Architecture

Two parts, one database (Neon Postgres):

- `pipeline/` — Python CLI stages, run locally. Each stage: argparse +
  `--dry-run`, idempotent `ON CONFLICT` upserts, logs a row to `ingestion_runs`.
  Schema is authored in Drizzle (`web/db/schema.ts`); Python writes raw SQL via
  psycopg against the same tables.
- `web/` — Next.js 16 App Router dashboard. **Vercel root directory = `web`.**
  Auth = Clerk (users mirrored to `users` table via svix webhook; `approved`
  gate). Middleware lives in `web/proxy.ts` (Next 16 convention).

Data dirs (gitignored): `data/downloads/sift/` (drop SIFT files here),
`data/downloads/dcad/`, `data/parsed/`, `data/review/` (ambiguity CSVs for
manual adjudication — never guessed into the DB).

## Pipeline stages (run order)

```bash
.venv/bin/python pipeline/sift_parse.py --all                        # 1. HOT*Q*.CSV → data/parsed/*.json
.venv/bin/python pipeline/sync_filings.py                            # 2. upsert hotel_filings (Dallas County only)
.venv/bin/python pipeline/build_hotels.py                            # 3. canonicalize hotels, backfill hotel_id
.venv/bin/python pipeline/geocode.py                                 # 4. Census batch geocoder → lat/lng
.venv/bin/python pipeline/classify_brands.py                         # 5. Claude Batches → brand/independent
.venv/bin/python pipeline/dcad_fetch.py && .venv/bin/python pipeline/dcad_match.py  # 6. DCAD owners/values
.venv/bin/python pipeline/socrata_market.py                          # 7. city/county HOT market stats
.venv/bin/python pipeline/score.py                                   # 8. benchmarks + lead scores
```

Every stage supports `--dry-run`. `pipeline/common.py` has the shared helpers
(db conn, run bookkeeping, `normalize_address`, `location_key`,
`days_in_quarter`).

## Key invariants

- **Dedupe key** is `location_key` = `zip5|normalized street`. Filings unique on
  `(taxpayer_number, location_key, year, quarter)`.
- **County filter before insert** — the SIFT file is statewide; only Dallas
  County rows enter Postgres (Neon free tier, 0.5 GB). Raw files stay on disk.
- **RevPAR guards**: rooms <10 or receipts = 0 excluded from benchmarks; use the
  most recent nonzero room count per hotel.
- **"Stopped filing"** is measured against the dataset's own latest quarter, not
  the calendar (filings lag ~1 quarter).
- Score formulas live only in `pipeline/score.py`; UI labels/thresholds in
  `web/lib/score-labels.ts`. Full inputs stored in `hotel_scores.score_breakdown`.

## Env (.env at repo root, gitignored — never commit; web app uses web/.env.local)

`DATABASE_URL` (Neon pooled), `ANTHROPIC_API_KEY`, `SIFT_USERNAME`/`SIFT_PASSWORD`
(optional, scripted download only), `SOCRATA_APP_TOKEN` (optional).
Web: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`,
`CLERK_WEBHOOK_SIGNING_SECRET`, `DATABASE_URL`.

## Quarterly refresh runbook

1. Log into SIFT (data-secure.comptroller.texas.gov) → Public Files → download
   the new quarter's `HOTyyQn` ZIP; put `HOTyyQn.CSV` in `data/downloads/sift/`.
   Quarterly files ONLY — they already roll up monthly filers (verified;
   filer_type 50 = monthly, 60 = quarterly). Layout: headerless positional CSV,
   23 cols, county code 057 = Dallas (doc in the ZIP).
2. Run stages 1–3, then 8 (`score.py` recomputes benchmarks + scores).
   Stages 4–5 only touch rows that are new (null lat/lng, null classified_at).
3. Refresh DCAD (stage 6) once a year after the appraisal roll certifies (~July);
   stage 7 whenever data.texas.gov posts new local HOT data.
4. Check `/admin/ingestion` — freshness banner should show the new quarter.
5. Sanity: Dallas hotel count 700–1,200; Hilton Anatole among top receipts.

## Web conventions (mirror sibling)

Next 16 — read `web/AGENTS.md` first; middleware file is `web/proxy.ts`.
Drizzle schema `web/db/schema.ts`, migrations via drizzle-kit, query layer
`web/db/queries/*` with allow-listed sort columns. RSC pages driven by URL
searchParams. No component library; Tailwind v4 + DESIGN.md tokens. Charts:
recharts. Maps: leaflet (dynamic import, ssr:false).
