"""Deterministic synthetic FIRMS-like detections for offline demos, tests and CI.

Seasonal shape mimics central-European agricultural burning: a strong spring
peak (Mar–Apr) and a secondary post-harvest peak (Aug). VIIRS is denser than
MODIS by a per-cluster factor so hex-level k differs from the regional k.
"""

from __future__ import annotations

import calendar
import zlib
from typing import Iterable

import numpy as np
import polars as pl

from thermaletl.config import BBox
from thermaletl.normalize import dedupe_detections, empty_detections, normalize_firms_csv

SEASON = np.array([0.05, 0.15, 1.0, 0.9, 0.3, 0.1, 0.25, 0.6, 0.2, 0.1, 0.05, 0.03])
VIIRS_START_YEAR = 2012


def _seed(bbox: BBox, years: list[int], seed: int | None) -> int:
    if seed is not None:
        return seed
    return zlib.crc32(repr((tuple(round(v, 4) for v in bbox), tuple(years))).encode())


def _raw_frame(
    rng: np.random.Generator,
    lats: np.ndarray,
    lons: np.ndarray,
    year: int,
    month: int,
    sensor: str,
) -> pl.DataFrame:
    n = len(lats)
    days = rng.integers(1, calendar.monthrange(year, month)[1] + 1, size=n)
    hours = rng.integers(0, 24, size=n)
    mins = rng.integers(0, 60, size=n)
    if sensor == "MODIS":
        conf = rng.integers(0, 101, size=n).astype(str)
    else:
        conf = rng.choice(np.array(["l", "n", "h"]), size=n, p=[0.15, 0.6, 0.25])
    return pl.DataFrame(
        {
            "latitude": np.round(lats, 5),
            "longitude": np.round(lons, 5),
            "acq_date": [f"{year:04d}-{month:02d}-{d:02d}" for d in days],
            "acq_time": [f"{h:02d}{m:02d}" for h, m in zip(hours, mins)],
            "confidence": conf,
            "frp": np.round(rng.lognormal(2.0, 0.8, size=n), 2),
            "daynight": np.where(hours.astype(int) >= 12, "D", "N"),
        }
    )


def synthetic_detections(
    bbox: BBox,
    years: Iterable[int],
    *,
    seed: int | None = None,
    modis_confidence_min: int = 30,
    viirs_confidence: Iterable[str] = ("n", "h"),
    base_rate: float = 10.0,
) -> pl.DataFrame:
    """Normalized detections (standard schema) for ``bbox`` over ``years``; same inputs -> same output."""
    years = sorted(set(int(y) for y in years))
    if not years:
        return empty_detections()
    west, south, east, north = bbox
    rng = np.random.default_rng(_seed(bbox, years, seed))

    area = (east - west) * (north - south)
    n_clusters = max(12, int(area * 6))
    c_lat = rng.uniform(south, north, n_clusters)
    c_lon = rng.uniform(west, east, n_clusters)
    weight = rng.lognormal(0.0, 0.6, n_clusters)
    # Wide per-cluster VIIRS/MODIS ratios so hex-level k beats a single regional ratio
    viirs_k = rng.uniform(0.8, 8.0, n_clusters)
    sigma = min(0.03, (north - south) / 10)

    raw: dict[str, list[pl.DataFrame]] = {"MODIS": [], "VIIRS": []}
    for year in years:
        year_factor = rng.uniform(0.6, 1.5)
        for month in range(1, 13):
            # Stable per-cluster ratios (light noise only) so hex-level k can beat regional
            lam = base_rate * weight * SEASON[month - 1] * year_factor
            counts = {
                "MODIS": np.maximum(
                    0, np.round(lam * rng.uniform(0.9, 1.1, n_clusters)).astype(int)
                )
            }
            if year >= VIIRS_START_YEAR:
                counts["VIIRS"] = np.maximum(
                    0,
                    np.round(lam * viirs_k * rng.uniform(0.9, 1.1, n_clusters)).astype(
                        int
                    ),
                )
            for sensor, cnt in counts.items():
                total = int(cnt.sum())
                if total == 0:
                    continue
                idx = np.repeat(np.arange(n_clusters), cnt)
                lats = np.clip(c_lat[idx] + rng.normal(0, sigma, total), south, north)
                lons = np.clip(c_lon[idx] + rng.normal(0, sigma, total), west, east)
                raw[sensor].append(_raw_frame(rng, lats, lons, year, month, sensor))

    frames = [
        normalize_firms_csv(
            pl.concat(parts, how="vertical"),
            sensor,
            modis_confidence_min=modis_confidence_min,
            viirs_confidence=viirs_confidence,
        )
        for sensor, parts in raw.items()
        if parts
    ]
    if not frames:
        return empty_detections()
    return dedupe_detections(pl.concat(frames, how="vertical"))
