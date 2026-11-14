"""VIIRS/MODIS conversion coefficients k(h3, month) with a spatial fallback chain.

k = sum(viirs_n) / sum(modis_n) over the overlap years, per calendar month.
Fallback when a hex lacks MODIS support: hex -> parent res4 -> parent res3 -> region.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Iterable

import h3
import polars as pl

MIN_SUPPORT = 5
MONTHS = range(1, 13)

COEF_SCHEMA: dict[str, pl.DataType] = {
    "h3": pl.Utf8,
    "month": pl.Int32,
    "k": pl.Float64,
    "k_level": pl.Utf8,
    "support": pl.Int64,
}


def safe_ratio(viirs: float, modis: float) -> float | None:
    """VIIRS/MODIS ratio, or None when MODIS has no detections (never divides by zero)."""
    if modis is None or viirs is None or modis <= 0:
        return None
    return float(viirs) / float(modis)


def overlap_rows(
    monthly: pl.DataFrame, start_year: int, end_year: int | None = None, exclude_years: Iterable[int] = ()
) -> pl.DataFrame:
    """Rows usable for k estimation: inside overlap years and with VIIRS present that year."""
    cond = pl.col("year") >= start_year
    if end_year is not None:
        cond &= pl.col("year") <= end_year
    excl = list(exclude_years)
    if excl:
        cond &= ~pl.col("year").is_in(excl)
    return monthly.filter(cond)


def compute_regional_k(monthly: pl.DataFrame, min_support: int = 1) -> dict[str, object]:
    """Region-wide k per calendar month plus an overall k.

    Returns ``{"by_month": {m: k|None}, "support": {m: modis_n}, "overall": k|None}``.
    """
    by_month: dict[int, float | None] = {m: None for m in MONTHS}
    support: dict[int, int] = {m: 0 for m in MONTHS}
    if not monthly.is_empty():
        agg = monthly.group_by("month").agg(pl.col("modis_n").sum(), pl.col("viirs_n").sum())
        for m, mod, vii in agg.select(["month", "modis_n", "viirs_n"]).iter_rows():
            support[int(m)] = int(mod)
            by_month[int(m)] = safe_ratio(vii, mod) if mod >= min_support else None
    total_m = int(monthly["modis_n"].sum()) if not monthly.is_empty() else 0
    total_v = int(monthly["viirs_n"].sum()) if not monthly.is_empty() else 0
    return {
        "by_month": by_month,
        "support": support,
        "overall": safe_ratio(total_v, total_m),
    }


def _sums_at_level(train: pl.DataFrame, res: int) -> dict[tuple[str, int], tuple[int, int]]:
    out: dict[tuple[str, int], list[int]] = defaultdict(lambda: [0, 0])
    for cell, month, mod, vii in train.select(["h3", "month", "modis_n", "viirs_n"]).iter_rows():
        key = cell if h3.get_resolution(cell) <= res else h3.cell_to_parent(cell, res)
        acc = out[(key, int(month))]
        acc[0] += int(mod)
        acc[1] += int(vii)
    return {k: (v[0], v[1]) for k, v in out.items()}


def compute_coefficients(
    monthly: pl.DataFrame,
    *,
    cells: Iterable[str] | None = None,
    resolution: int = 5,
    parent_levels: Iterable[int] = (4, 3),
    min_support: int = MIN_SUPPORT,
    overlap_start_year: int = 2012,
    overlap_end_year: int | None = None,
    exclude_years: Iterable[int] = (),
) -> tuple[pl.DataFrame, dict[str, object]]:
    """k for every (cell, month) with fallback hex -> parents -> region.

    ``support`` is the MODIS detection count behind the chosen k. A level is used
    only when its MODIS support >= ``min_support``.

    Returns (coef_df, regional) where regional is :func:`compute_regional_k` output.
    """
    train = overlap_rows(monthly, overlap_start_year, overlap_end_year, exclude_years)
    regional = compute_regional_k(train)
    overall = regional["overall"]
    regional_by_month: dict[int, float | None] = regional["by_month"]  # type: ignore[assignment]
    regional_support: dict[int, int] = regional["support"]  # type: ignore[assignment]

    levels: list[tuple[str, int]] = [("hex", resolution)] + [
        (f"res{p}", p) for p in parent_levels if p < resolution
    ]
    sums = {name: _sums_at_level(train, res) for name, res in levels} if not train.is_empty() else {}

    all_cells = sorted(set(cells) if cells is not None else set(monthly["h3"].unique().to_list()))
    rows: list[tuple[str, int, float, str, int]] = []
    for cell in all_cells:
        keys = {
            name: (cell if res >= h3.get_resolution(cell) else h3.cell_to_parent(cell, res))
            for name, res in levels
        }
        for m in MONTHS:
            chosen: tuple[float, str, int] | None = None
            for name, _res in levels:
                mod, vii = sums.get(name, {}).get((keys[name], m), (0, 0))
                k = safe_ratio(vii, mod)
                if k is not None and mod >= min_support:
                    chosen = (k, name, mod)
                    break
            if chosen is None:
                rk = regional_by_month[m]
                if rk is not None:
                    chosen = (rk, "region", regional_support[m])
                elif overall is not None:
                    chosen = (overall, "region_all", int(train["modis_n"].sum()))
                else:
                    chosen = (1.0, "default", 0)
            rows.append((cell, m, chosen[0], chosen[1], chosen[2]))

    coef = pl.DataFrame(rows, schema=COEF_SCHEMA, orient="row")
    return coef, regional
