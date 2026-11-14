"""Load and validate ThermalETL YAML config."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

BBox = tuple[float, float, float, float]  # west, south, east, north


@dataclass
class RegionConfig:
    name: str
    bbox: BBox
    country_code: str = "POL"


@dataclass
class FetchConfig:
    # FIRMS area API accepts a day range of 1..5
    max_days_per_request: int = 5
    retry_max: int = 5
    retry_backoff_seconds: float = 5.0
    sleep_between_requests_seconds: float = 1.0
    nrt_days: int = 10
    modis_start: str = "2000-11-01"
    viirs_start: str = "2012-01-01"


@dataclass
class AppConfig:
    region: RegionConfig
    h3_resolution: int = 5
    parent_fallback_levels: list[int] = field(default_factory=lambda: [4, 3])
    min_support: int = 5
    overlap_start_year: int = 2012
    modis_source: str = "MODIS_SP"
    viirs_source: str = "VIIRS_SNPP_SP"
    modis_nrt: str = "MODIS_NRT"
    viirs_nrt: str = "VIIRS_SNPP_NRT"
    modis_confidence_min: int = 30
    viirs_confidence: list[str] = field(default_factory=lambda: ["n", "h"])
    fetch: FetchConfig = field(default_factory=FetchConfig)
    max_file_mb: float = 20.0
    tile_parent_res: int = 2
    sample_name: str = "sample"
    sample_bbox: BBox = (20.8, 52.1, 21.3, 52.4)
    sample_years: list[int] = field(default_factory=lambda: [2022, 2023])
    config_path: Path | None = None
    raw: dict[str, Any] = field(default_factory=dict)

    @property
    def repo_root(self) -> Path:
        """Directory holding config.yaml (the monorepo root by convention)."""
        if self.config_path is None:
            return Path.cwd()
        return self.config_path.resolve().parent


def _bbox(values: Any, what: str) -> BBox:
    bbox = tuple(float(x) for x in values)
    if len(bbox) != 4:
        raise ValueError(f"{what} must have 4 values [west, south, east, north], got {values!r}")
    west, south, east, north = bbox
    if not (west < east and south < north):
        raise ValueError(f"{what} is degenerate: {values!r}")
    if not (-180 <= west <= 180 and -180 <= east <= 180 and -90 <= south <= 90 and -90 <= north <= 90):
        raise ValueError(f"{what} out of range: {values!r}")
    return bbox  # type: ignore[return-value]


def config_from_dict(raw: dict[str, Any], config_path: Path | None = None) -> AppConfig:
    if not raw or "region" not in raw:
        raise ValueError("config must contain a 'region' section")

    region = raw["region"]
    h3 = raw.get("h3") or {}
    harm = raw.get("harmonization") or {}
    filters = raw.get("filters") or {}
    fetch_raw = raw.get("fetch") or {}
    output = raw.get("output") or {}
    sample = raw.get("sample") or {}

    fetch = FetchConfig(
        max_days_per_request=int(fetch_raw.get("max_days_per_request", 5)),
        retry_max=int(fetch_raw.get("retry_max", 5)),
        retry_backoff_seconds=float(fetch_raw.get("retry_backoff_seconds", 5)),
        sleep_between_requests_seconds=float(fetch_raw.get("sleep_between_requests_seconds", 1.0)),
        nrt_days=int(fetch_raw.get("nrt_days", 10)),
        modis_start=str(fetch_raw.get("modis_start", "2000-11-01")),
        viirs_start=str(fetch_raw.get("viirs_start", "2012-01-01")),
    )
    if not 1 <= fetch.max_days_per_request <= 5:
        raise ValueError("fetch.max_days_per_request must be within 1..5 (FIRMS area API limit)")

    return AppConfig(
        region=RegionConfig(
            name=str(region["name"]),
            bbox=_bbox(region["bbox"], "region.bbox"),
            country_code=str(region.get("country_code", "POL")),
        ),
        h3_resolution=int(h3.get("resolution", 5)),
        parent_fallback_levels=[int(x) for x in h3.get("parent_fallback_levels", [4, 3])],
        min_support=int(harm.get("min_support", 5)),
        overlap_start_year=int(harm.get("overlap_start_year", 2012)),
        modis_source=str(harm.get("modis_source", "MODIS_SP")),
        viirs_source=str(harm.get("viirs_source", "VIIRS_SNPP_SP")),
        modis_nrt=str(harm.get("modis_nrt", "MODIS_NRT")),
        viirs_nrt=str(harm.get("viirs_nrt", "VIIRS_SNPP_NRT")),
        modis_confidence_min=int(filters.get("modis_confidence_min", 30)),
        viirs_confidence=[str(x).lower() for x in filters.get("viirs_confidence", ["n", "h"])],
        fetch=fetch,
        max_file_mb=float(output.get("max_file_mb", 20)),
        tile_parent_res=int(output.get("tile_parent_res", 2)),
        sample_name=str(sample.get("name", "sample")),
        sample_bbox=_bbox(sample.get("bbox", [20.8, 52.1, 21.3, 52.4]), "sample.bbox"),
        sample_years=[int(y) for y in sample.get("years", [2022, 2023])],
        config_path=config_path,
        raw=raw,
    )


def load_config(path: str | Path) -> AppConfig:
    path = Path(path)
    with open(path, encoding="utf-8") as f:
        raw = yaml.safe_load(f) or {}
    return config_from_dict(raw, config_path=path)
