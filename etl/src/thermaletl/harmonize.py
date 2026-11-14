"""Build the harmonized series: VIIRS where observed, else MODIS scaled by k."""

from __future__ import annotations

import polars as pl


def harmonize(monthly: pl.DataFrame, coef: pl.DataFrame) -> pl.DataFrame:
    """Add ``k``, ``k_level`` and ``harm_n`` (= viirs_n if viirs_n > 0 else modis_n * k)."""
    joined = monthly.join(coef.select(["h3", "month", "k", "k_level"]), on=["h3", "month"], how="left")
    return joined.with_columns(
        pl.col("k").fill_null(1.0),
        pl.col("k_level").fill_null("default"),
    ).with_columns(
        pl.when(pl.col("viirs_n") > 0)
        .then(pl.col("viirs_n").cast(pl.Float64))
        .otherwise(pl.col("modis_n").cast(pl.Float64) * pl.col("k"))
        .alias("harm_n"),
        pl.when(pl.col("viirs_n") > 0).then(pl.lit("viirs")).otherwise(pl.lit("modis_k")).alias("harm_src"),
    )
