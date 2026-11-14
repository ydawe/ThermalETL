"""ETL pipeline orchestrator: fetch -> normalize -> H3 -> k -> harmonize -> stats -> validate -> export."""

from __future__ import annotations

import logging
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Iterable

import polars as pl

from thermaletl import __version__
from thermaletl.aggregate import add_h3, to_h3_monthly, unique_hexes
from thermaletl.calendar_stats import area_calendar_summary, flag_anomalies, per_hex_calendar
from thermaletl.coefficients import compute_coefficients
from thermaletl.config import AppConfig, BBox, load_config
from thermaletl.export import build_coef, build_hexes, monthly_rows, write_outputs
from thermaletl.fetch import MissingMapKeyError, fetch_history, fetch_nrt, get_map_key
from thermaletl.harmonize import harmonize
from thermaletl.normalize import clip_bbox, dedupe_detections, empty_detections
from thermaletl.synthetic import synthetic_detections
from thermaletl.validate import holdout_validation, pick_holdout_year

log = logging.getLogger(__name__)

ATTRIBUTION = "Data: NASA FIRMS (MODIS C6.1, VIIRS S-NPP). Not affiliated with or endorsed by NASA."
SENSORS = ("MODIS", "VIIRS")


def default_out_dir(cfg: AppConfig, region_name: str) -> Path:
    return cfg.repo_root / "web" / "public" / "data" / region_name


def default_raw_dir(cfg: AppConfig, region_name: str) -> Path:
    return cfg.repo_root / "etl" / "data" / "raw" / region_name


def raw_path(raw_dir: Path, sensor: str, year: int) -> Path:
    return raw_dir / f"{sensor.lower()}_{year}.parquet"


def load_raw(raw_dir: Path, years: Iterable[int] | None = None) -> pl.DataFrame:
    """Load raw detection parquet files (``{sensor}_{year}.parquet`` and ``nrt*.parquet``)."""
    wanted = set(years) if years is not None else None
    frames = []
    for p in sorted(Path(raw_dir).glob("*.parquet")):
        stem = p.stem
        if wanted is not None and not stem.startswith("nrt"):
            try:
                if int(stem.rsplit("_", 1)[1]) not in wanted:
                    continue
            except (IndexError, ValueError):
                continue
        frames.append(pl.read_parquet(p))
    if not frames:
        return empty_detections()
    return dedupe_detections(pl.concat(frames, how="vertical_relaxed"))


def full_years(cfg: AppConfig, today: date) -> list[int]:
    return list(range(date.fromisoformat(cfg.fetch.modis_start).year, today.year + 1))


def fetch_to_raw(
    cfg: AppConfig,
    *,
    bbox: BBox,
    raw_dir: Path,
    sensors: Iterable[str],
    years: Iterable[int],
    map_key: str | None,
    include_nrt: bool,
    today: date,
    refresh: bool = False,
) -> None:
    """Fetch per sensor/year into raw parquet files; completed past years are skipped unless ``refresh``."""
    raw_dir.mkdir(parents=True, exist_ok=True)
    ckpt = cfg.repo_root / "etl" / "checkpoints"
    for sensor in sensors:
        for year in years:
            path = raw_path(raw_dir, sensor, year)
            if path.exists() and not refresh and year < today.year:
                log.info("skip %s (exists)", path.name)
                continue
            df = fetch_history(
                [sensor], [year], cfg=cfg, bbox=bbox, map_key=map_key, checkpoint_dir=ckpt, today=today
            )
            df.write_parquet(path)
    if include_nrt:
        if not map_key:
            raise MissingMapKeyError("NRT fetch requires FIRMS_MAP_KEY")
        nrt = fetch_nrt(cfg=cfg, bbox=bbox, map_key=map_key, today=today)
        nrt.write_parquet(raw_dir / f"nrt_{today.isoformat()}.parquet")


