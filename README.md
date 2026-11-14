# ThermalETL

**One clear fire history from two satellites.**

ThermalETL turns NASA FIRMS MODIS and VIIRS hot-spot detections into a single, easy-to-read timeline (2000–now) for any place you pick on the map. See fire seasons, busy years, and how the latest month compares to the historical median — in plain language.

> Data: NASA FIRMS (MODIS C6.1, VIIRS S-NPP). Not affiliated with or endorsed by NASA.

## Why it exists

MODIS and VIIRS see fires differently. Simply stitching their counts creates jumps in 2012 when VIIRS starts. ThermalETL learns a local, month-aware conversion coefficient per H3 hexagon (with smart fallbacks) so one continuous series makes sense for ordinary people — farmers, journalists, educators, and citizens.

This is **historical anomaly exploration**, not forecasting. There is no AI chatbot.

## Stack (100% free)

| Piece | Where it runs | Cost |
|-------|---------------|------|
| ETL (Python) | GitHub Actions | Free |
| Frontend (Next.js static) | Vercel Hobby | Free |
| Data files | Committed under `web/public/data/` | Free |

No servers, no paid database, nothing that needs your laptop online.

## Repository layout

```
config.yaml          # region bbox, H3, filters, thresholds
etl/                 # Python fetch → harmonize → export
web/                 # Next.js App Router (static export)
.github/workflows/   # backfill, weekly update, CI
docs/                # submission & demo scripts
PLAN.md              # phased plan + checklist
```

## Prerequisites

1. A free [NASA FIRMS MAP_KEY](https://firms.modaps.eosdis.nasa.gov/api/map_key/)
2. A public GitHub repository
3. A free [Vercel](https://vercel.com) account

## Set the FIRMS secret (required for real data)

1. Open your GitHub repo → **Settings** → **Secrets and variables** → **Actions**
2. **New repository secret**
3. Name: `FIRMS_MAP_KEY`
4. Value: your FIRMS map key (from the FIRMS site)
5. Save

Never put the key in code, in the frontend, or in commits. Locally you may keep it in a gitignored `api` file for experimentation only.

## Run ETL workflows

### Sample data (already in repo)

A tiny Warsaw-area sample is committed so the site builds immediately without waiting for backfill.

### Full backfill (Poland / configured region)

1. **Actions** → **ETL Backfill** → **Run workflow**
2. Optionally choose year range / sensor
3. When finished, the workflow commits updated files under `web/public/data/{region}/`

### Weekly update (NRT)

- Runs on a cron schedule and via **Run workflow**
- Fetches last ~10 days of NRT, merges, recomputes, commits only if data changed

### Local ETL (optional)

```bash
cd etl
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export FIRMS_MAP_KEY=your_key_here   # never commit this
python -m thermaletl run --config ../config.yaml --sample   # tiny sample
# or
python -m thermaletl run --config ../config.yaml            # full region (slow)
pytest
```

## Deploy the frontend on Vercel

1. Push this repo to GitHub (public)
2. Go to [vercel.com/new](https://vercel.com/new)
3. **Import** the repository
4. Set **Root Directory** to `web`
5. Framework preset: Next.js (default). Build: `npm run build`. Output: static export (`out/`)
6. Deploy — no environment variables needed for the frontend
7. After ETL commits new data, Vercel redeploys automatically (or trigger Redeploy)

`vercel.json` sets long cache headers for `/data/*`.

## Challenge coverage

1. Harmonized MODIS + VIIRS series (2000–now)
2. Fire calendar: seasons, active years, vs historical median
3. Area selection: draw on map or lat/lon (+ radius)
4. Date range selection
5. Accessible colour scales (viridis / colour-blind-safe diverging)
6. CSV export for the selected area

## Licence

Apache License 2.0 — see [LICENSE](LICENSE).
