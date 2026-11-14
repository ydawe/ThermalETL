# ThermalETL — Project Plan

**Challenge:** Harmonization of MODIS and VIIRS Hot Spots (NASA Space Apps 2026)  
**Deadline:** Sunday 15.11.2026 12:59 Europe/Warsaw  
**Product:** Friendly web app showing a single consistent fire-hotspot history (2000–now) for a chosen area — seasons, active years, and “this month vs usual”. Historical anomalies only; no forecasting; no chatbot.

---

## Challenge checklist

| # | Requirement | Status |
|---|-------------|--------|
| 1 | Harmonize FIRMS MODIS + VIIRS into one consistent 2000–now series | [ ] |
| 2 | Calendar of burning activity: seasons, most active years, current vs historical median | [ ] |
| 3 | Area selection: draw on map OR type lat/lon | [ ] |
| 4 | Date range selection | [ ] |
| 5 | Accessible colour scales | [ ] |
| 6 | CSV export | [ ] |

---

## Hard constraints (non-negotiable)

- 100% free stack: GitHub Actions (ETL) + Vercel Hobby (static Next.js). No paid DB / servers / laptop-as-server.
- `FIRMS_MAP_KEY` only as GitHub Actions secret. Never in code, frontend, or commits.
- Public repo, Apache-2.0. No NASA logo.
- Footer: `Data: NASA FIRMS (MODIS C6.1, VIIRS S-NPP). Not affiliated with or endorsed by NASA.`

---

## Phase 0 — Plan + skeleton

**Goal:** Repo layout, config, README, licence so later phases can land cleanly.

### Tasks
- [x] Write this `PLAN.md` (phases, acceptance, risks, fallbacks)
- [x] Monorepo: `/etl`, `/web`, `/.github/workflows`, `/docs`
- [x] Root `config.yaml` (region, bbox Poland+margin, H3 res 5, MIN_SUPPORT, confidence, overlap years)
- [x] `README.md` (what it is, secret setup, workflows, deploy)
- [x] `LICENSE` Apache-2.0, `.gitignore` (exclude `api`, secrets, caches)
- [x] Commit Phase 0

### Acceptance
- Empty package scaffolds exist; config has Poland bbox; README explains FIRMS secret + Vercel; no secrets in tree.

---

## Phase 1 — ETL (Python 3.11+)

**Goal:** Fetch → normalize → H3 aggregate → harmonize → validate → publish JSON under `web/public/data/{region}/`.

### Tasks
- [x] `etl/` package: fetch, normalize, aggregate, coefficients, harmonize, calendar/anomaly, validate, export
- [x] FIRMS area API fetch in day chunks + retry/backoff + checkpoint
- [x] Fallback: FIRMS yearly country CSVs clipped to bbox
- [x] NRT last 10 days (MODIS_NRT + VIIRS_SNPP_NRT), dedupe vs standard
- [x] Parquet schema + confidence filters + H3 res 5
- [x] `h3_monthly`, `k(h3,m)` with fallback chain hex→parent4→parent3→region
- [x] `harm_n` = VIIRS when present else MODIS×k
- [x] Calendar medians / p90 / anomaly flags
- [x] Hold-out year validation vs regional-ratio baseline → `meta.json`
- [x] Outputs: `hexes.json`, `monthly.json.gz`, `coef.json`, `meta.json` (<20 MB or tiled)
- [x] Sample dataset (tiny bbox, 2 years) for immediate frontend
- [x] `pytest` coverage for coef / fallback / zero-div / harm / anomaly / dedupe
- [x] Commit Phase 1

### Acceptance
- `pytest` green; sample data loads; `meta.json` has validation MAE for hex-k vs regional-k; files < 20 MB.

---

## Phase 2 — GitHub Actions

### Tasks
- [x] `etl-backfill.yml` — workflow_dispatch, year/sensor matrix, aggregate, commit data
- [x] `etl-update.yml` — weekly cron + dispatch, NRT merge, commit if changed
- [x] `ci.yml` — pytest + web lint/typecheck/build
- [x] Sample data committed so frontend builds without waiting for backfill
- [x] Commit Phase 2

### Acceptance
- Workflows parse; CI runs tests/build; sample data present under `web/public/data/`.

---

## Phase 3 — Frontend (static Next.js)

### Tasks
- [ ] Next.js App Router, `output: 'export'`, TS, Tailwind, MapLibre, deck.gl H3, h3-js, OpenFreeMap
- [ ] Map + Fire calendar layout (stack on mobile)
- [ ] Area: draw rect/polygon OR lat/lon + radius km → hex selection
- [ ] Date range month pickers
- [ ] Map layers: Harmonized / MODIS / VIIRS; accessible scales + legend
- [ ] Calendar heatmap (year×month, anomaly colours, critical months, tooltips)
- [ ] Plain-language summary cards
- [ ] Hex click: k bar chart + support / k_level
- [ ] CSV export (Blob)
- [ ] `/how-it-works` with diagram + validation + limitations
- [ ] Lazy tile loading; a11y (keyboard, aria, contrast)
- [ ] Commit Phase 3

### Acceptance
- `npm run build` (static export) succeeds; all 6 challenge items covered in UI.

---

## Phase 4 — Deploy + polish

### Tasks
- [ ] `vercel.json` cache headers for `/data/*`; root `web/`
- [ ] Empty / loading / error states
- [ ] `docs/SUBMISSION.md`, `docs/DEMO.md`
- [ ] Tick challenge checklist; final commit
- [ ] Instruct user: FIRMS secret + Vercel connect

### Acceptance
- Submission texts ready; demo script ready; deploy steps clear.

---

## Risks & fallbacks

| Risk | Mitigation |
|------|------------|
| FIRMS API rate / transaction limits | Sleep between calls; checkpoint resume; chunk ≤ max days |
| Area API too slow / fails | Fallback: yearly country CSVs → clip to bbox |
| Action 6h timeout | Matrix by year/sensor; cache raw Parquet as Release `raw-{region}` |
| Output > 20 MB | Split `tiles/{res2_parent}.json.gz` + `index.json` |
| Sparse hex support | Fallback k: hex → res4 → res3 → regional month |
| Zero MODIS in month | Skip k or use parent/region; never divide by zero |
| NRT duplicates | Dedupe on (lat,lon,acq_date,acq_time,sensor) vs standard |
| MAP_KEY missing in CI | Sample-data path; backfill job fails with clear message |

---

## Default config snapshot

- **Region:** `poland`
- **BBox:** ~13.5E–24.5E, 48.5N–55.5N (Poland + margin)
- **H3:** resolution 5; MIN_SUPPORT 5
- **Confidence:** MODIS ≥ 30; VIIRS in `n`,`h`
- **Overlap years for k:** 2012 … last full year

---

## Progress log

| Phase | Status | Notes |
|-------|--------|-------|
| 0 | DONE | Skeleton + PLAN + README + Apache-2.0 |
| 1 | DONE | pytest 31 green; sample hex-k beats regional ~15% |
| 2 | DONE | ci + backfill + weekly update workflows |
| 3 | PENDING |
| 4 | PENDING |
