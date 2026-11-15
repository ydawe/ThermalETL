# Data accuracy notes (ThermalETL)

## What is published in the repo today

| Region | Source | Land filter | Notes |
|--------|--------|-------------|-------|
| `world` (default) | **Real FIRMS** country CSVs (US + cached peers) + Poland raw | Ocean / major water boxes in app | H3 res 4; not every nation |
| `poland` | **Real FIRMS** area API backfill | Poland mainland + Baltic/lagoon boxes | MODIS 2000– + VIIRS 2012– |
| `sample` | Synthetic | Warsaw bbox | Tiny CI fixture |

## Harmonization rule

- **year ≥ 2012:** `harm_n = viirs_n` (even when 0 — do not fill with MODIS×k)
- **year < 2012:** `harm_n = modis_n * k(h3, month)`

## Limitation: early-2000s amplification

Harmonized Poland totals for **2002–2005** often land around **26–40k** hotspots/year versus **~5–9k** later. Part of that may be genuine (more agricultural burning, especially eastward), but a conversion factor near **k ≈ 9.4** strongly amplifies MODIS-only years. Treat pre-VIIRS levels as method-dependent, not a precise burned-area trend.

## Spot-check against live FIRMS (2026-11-15)

FIRMS area API (`MODIS_SP`, Poland bbox `13.5,48.5,24.5,55.5`, 5 days ending `2023-08-15`) returned **30** MODIS rows (HTTP 200 with a valid `MAP_KEY`).

## How to refresh

1. Set GitHub secret `FIRMS_MAP_KEY` (area API / GHA backfill).
2. Poland: **ETL Backfill** → then `thermaletl run --stage process`.
3. World: `etl/scripts/build_world_from_countries.py` (country CSV archives; no key required).
4. Redeploy Vercel; meta uses `generated_at` cache-busting.
