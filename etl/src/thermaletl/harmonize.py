"""Build the harmonized series: VIIRS in the VIIRS era, else MODIS scaled by k."""

from __future__ import annotations

import polars as pl

# VIIRS S-NPP standard product begins 2012-01; from then on we never back-fill
# quiet VIIRS months with MODIS×k (that inflated post-2012 totals).
VIIRS_ERA_START_YEAR = 2012


def harmonize(monthly: pl.DataFrame, coef: pl.DataFrame) -> pl.DataFrame:
    """Add ``k``, ``k_level`` and ``harm_n``.

    - year >= 2012: ``harm_n = viirs_n`` (including 0)
    - year < 2012: ``harm_n = modis_n * k(h3, month)``
    """
    joined = monthly.join(coef.select(["h3", "month", "k", "k_level"]), on=["h3", "month"], how="left")
    return joined.with_columns(
        pl.col("k").fill_null(1.0),
        pl.col("k_level").fill_null("default"),
    ).with_columns(
        pl.when(pl.col("year") >= VIIRS_ERA_START_YEAR)
        .then(pl.col("viirs_n").cast(pl.Float64))
        .otherwise(pl.col("modis_n").cast(pl.Float64) * pl.col("k"))
        .alias("harm_n"),
        pl.when(pl.col("year") >= VIIRS_ERA_START_YEAR)
        .then(pl.lit("viirs"))
        .otherwise(pl.lit("modis_k"))
        .alias("harm_src"),
    )
