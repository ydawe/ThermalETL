"""Fire calendar statistics: per-hex month medians/p90, area summaries, anomaly flags."""

from __future__ import annotations

from typing import Iterable

import numpy as np
import polars as pl

MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
SEASONS = {
    "winter": (12, 1, 2),
    "spring": (3, 4, 5),
    "summer": (6, 7, 8),
    "autumn": (9, 10, 11),
}


def _densify(harm: pl.DataFrame, years: Iterable[int], cells: Iterable[str]) -> pl.DataFrame:
    """Every (h3, year, month) combination; months without detections count as 0."""
    grid = (
        pl.DataFrame({"h3": sorted(set(cells))}, schema={"h3": pl.Utf8})
        .join(pl.DataFrame({"year": sorted(set(years))}, schema={"year": pl.Int32}), how="cross")
        .join(pl.DataFrame({"month": list(range(1, 13))}, schema={"month": pl.Int32}), how="cross")
    )
    vals = harm.select(["h3", "year", "month", "harm_n"]).with_columns(
        pl.col("year").cast(pl.Int32), pl.col("month").cast(pl.Int32)
    )
    return grid.join(vals, on=["h3", "year", "month"], how="left").with_columns(pl.col("harm_n").fill_null(0.0))


def per_hex_calendar(harm: pl.DataFrame, years: Iterable[int] | None = None) -> pl.DataFrame:
    """Median, p90 and mean of harm_n per (h3, calendar month) across ``years`` (zeros included)."""
    years = list(years) if years is not None else sorted(harm["year"].unique().to_list())
    dense = _densify(harm, years, harm["h3"].unique().to_list())
    return (
        dense.group_by(["h3", "month"])
        .agg(
            pl.col("harm_n").median().alias("median"),
            pl.col("harm_n").quantile(0.9, interpolation="linear").alias("p90"),
            pl.col("harm_n").mean().alias("mean"),
            pl.len().cast(pl.Int32).alias("n_years"),
        )
        .sort(["h3", "month"])
    )


def anomaly_ratio(value: float, median: float) -> float | None:
    """value / median; None when the historical median is zero (ratio undefined)."""
    if median is None or value is None or median <= 0:
        return None
    return float(value) / float(median)


def anomaly_flag(value: float, median: float, p90: float) -> str:
    if value > 0 and value > p90:
        return "high"
    if value > median:
        return "above"
    if value < median:
        return "below"
    return "normal"


def flag_anomalies(harm: pl.DataFrame, calendar: pl.DataFrame) -> pl.DataFrame:
    """Join per-hex calendar and add ``anomaly_ratio`` and ``anomaly`` flag per row."""
    out = harm.join(calendar.select(["h3", "month", "median", "p90"]), on=["h3", "month"], how="left").with_columns(
        pl.col("median").fill_null(0.0), pl.col("p90").fill_null(0.0)
    )
    return out.with_columns(
        pl.when(pl.col("median") > 0).then(pl.col("harm_n") / pl.col("median")).otherwise(None).alias("anomaly_ratio"),
        pl.when((pl.col("harm_n") > 0) & (pl.col("harm_n") > pl.col("p90")))
        .then(pl.lit("high"))
        .when(pl.col("harm_n") > pl.col("median"))
        .then(pl.lit("above"))
        .when(pl.col("harm_n") < pl.col("median"))
        .then(pl.lit("below"))
        .otherwise(pl.lit("normal"))
        .alias("anomaly"),
    )


def _month_span(months: list[int]) -> str:
    months = sorted(months)
    if not months:
        return ""
    if len(months) > 1 and months == list(range(months[0], months[-1] + 1)):
        return f"{MONTH_NAMES[months[0] - 1]}–{MONTH_NAMES[months[-1] - 1]}"
    return ", ".join(MONTH_NAMES[m - 1] for m in months)


def season_label(monthly_mean: list[float], critical_months: list[int]) -> str:
    """Plain-language season, e.g. 'Spring (Mar–Apr) with a secondary summer peak (Aug)'."""
    total = float(sum(monthly_mean))
    if total <= 0 or not critical_months:
        return "No clear fire season"
    shares = {s: sum(monthly_mean[m - 1] for m in ms) / total for s, ms in SEASONS.items()}
    ranked = sorted(shares, key=lambda s: shares[s], reverse=True)
    primary = ranked[0]
    prim_months = [m for m in critical_months if m in SEASONS[primary]] or list(SEASONS[primary])
    label = f"{primary.capitalize()} ({_month_span(prim_months)})"
    secondary = ranked[1]
    sec_months = [m for m in critical_months if m in SEASONS[secondary]]
    if shares[secondary] >= 0.2 and sec_months:
        label += f" with a secondary {secondary} peak ({_month_span(sec_months)})"
    return label


def area_calendar_summary(
    harm: pl.DataFrame,
    *,
    years: Iterable[int] | None = None,
    cells: Iterable[str] | None = None,
    top_n: int = 3,
) -> dict[str, object]:
    """Summarize an area (all cells, or ``cells``) into a year x month fire calendar."""
    df = harm.filter(pl.col("h3").is_in(list(cells))) if cells is not None else harm
    years = sorted(set(years)) if years is not None else sorted(df["year"].unique().to_list())
    grid = np.zeros((len(years), 12), dtype=float)
    if not df.is_empty() and years:
        idx = {y: i for i, y in enumerate(years)}
        totals = df.group_by(["year", "month"]).agg(pl.col("harm_n").sum())
        for y, m, v in totals.iter_rows():
            if y in idx:
                grid[idx[y], int(m) - 1] = float(v)

    if years:
        med = np.median(grid, axis=0)
        p90 = np.percentile(grid, 90, axis=0)
        mean = grid.mean(axis=0)
    else:
        med = p90 = mean = np.zeros(12)

    order = sorted(range(12), key=lambda i: (med[i], mean[i]), reverse=True)
    critical = [i + 1 for i in order if mean[i] > 0][:top_n]
    annual = grid.sum(axis=1)
    active_years = [
        {"year": int(years[i]), "total": round(float(annual[i]), 2)}
        for i in sorted(range(len(years)), key=lambda i: annual[i], reverse=True)[:top_n]
        if annual[i] > 0
    ]

    latest = None
    nonzero = np.argwhere(grid > 0)
    if nonzero.size:
        yi, mi = max((int(a), int(b)) for a, b in nonzero)
        value = float(grid[yi, mi])
        latest = {
            "year": int(years[yi]),
            "month": mi + 1,
            "value": round(value, 2),
            "median": round(float(med[mi]), 2),
            "p90": round(float(p90[mi]), 2),
            "anomaly_ratio": None if (r := anomaly_ratio(value, float(med[mi]))) is None else round(r, 3),
            "anomaly": anomaly_flag(value, float(med[mi]), float(p90[mi])),
        }

    return {
        "years": [int(y) for y in years],
        "matrix": {str(y): [round(float(v), 2) for v in grid[i]] for i, y in enumerate(years)},
        "monthly_median": [round(float(v), 2) for v in med],
        "monthly_p90": [round(float(v), 2) for v in p90],
        "monthly_mean": [round(float(v), 2) for v in mean],
        "critical_months": critical,
        "critical_month_names": [MONTH_NAMES[m - 1] for m in critical],
        "most_active_years": active_years,
        "season_label": season_label([float(v) for v in mean], critical),
        "latest": latest,
    }