def process(
    detections: pl.DataFrame,
    cfg: AppConfig,
    *,
    region_name: str,
    bbox: BBox,
    out_dir: Path,
    data_source: str,
    today: date | None = None,
    calendar_years: list[int] | None = None,
) -> dict[str, Any]:
    """Run all post-fetch stages and write outputs. Returns the meta dict."""
    today = today or date.today()
    det = dedupe_detections(clip_bbox(detections, bbox))
    if det.is_empty():
        raise RuntimeError("no detections to process")

    det = add_h3(det, cfg.h3_resolution)
    monthly = to_h3_monthly(det)
    data_years = sorted(monthly["year"].unique().to_list())
    overlap_end = min(today.year - 1, data_years[-1])

    coef, regional = compute_coefficients(
        monthly,
        resolution=cfg.h3_resolution,
        parent_levels=cfg.parent_fallback_levels,
        min_support=cfg.min_support,
        overlap_start_year=cfg.overlap_start_year,
        overlap_end_year=overlap_end,
    )
    harm = harmonize(monthly, coef)

    if calendar_years is None:
        calendar_years = list(range(data_years[0], data_years[-1] + 1))
    calendar = per_hex_calendar(harm, calendar_years)
    harm = flag_anomalies(harm, calendar)
    summary = area_calendar_summary(harm, years=calendar_years)

    holdout = pick_holdout_year(monthly, cfg.overlap_start_year, overlap_end)
    validation: dict[str, Any] | None = None
    if holdout is not None:
        validation = holdout_validation(
            monthly,
            holdout,
            resolution=cfg.h3_resolution,
            parent_levels=cfg.parent_fallback_levels,
            min_support=cfg.min_support,
            overlap_start_year=cfg.overlap_start_year,
            overlap_end_year=overlap_end,
        )

    hexes = unique_hexes(monthly)
    sensor_counts = dict(det.group_by("sensor").len().iter_rows())
    meta: dict[str, Any] = {
        "region": region_name,
        "bbox": list(bbox),
        "h3_resolution": cfg.h3_resolution,
        "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "etl_version": __version__,
        "data_source": data_source,
        "synthetic": data_source == "synthetic",
        "years": [int(data_years[0]), int(data_years[-1])],
        "calendar_years": [int(y) for y in calendar_years],
        "last_date": det["acq_date"].max(),
        "overlap_years": [cfg.overlap_start_year, int(overlap_end)],
        "min_support": cfg.min_support,
        "filters": {"modis_confidence_min": cfg.modis_confidence_min, "viirs_confidence": cfg.viirs_confidence},
        "sources": {
            "modis": cfg.modis_source,
            "viirs": cfg.viirs_source,
            "modis_nrt": cfg.modis_nrt,
            "viirs_nrt": cfg.viirs_nrt,
        },
        "harmonization": "harm_n = viirs_n if viirs_n > 0 else modis_n * k(h3, month)",
        "k_fallback": ["hex"] + [f"res{p}" for p in cfg.parent_fallback_levels] + ["region"],
        "counts": {
            "detections_modis": int(sensor_counts.get("MODIS", 0)),
            "detections_viirs": int(sensor_counts.get("VIIRS", 0)),
            "hexes": hexes.height,
            "monthly_rows": monthly.height,
        },
        "k_level_counts": dict(coef.group_by("k_level").len().sort("k_level").iter_rows()),
        "regional_k": {
            "overall": None if regional["overall"] is None else round(float(regional["overall"]), 4),
            "by_month": [
                None if (v := regional["by_month"][m]) is None else round(float(v), 4)  # type: ignore[index]
                for m in range(1, 13)
            ],
        },
        "validation": validation,
        "summary": summary,
        "attribution": ATTRIBUTION,
    }

    files = write_outputs(
        out_dir,
        hexes=build_hexes(hexes, harm, calendar),
        rows=monthly_rows(harm),
        coef=build_coef(coef, regional),
        meta=meta,
        max_file_mb=cfg.max_file_mb,
        tile_parent_res=cfg.tile_parent_res,
    )
    log.info("wrote %s: %s", out_dir, files["sizes"])
    return {**meta, "files": files}


def run_pipeline(
    config_path: str | Path,
    sample: bool = False,
    out_dir: str | Path | None = None,
    *,
    use_synthetic: bool = False,
    stage: str = "all",
    years: Iterable[int] | None = None,
    sensors: Iterable[str] | None = None,
    raw_dir: str | Path | None = None,
    include_nrt: bool | None = None,
    refresh: bool = False,
    today: date | None = None,
) -> int:
    """Entry point used by the CLI and GitHub Actions.

    stage: ``all`` (fetch + process), ``fetch`` (raw parquet only), ``process`` (from raw parquet only).
    ``sample``: tiny bbox/years from config; tries live FIRMS then falls back to synthetic data.
    ``use_synthetic``: skip the network entirely.
    """
    if not logging.getLogger().handlers:
        logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    if stage not in ("all", "fetch", "process"):
        raise ValueError(f"unknown stage {stage!r}")

    cfg = load_config(config_path)
    today = today or date.today()
    if sample:
        region_name, bbox = cfg.sample_name, cfg.sample_bbox
        run_years = sorted(years) if years else cfg.sample_years
        calendar_years: list[int] | None = run_years
    else:
        region_name, bbox = cfg.region.name, cfg.region.bbox
        run_years = sorted(years) if years else full_years(cfg, today)
        # medians over complete years only (first MODIS year and current year are partial)
        first_full = date.fromisoformat(cfg.fetch.modis_start).year + 1
        calendar_years = [y for y in run_years if first_full <= y < today.year] or None

    sensors = [s.upper() for s in (sensors or SENSORS)]
    out = Path(out_dir) if out_dir else default_out_dir(cfg, region_name)
    raw = Path(raw_dir) if raw_dir else default_raw_dir(cfg, region_name)
    nrt = (not sample) if include_nrt is None else include_nrt

    if use_synthetic:
        if stage == "fetch":
            log.error("--synthetic has nothing to fetch")
            return 2
        det = synthetic_detections(
            bbox, run_years, modis_confidence_min=cfg.modis_confidence_min, viirs_confidence=cfg.viirs_confidence
        )
        process(det, cfg, region_name=region_name, bbox=bbox, out_dir=out, data_source="synthetic",
                today=today, calendar_years=calendar_years)
        return 0

    if stage in ("all", "fetch"):
        try:
            map_key: str | None = get_map_key()
        except MissingMapKeyError as e:
            if not sample:
                log.error("%s", e)
                return 2
            map_key = None
        try:
            fetch_to_raw(cfg, bbox=bbox, raw_dir=raw, sensors=sensors, years=run_years, map_key=map_key,
                         include_nrt=nrt, today=today, refresh=refresh)
        except Exception as e:  # noqa: BLE001 - sample mode must always produce data
            if not sample:
                raise
            log.warning("live fetch failed for sample (%s); using synthetic data", e)
            return run_pipeline(config_path, sample=True, out_dir=out, use_synthetic=True, years=run_years,
                                today=today)
        if stage == "fetch":
            return 0

    det = load_raw(raw, None if stage == "process" and not years else run_years)
    if det.is_empty():
        if sample:
            log.warning("no live detections for sample; using synthetic data")
            return run_pipeline(config_path, sample=True, out_dir=out, use_synthetic=True, years=run_years,
                                today=today)
        log.error("no raw detections in %s", raw)
        return 1
    process(det, cfg, region_name=region_name, bbox=bbox, out_dir=out, data_source="firms",
            today=today, calendar_years=calendar_years)
    return 0
