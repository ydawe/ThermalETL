# Data accuracy notes (ThermalETL)

## What is published in the repo today

| Region | Source | Land filter | Notes |
|--------|--------|-------------|-------|
| `world` (default) | **Synthetic** land seeds | Ocean + Baltic/coast boxes | Sparse global demo for map/UI |
| `poland` | **Synthetic** | Poland mainland + Baltic/lagoon boxes | Method demo; not measured fires |
| `sample` | Synthetic | Warsaw bbox | Tiny CI fixture |

Hold-out validation on the synthetic Poland set (in `meta.json`) shows hex-level `k` beating a single regional ratio by ~25% MAE. That validates the **method on controlled data**, not real fire intensity.

## Spot-check against live FIRMS (2026-11-15)

FIRMS area API (`MODIS_SP`, Poland bbox `13.5,48.5,24.5,55.5`, 5 days ending `2023-08-15`) returned **30** MODIS rows (HTTP 200 with a valid `MAP_KEY`).

Implications:

- The API path works and returns land detections in-region.
- Published hex totals in the demo layers are **orders of magnitude larger** than a few days of real MODIS because they are invented seasonal patterns, not FIRMS archives.
- Country CSV mirror URLs used as ETL fallback returned HTTP 404 from this network at check time; prefer the area API + Release cache for production backfill.

## How to get real accuracy

1. Set GitHub secret `FIRMS_MAP_KEY`.
2. Run **ETL Backfill** for `poland` (and later other regions).
3. Redeploy the static site so `web/public/data/{region}/` contains real Parquet→JSON outputs.
4. Re-read `meta.json` → `validation` for hold-out MAE on real overlap years.

## Water

Hex centres over open ocean, Baltic, Szczecin Lagoon, Gdańsk Bay, and similar boxes are dropped in the app (`landmask.ts`) and at world demo generation. Residual shoreline bleed can remain at H3 resolution 5 (~lots of km across).
