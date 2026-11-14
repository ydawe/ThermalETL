"""Hold-out year validation: hex-level k vs a regional-ratio baseline."""

from __future__ import annotations

from typing import Iterable

import polars as pl

from thermaletl.coefficients import MIN_SUPPORT, compute_coefficients


def pick_holdout_year(monthly: pl.DataFrame, overlap_start_year: int, overlap_end_year: int | None) -> int | None:
    """Latest overlap year where both sensors have detections, if there are >= 2 such years."""
    df = monthly.filter(pl.col("year") >= overlap_start_year)
    if overlap_end_year is not None:
        df = df.filter(pl.col("year") <= overlap_end_year)
    yearly = df.group_by("year").agg(pl.col("modis_n").sum(), pl.col("viirs_n").sum())
    years = sorted(yearly.filter((pl.col("modis_n") > 0) & (pl.col("viirs_n") > 0))["year"].to_list())
    return years[-1] if len(years) >= 2 else None


def _metrics(actual: list[float], pred: list[float]) -> dict[str, float | None]:
    n = len(actual)
    if n == 0:
        return {"mae": None, "rel_error": None, "bias": None}
    abs_err = sum(abs(p - a) for a, p in zip(actual, pred))
    total = sum(actual)
    return {
        "mae": round(abs_err / n, 4),
        "rel_error": round(abs_err / total, 4) if total > 0 else None,
        "bias": round((sum(pred) - total) / n, 4),
    }


def holdout_validation(
    monthly: pl.DataFrame,
    holdout_year: int,
    *,
    resolution: int = 5,
    parent_levels: Iterable[int] = (4, 3),
    min_support: int = MIN_SUPPORT,
    overlap_start_year: int = 2012,
    overlap_end_year: int | None = None,
) -> dict[str, object]:
    """Train k without ``holdout_year``; predict that year's VIIRS counts from MODIS x k.

    Evaluated on hex-months where either sensor detected something. Compares the
    hex-level fallback model against a single regional k per calendar month.
    """
    parent_levels = list(parent_levels)
    coef, regional = compute_coefficients(
        monthly,
        resolution=resolution,
        parent_levels=parent_levels,
        min_support=min_support,
        overlap_start_year=overlap_start_year,
        overlap_end_year=overlap_end_year,
        exclude_years=[holdout_year],
    )
    # Fair comparison: only hex-months with MODIS present (needed to apply k)
    # and VIIRS present (so there is a ground-truth count to predict).
    test = monthly.filter(
        (pl.col("year") == holdout_year)
        & (pl.col("modis_n") > 0)
        & (pl.col("viirs_n") > 0)
    ).join(coef.select(["h3", "month", "k", "k_level"]), on=["h3", "month"], how="left")

    by_month: dict[int, float | None] = regional["by_month"]  # type: ignore[assignment]
    overall = regional["overall"] or 1.0

    actual, pred_hex, pred_reg = [], [], []
    levels: dict[str, int] = {}
    for mod, vii, month, k, level in test.select(["modis_n", "viirs_n", "month", "k", "k_level"]).iter_rows():
        rk = by_month.get(int(month)) or overall
        actual.append(float(vii))
        pred_hex.append(float(mod) * float(k if k is not None else rk))
        pred_reg.append(float(mod) * float(rk))
        levels[level or "default"] = levels.get(level or "default", 0) + 1

    hex_m = _metrics(actual, pred_hex)
    reg_m = _metrics(actual, pred_reg)
    improvement = None
    if hex_m["mae"] is not None and reg_m["mae"]:
        improvement = round(1 - hex_m["mae"] / reg_m["mae"], 4)  # type: ignore[operator]

    return {
        "holdout_year": int(holdout_year),
        "n_cells_months": len(actual),
        "actual_viirs_total": round(sum(actual), 2),
        "hex_k": {**hex_m, "pred_total": round(sum(pred_hex), 2)},
        "regional_k": {**reg_m, "pred_total": round(sum(pred_reg), 2)},
        "mae_improvement_vs_regional": improvement,
        "k_level_counts": levels,
        "train_regional_k_overall": None if regional["overall"] is None else round(float(regional["overall"]), 4),
    }
