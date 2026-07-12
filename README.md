# Hotel Lead Gen

Finds underperforming and distressed hotels in Dallas County, TX and surfaces them
as acquisition leads at [hotels.longhornhouses.com](https://hotels.longhornhouses.com).

**How:** Texas hotels file quarterly occupancy-tax reports with the Comptroller
(room counts + room receipts per property). From those filings we compute each
hotel's implied RevPAR, benchmark it against its comp set (same city, size band,
brand class), and score every property 0–100 on underperformance, decline,
distress signals, and acquisition-profile fit. Owner names and mailing addresses
come from the Dallas Central Appraisal District roll.

## Layout

- `pipeline/` — Python ingestion + scoring CLI (run locally, writes to Neon)
- `web/` — Next.js dashboard (Vercel, root directory `web`)
- `data/` — gitignored working files (raw downloads, parsed JSON, review CSVs)

See `CLAUDE.md` for architecture, commands, and the quarterly refresh runbook.

## Quick start

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env   # fill in DATABASE_URL etc.
cd web && npm install && npm run dev
```
