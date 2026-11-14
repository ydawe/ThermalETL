from __future__ import annotations

import polars as pl

from thermaletl.normalize import COLUMNS, clip_bbox, dedupe_detections, normalize_firms_csv


def _raw(confidences, **extra):
    n = len(confidences)
    return pl.DataFrame(
        {
            "LATITUDE": ["52.2"] * n,
            "longitude": [str(21.0 + i * 0.01) for i in range(n)],
            "acq_date": ["2022-03-15"] * n,
            "acq_time": ["930"] * n,
            "confidence": confidences,
            "frp": ["12.5"] * n,
            "daynight": ["d"] * n,
            **extra,
        }
    )


def test_normalize_modis_confidence_filter():
    out = normalize_firms_csv(_raw(["10", "29", "30", "85", "bad"]), "MODIS", modis_confidence_min=30)
    assert out.columns == COLUMNS
    assert out["confidence"].to_list() == ["30", "85"]
    assert out["sensor"].unique().to_list() == ["MODIS"]
    assert out["acq_time"][0] == "0930"
    assert out["daynight"][0] == "D"
    assert out["latitude"].dtype == pl.Float64


def test_normalize_viirs_confidence_filter():
    out = normalize_firms_csv(_raw(["l", "n", "H", "nominal"]), "VIIRS", viirs_confidence=["n", "h"])
    assert out["confidence"].to_list() == ["n", "h"]


def test_normalize_empty_and_bad_sensor():
    assert normalize_firms_csv(pl.DataFrame(), "MODIS").columns == COLUMNS
    try:
        normalize_firms_csv(_raw(["50"]), "GOES")
    except ValueError:
        pass
    else:
        raise AssertionError("expected ValueError")


def test_dedupe_detections():
    df = pl.DataFrame(
        {
            "latitude": [52.2, 52.20000001, 52.2, 52.3],
            "longitude": [21.0, 21.0, 21.0, 21.0],
            "acq_date": ["2022-03-15"] * 4,
            "acq_time": ["0930"] * 4,
            "confidence": ["n", "n", "n", "n"],
            "frp": [1.0, 2.0, 3.0, 4.0],
            "daynight": ["D"] * 4,
            "sensor": ["VIIRS", "VIIRS", "MODIS", "VIIRS"],
        }
    )
    out = dedupe_detections(df)
    assert out.height == 3
    assert out["frp"].to_list() == [1.0, 3.0, 4.0]


def test_clip_bbox():
    df = pl.DataFrame({"latitude": [52.0, 60.0, 52.0], "longitude": [21.0, 21.0, 30.0]})
    assert clip_bbox(df, (13.5, 48.5, 24.5, 55.5)).height == 1
