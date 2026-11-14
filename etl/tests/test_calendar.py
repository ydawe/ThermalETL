from __future__ import annotations

import polars as pl
import pytest

from thermaletl.calendar_stats import (
    anomaly_ratio,
    area_calendar_summary,
    flag_anomalies,
    per_hex_calendar,
    season_label,
)


def _harm(rows):
    return pl.DataFrame(
        rows,
        schema={"h3": pl.Utf8, "year": pl.Int32, "month": pl.Int32, "harm_n": pl.Float64},
        orient="row",
    )


def test_anomaly_ratio():
    assert anomaly_ratio(10, 5) == pytest.approx(2.0)
    assert anomaly_ratio(0, 5) == 0.0
    assert anomaly_ratio(10, 0) is None


def test_per_hex_calendar_counts_missing_years_as_zero():
    harm = _harm([("a", 2020, 3, 10.0), ("a", 2021, 3, 20.0)])
    cal = per_hex_calendar(harm, years=[2020, 2021, 2022])
    mar = cal.filter(pl.col("month") == 3).row(0, named=True)
    assert mar["median"] == pytest.approx(10.0)
    assert mar["p90"] == pytest.approx(18.0)
    assert mar["n_years"] == 3
    assert cal.height == 12


def test_flag_anomalies():
    harm = _harm([("a", y, 3, v) for y, v in [(2018, 10.0), (2019, 10.0), (2020, 12.0), (2021, 50.0)]])
    cal = per_hex_calendar(harm, years=[2018, 2019, 2020, 2021])
    flagged = flag_anomalies(harm, cal).sort("year")
    assert flagged["anomaly"].to_list()[-1] == "high"
    assert flagged["anomaly"].to_list()[0] == "below"
    assert flagged["anomaly_ratio"].to_list()[-1] == pytest.approx(50 / 11)


def test_area_calendar_summary():
    rows = []
    for y, scale in [(2019, 1.0), (2020, 3.0), (2021, 2.0)]:
        rows += [
            ("a", y, 3, 20 * scale),
            ("b", y, 4, 15 * scale),
            ("a", y, 8, 10 * scale),
            ("b", y, 11, 1 * scale),
        ]
    s = area_calendar_summary(_harm(rows), years=[2019, 2020, 2021])
    assert s["critical_months"] == [3, 4, 8]
    assert [y["year"] for y in s["most_active_years"]] == [2020, 2021, 2019]
    assert s["matrix"]["2020"][2] == pytest.approx(60.0)
    assert s["monthly_median"][2] == pytest.approx(40.0)
    assert s["season_label"].startswith("Spring (Mar–Apr)")
    assert "summer" in s["season_label"]
    assert s["latest"]["year"] == 2021 and s["latest"]["month"] == 11


def test_area_calendar_summary_subset_and_empty():
    harm = _harm([("a", 2020, 3, 5.0), ("b", 2020, 6, 7.0)])
    s = area_calendar_summary(harm, years=[2020], cells=["b"])
    assert s["critical_months"] == [6]
    empty = area_calendar_summary(harm, years=[2020], cells=["zzz"])
    assert empty["critical_months"] == []
    assert empty["season_label"] == "No clear fire season"
    assert empty["latest"] is None


def test_season_label_no_activity():
    assert season_label([0.0] * 12, []) == "No clear fire season"
