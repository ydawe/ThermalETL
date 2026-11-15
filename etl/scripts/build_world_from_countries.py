#!/usr/bin/env python3
"""Build web/public/data/world from FIRMS yearly country CSV archives (no MAP_KEY).

Downloads a broad set of countries (2012–2023), normalizes detections, and runs
the process stage with config.world.yaml (H3 res 5). Resume-safe via on-disk cache.
"""

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
from thermaletl.pipeline import load_raw, process  # noqa: E402

log = logging.getLogger("build_world")

# Broad FIRMS country set (underscored English archive names).
COUNTRIES = [
    "United_States", "Canada", "Mexico", "Brazil", "Argentina", "Chile", "Bolivia",
    "Colombia", "Peru", "Paraguay", "Uruguay", "Venezuela", "Ecuador",
    "Australia", "Indonesia", "Papua_New_Guinea", "Philippines", "Malaysia",
    "Thailand", "Vietnam", "Myanmar", "Cambodia", "Laos", "India", "China",
    "Mongolia", "Kazakhstan", "Russia", "Japan", "South_Korea",
    "Poland", "Ukraine", "Romania", "Hungary", "Germany", "France", "Spain",
    "Portugal", "Italy", "Greece", "Turkey", "United_Kingdom", "Ireland",
    "Sweden", "Finland", "Norway", "Belarus", "Bulgaria", "Serbia",
    "South_Africa", "Angola", "Zambia", "Mozambique", "Madagascar", "Botswana",
    "Namibia", "Zimbabwe", "Democratic_Republic_of_the_Congo", "Congo",
    "Tanzania", "Kenya", "Ethiopia", "Uganda", "Sudan", "South_Sudan",
    "Nigeria", "Ghana", "Ivory_Coast", "Mali", "Niger", "Chad", "Cameroon",
    "Algeria", "Morocco", "Tunisia", "Libya", "Egypt", "Iran", "Iraq",
    "Saudi_Arabia", "Yemen", "Pakistan", "Afghanistan", "Nepal", "Bangladesh",
]

MODIS_YEARS = list(range(2012, 2024))
VIIRS_YEARS = list(range(2012, 2024))
BASE = "https://firms.modaps.eosdis.nasa.gov/data/country"


def _url(sensor: str, year: int, country: str) -> str:
    folder = prefix = "modis" if sensor == "MODIS" else "viirs-snpp"
    return f"{BASE}/{folder}/{year}/{prefix}_{year}_{country}.csv"


def _fetch_one(sensor: str, year: int, country: str, dest: Path, tries: int = 3) -> Path | None:
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
                    time.sleep(2 * attempt)
                    continue
                tmp = dest.with_suffix(".part")
                with tmp.open("wb") as f:
                    for chunk in r.iter_content(chunk_size=1 << 20):
                        if chunk:
                            f.write(chunk)
                head = tmp.read_bytes()[:120].decode("utf-8", "replace").lower()
                if "latitude" not in head:
                    tmp.unlink(missing_ok=True)
                    return None
                tmp.replace(dest)
                return dest
        except requests.RequestException as e:
            log.warning("network %s (attempt %d): %s", url, attempt, e)
            time.sleep(3 * attempt)
    return None


def download_all(cache: Path, workers: int = 4) -> list[tuple[str, Path]]:
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
            if done % 40 == 0 or done == len(jobs):
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
        if i % 80 == 0:
            log.info("parsed %d/%d files", i, len(files))
    poland = ROOT / "raw"
    if poland.exists():
        try:
            pl_raw = load_raw(poland)
            if not pl_raw.is_empty():
                frames.append(pl_raw)
                log.info("merged poland raw release: %d rows", pl_raw.height)
        except Exception as e:  # noqa: BLE001
            log.warning("poland raw skip: %s", e)
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
    ys = sorted(
        det.with_columns(pl.col("acq_date").str.slice(0, 4).cast(pl.Int32).alias("y"))["y"].unique().to_list()
    )
    cal = [y for y in ys if 2012 <= y <= 2023] or ys
    process(
        det,
        cfg,
        region_name="world",
        bbox=cfg.region.bbox,
        out_dir=out,
        data_source="firms",
        calendar_years=cal,
    )
    meta_path = out / "meta.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    meta["countries"] = sorted({p.stem.rsplit("_", 1)[0] for _, p in files})
    meta["accuracy_note"] = (
        "Real FIRMS country archives for a broad multi-country set (not every nation / year). "
        f"H3 resolution {cfg.h3_resolution}. Use the Country picker to crop. Ocean hexes filtered in the app."
    )
    meta["harmonization"] = "harm_n = viirs_n if year >= 2012 else modis_n * k(h3, month)"
    meta_path.write_text(json.dumps(meta, indent=2, ensure_ascii=False, allow_nan=False), encoding="utf-8")
    log.info("wrote %s counts=%s", out, meta.get("counts"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
