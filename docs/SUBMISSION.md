# NASA Space Apps 2026 — Submission draft (ThermalETL)

Use these English texts in the Space Apps project submission form. Edit freely to match your team name and demo URL.

---

## Project Name

**ThermalETL**

---

## High-Level Summary (≤ 1 paragraph)

ThermalETL turns NASA FIRMS MODIS and VIIRS hot-spot detections into one clear fire history from 2000 to now. Pick any place on the map, see the fire season, the busiest years, and how the latest month compares with the historical median — in plain language, without forecasting or a chatbot.

---

## Detailed Description

### What it does

Ordinary people struggle to compare “how many fires” across two decades because MODIS and VIIRS do not count the same way. When VIIRS starts in 2012, raw totals jump. ThermalETL builds a single harmonized series so you can explore seasons and anomalies without pretending the sensors are identical. Pre-2012 months use MODIS×k; from 2012 onward the series follows VIIRS even in quiet months (no MODIS back-fill). Early-2000s scaled totals can still look inflated when regional k is large (~9× in Poland)—partly real field-burning change, partly method amplification.

You can:

1. Select an area by drawing on the map or typing latitude / longitude (+ radius).
2. Choose a date range (month resolution).
3. See hexagons coloured by harmonized, MODIS-only, or VIIRS-only counts.
4. Read a fire calendar (years × months) coloured by anomaly versus the month-of-year median.
5. Get plain-language cards: main season, most active years, last month vs usual.
6. Export a CSV for the selected area.

### How it works

1. **Fetch** FIRMS standard products (MODIS C6.1, VIIRS S-NPP) plus recent NRT, in GitHub Actions only — free, no always-on server.
2. **Filter** by confidence (MODIS ≥ 30; VIIRS nominal/high).
3. **Aggregate** detections into H3 hexagons (resolution 5) by year and month.
4. **Estimate** a local coefficient `k(h3, month) = Σ VIIRS / Σ MODIS` over overlap years (from 2012). If a hex has too few MODIS samples, fall back to parent hexes (res 4, then 3), then a regional per-month ratio.
5. **Harmonize**: when VIIRS exists for that hex-month, use VIIRS; otherwise use `MODIS × k`.
6. **Validate** by holding out one overlap year and predicting VIIRS from MODIS×k, compared with a single regional ratio — the usual shortcut competitors might use.
7. **Publish** static JSON/gzip under `web/public/data/` for a Next.js static site on Vercel.

### Benefits

- One continuous story from 2000 to today instead of a broken stitch at 2012.
- Local coefficients respect that landscapes differ — agricultural burning vs forests vs cities.
- Built for citizens, journalists, educators, and local planners: plain language, accessible colours, CSV export.
- 100% free stack (GitHub Actions + Vercel Hobby); nothing that needs a laptop left on.

### Tools / languages

- **ETL:** Python 3.11+, Polars, h3-py, PyArrow, Requests, Pytest  
- **Automation:** GitHub Actions  
- **Frontend:** Next.js (static export), TypeScript, Tailwind CSS, MapLibre GL, deck.gl, h3-js  
- **Hosting:** Vercel Hobby  
- **Data:** NASA FIRMS (public)

### Creativity

Instead of one conversion factor for a whole country, ThermalETL learns **month-aware coefficients per hexagon**, with a transparent fallback chain and a published hold-out comparison against the regional baseline. The UI explains *where* each coefficient came from (this hex / nearby / wider / region) so the method stays understandable.

---

## NASA Data used

- **NASA FIRMS MODIS Collection 6.1** (standard + NRT) — active fire / thermal anomalies  
  https://firms.modaps.eosdis.nasa.gov/  
- **NASA FIRMS VIIRS S-NPP 375 m** (standard + NRT)  
  https://firms.modaps.eosdis.nasa.gov/  
- Area API / country downloads as documented by FIRMS  
  https://firms.modaps.eosdis.nasa.gov/api/

Disclaimer shown in the app:  
*Data: NASA FIRMS (MODIS C6.1, VIIRS S-NPP). Not affiliated with or endorsed by NASA.*

---

## References

1. NASA FIRMS — Fire Information for Resource Management System. https://firms.modaps.eosdis.nasa.gov/
2. Giglio, L., et al. — MODIS Collection 6 Active Fire Product User’s Guide.
3. Schroeder, W., et al. — VIIRS active fire products documentation (S-NPP / NOAA-20).
4. Uber H3 — Hexagonal hierarchical geospatial indexing. https://h3geo.org/
5. OpenFreeMap — free map tiles. https://openfreemap.org/

---

## Use of AI

This project was built with help from the AI coding assistant **Cursor** (agentic coding for scaffolding, ETL, tests, UI, and docs). The **challenge framing, product principle (plain-language historical anomalies, no chatbot/forecasting), and the harmonization methodology** (per-hex month-aware `k` with parent/regional fallback and hold-out validation vs a regional ratio) are mine / our team’s. AI accelerated implementation under a tight Space Apps deadline; all scientific claims should be read as exploratory tooling, not operational fire intelligence.
