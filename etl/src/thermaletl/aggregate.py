"""Aggregate detections to H3 cells and calendar months."""

from __future__ import annotations

import h3
import polars as pl

MONTHLY_SCHEMA: dict[str, pl.DataType] = {
    "h3": pl.Utf8,
    "year": pl.Int32,
    "month": pl.Int32,
    "modis_n": pl.Int64,
    "viirs_n": pl.Int64,
}


def empty_monthly() -> pl.DataFrame:
    return pl.DataFrame(schema=MONTHLY_SCHEMA)


def add_h3(df: pl.DataFrame, resolution: int = 5) -> pl.DataFrame:
    """Add an ``h3`` column (string cell id) using h3-py v4 ``latlng_to_cell``."""
    if df.is_empty():
        return df.with_columns(pl.lit(None, dtype=pl.Utf8).alias("h3"))
    cells = [
        h3.latlng_to_cell(lat, lon, resolution)
        for lat, lon in zip(df["latitude"].to_list(), df["longitude"].to_list())
    ]
    return df.with_columns(pl.Series("h3", cells, dtype=pl.Utf8))


def to_h3_monthly(df: pl.DataFrame) -> pl.DataFrame:
    """Count detections per (h3, year, month) split into modis_n / viirs_n."""
    if df.is_empty():
        return empty_monthly()
    date = pl.col("acq_date").str.to_date("%Y-%m-%d", strict=False)
    return (
        df.with_columns(date.dt.year().cast(pl.Int32).alias("year"), date.dt.month().cast(pl.Int32).alias("month"))
        .filter(pl.col("year").is_not_null())
        .group_by(["h3", "year", "month"])
        .agg(
            (pl.col("sensor") == "MODIS").sum().cast(pl.Int64).alias("modis_n"),
            (pl.col("sensor") == "VIIRS").sum().cast(pl.Int64).alias("viirs_n"),
        )
        .sort(["h3", "year", "month"])
        .select(list(MONTHLY_SCHEMA))
    )


def unique_hexes(monthly: pl.DataFrame) -> pl.DataFrame:
    """Distinct cells with centroid lat/lon (rounded to 5 decimals)."""
    cells = sorted(monthly["h3"].unique().to_list()) if not monthly.is_empty() else []
    lats, lons = [], []
    for c in cells:
        lat, lon = h3.cell_to_latlng(c)
        lats.append(round(lat, 5))
        lons.append(round(lon, 5))
    return pl.DataFrame(
        {"h3": cells, "lat": lats, "lon": lons},
        schema={"h3": pl.Utf8, "lat": pl.Float64, "lon": pl.Float64},
    )
