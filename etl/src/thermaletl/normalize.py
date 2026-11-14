"""Normalize FIRMS CSV rows to a common schema and apply confidence filters."""

from __future__ import annotations

from typing import Iterable

import polars as pl

COLUMNS = [
    "latitude",
    "longitude",
    "acq_date",
    "acq_time",
    "confidence",
    "frp",
    "daynight",
    "sensor",
]

SCHEMA: dict[str, pl.DataType] = {
    "latitude": pl.Float64,
    "longitude": pl.Float64,
    "acq_date": pl.Utf8,
    "acq_time": pl.Utf8,
    "confidence": pl.Utf8,
    "frp": pl.Float64,
    "daynight": pl.Utf8,
    "sensor": pl.Utf8,
}

DEDUPE_KEYS = ["latitude", "longitude", "acq_date", "acq_time", "sensor"]


def empty_detections() -> pl.DataFrame:
    return pl.DataFrame(schema=SCHEMA)


def _str_col(df: pl.DataFrame, name: str) -> pl.Expr:
    if name in df.columns:
        return pl.col(name).cast(pl.Utf8).str.strip_chars()
    return pl.lit("", dtype=pl.Utf8)


def normalize_firms_csv(
    df: pl.DataFrame,
    sensor: str,
    *,
    modis_confidence_min: int = 30,
    viirs_confidence: Iterable[str] = ("n", "h"),
) -> pl.DataFrame:
    """Map FIRMS columns to the standard schema and filter by confidence.

    MODIS confidence is numeric 0..100; VIIRS confidence is categorical l/n/h.
    """
    if sensor not in ("MODIS", "VIIRS"):
        raise ValueError(f"Unknown sensor: {sensor}")
    if df.is_empty():
        return empty_detections()

    df = df.rename({c: c.strip().lower() for c in df.columns})
    missing = {"latitude", "longitude", "acq_date"} - set(df.columns)
    if missing:
        raise ValueError(f"FIRMS CSV missing columns: {sorted(missing)}")

    frp = pl.col("frp").cast(pl.Float64, strict=False) if "frp" in df.columns else pl.lit(None, dtype=pl.Float64)
    out = df.select(
        pl.col("latitude").cast(pl.Float64, strict=False).alias("latitude"),
        pl.col("longitude").cast(pl.Float64, strict=False).alias("longitude"),
        _str_col(df, "acq_date").str.slice(0, 10).alias("acq_date"),
        # FIRMS acq_time is HHMM; CSV readers may drop leading zeros
        _str_col(df, "acq_time").str.zfill(4).alias("acq_time"),
        _str_col(df, "confidence").str.to_lowercase().alias("confidence"),
        frp.alias("frp"),
        _str_col(df, "daynight").str.to_uppercase().alias("daynight"),
        pl.lit(sensor, dtype=pl.Utf8).alias("sensor"),
    ).filter(
        pl.col("latitude").is_not_null()
        & pl.col("longitude").is_not_null()
        & pl.col("acq_date").is_not_null()
        & (pl.col("acq_date").str.len_chars() == 10)
    )

    if sensor == "MODIS":
        conf_num = pl.col("confidence").str.replace_all(r"[^0-9.\-]", "").cast(pl.Float64, strict=False)
        out = out.filter(conf_num.is_not_null() & (conf_num >= modis_confidence_min))
    else:
        allowed = [c.lower() for c in viirs_confidence]
        out = out.filter(pl.col("confidence").is_in(allowed))

    return out.select(COLUMNS).cast(SCHEMA)  # type: ignore[arg-type]


def dedupe_detections(df: pl.DataFrame) -> pl.DataFrame:
    """Drop duplicate detections (e.g. NRT overlapping standard product).

    Coordinates are rounded to 4 decimals (~10 m) so float noise between
    products doesn't defeat the match.
    """
    if df.is_empty():
        return df
    keyed = df.with_columns(
        pl.col("latitude").round(4).alias("_lat_k"),
        pl.col("longitude").round(4).alias("_lon_k"),
    )
    keys = ["_lat_k", "_lon_k", "acq_date", "acq_time", "sensor"]
    return keyed.unique(subset=keys, keep="first", maintain_order=True).drop(["_lat_k", "_lon_k"])


def clip_bbox(df: pl.DataFrame, bbox: tuple[float, float, float, float]) -> pl.DataFrame:
    west, south, east, north = bbox
    if df.is_empty():
        return df
    return df.filter(
        pl.col("longitude").is_between(west, east) & pl.col("latitude").is_between(south, north)
    )
