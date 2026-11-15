#!/usr/bin/env python3
"""Build web/public/data/world from FIRMS yearly country CSV archives (no MAP_KEY)."""

from __future__ import annotations

import json
import logging
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import polars as pl
import requests

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "etl" / "src"))

from thermaletl.config import load_config  # noqa: E402
from thermaletl.fetch import parse_firms_csv  # noqa: E402
from thermaletl.normalize import dedupe_detections, normalize_firms_csv  # noqa: E402
from thermaletl.pipeline import process  # noqa: E402

log = logging.getLogger("build_world")

# Curated fire-active countries (FIRMS archive English names). Skip mega archives
# (Brazil/Russia/Congo) so the static layer stays buildable on a laptop.
COUNTRIES = [
    "United_States",
    "Australia",
    "Canada",
    "Indonesia",
    "Portugal",
    "Spain",
    "Greece",
    "Mexico",
    "Argentina",
    "Chile",
    "Poland",
    "Ukraine",
    "Turkey",
    "Ethiopia",
    "Madagascar",
    "Romania",
    "Italy",
    "France",
    "Germany",
]

# Short pre-VIIRS window + VIIRS-era years for k and the calendar.
MODIS_YEARS = list(range(2010, 2024))
VIIRS_YEARS = list(range(2012, 2024))
BASE = "https://firms.modaps.eosdis.nasa.gov/data/country"


def _url(sensor: str, year: int, country: str) -> str:
    folder = prefix = "modis" if sensor == "MODIS" else "viirs-snpp"
    return f"{BASE}/{folder}/{year}/{prefix}_{year}_{country}.csv"


def _fetch_one(sensor: str, year: int, country: str, dest: Path, tries: int = 4) -> Path | None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 80:
        return dest
    url = _url(sensor, year, country)
    for attempt in range(1, tries + 1):
        try:
            with requests.get(url, timeout=600, stream=True) as r:
                if r.status_code == 404:
                    return None
                if r.status_code != 200:
                    log.warning("HTTP %s %s (attempt %d)", r.status_code, url, attempt)
                    time.sleep(2 * attempt)
                    continue
                tmp = dest.with_suffix(".part")
                size = 0
                with tmp.open("wb") as f:
                    for chunk in r.iter_content(chunk_size=1 << 20):
                        if chunk:
                            f.write(chunk)
                            size += len(chunk)
                # Tiny / non-CSV bodies are failures
                head = tmp.read_bytes()[:120].decode("utf-8", "replace").lower()
                if "latitude" not in head:
                    tmp.unlink(missing_ok=True)
                    log.warning("not csv %s: %s", url, head[:80])
                    return None
                tmp.replace(dest)
                log.info("ok %s %s %s (%.1f MB)", sensor, year, country, size / 1e6)
                return dest
        except requests.RequestException as e:
            log.warning("network %s (attempt %d): %s", url, attempt, e)
            time.sleep(3 * attempt)
    return None


def download_all(cache: Path, workers: int = 3) -> list[tuple[str, Path]]:
    jobs: list[tuple[str, int, str, Path]] = []
    for country in COUNTRIES:
        for year in MODIS_YEARS:
            jobs.append(("MODIS", year, country, cache / "MODIS" / f"{country}_{year}.csv"))
        for year in VIIRS_YEARS:
            jobs.append(("VIIRS", year, country, cache / "VIIRS" / f"{country}_{year}.csv"))
    out: list[tuple[str, Path]] = []
    done = 0
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futs = {pool.submit(_fetch_one, s, y, c, p): (s, y, c) for s, y, c, p in jobs}
        for fut in as_completed(futs):
            done += 1
            path = fut.result()
            if path is not None:
                out.append((futs[fut][0], path))
            if done % 25 == 0 or done == len(jobs):
                log.info("download progress %d/%d (%d ok)", done, len(jobs), len(out))
    return out


def load_detections(files: list[tuple[str, Path]], cfg) -> pl.DataFrame:
    frames: list[pl.DataFrame] = []
    for i, (sensor, path) in enumerate(files, 1):
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
            raw = parse_firms_csv(text)
            if raw.is_empty():
                continue
            frames.append(
                normalize_firms_csv(
                    raw,
                    sensor,
                    modis_confidence_min=cfg.modis_confidence_min,
                    viirs_confidence=cfg.viirs_confidence,
                )
            )
        except Exception as e:  # noqa: BLE001
            log.warning("skip %s: %s", path, e)
        if i % 50 == 0:
            log.info("parsed %d/%d files", i, len(files))
    if not frames:
        raise SystemExit("no detections loaded")
    return dedupe_detections(pl.concat(frames, how="vertical"))


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    cfg = load_config(ROOT / "config.world.yaml")
    cache = ROOT / "raw" / "world_countries"
    files = download_all(cache)
    log.info("using %d country-year files", len(files))
    det = load_detections(files, cfg)
    log.info("detections: %s", det.group_by("sensor").len())
    out = ROOT / "web" / "public" / "data" / "world"
    process(
        det,
        cfg,
        region_name="world",
        bbox=cfg.region.bbox,
        out_dir=out,
        data_source="firms",
        calendar_years=list(range(2011, 2024)),
    )
    meta_path = out / "meta.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    meta["countries"] = COUNTRIES
    meta["accuracy_note"] = (
        "Real FIRMS country archives for a curated set of fire-active countries (not every nation). "
        "H3 resolution 4. Ocean hexes are filtered in the app."
    )
    meta["harmonization"] = "harm_n = viirs_n if year >= 2012 else modis_n * k(h3, month)"
    meta_path.write_text(json.dumps(meta, indent=2, ensure_ascii=False, allow_nan=False), encoding="utf-8")
    log.info("wrote %s counts=%s validation holdout=%s", out, meta.get("counts"), (meta.get("validation") or {}).get("holdout_year"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
