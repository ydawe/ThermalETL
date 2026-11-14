from __future__ import annotations

import gzip
import json
from pathlib import Path

import h3
import pytest
import yaml

from conftest import monthly_df
from thermaletl.export import MONTHLY_FIELDS, _dumps, _gzip, write_outputs
from thermaletl.pipeline import run_pipeline
from thermaletl.synthetic import synthetic_detections
from thermaletl.validate import holdout_validation, pick_holdout_year


def test_holdout_validation_hex_beats_regional(warsaw, gdansk):
    rows = []
    for y in (2015, 2016, 2017):
        rows += [(warsaw, y, 3, 10, 40), (gdansk, y, 3, 10, 10)]
    monthly = monthly_df(rows)
    assert pick_holdout_year(monthly, 2012, 2025) == 2017
    v = holdout_validation(monthly, 2017, min_support=5, overlap_start_year=2012)
    assert v["holdout_year"] == 2017
    assert v["n_cells_months"] == 2
    assert v["hex_k"]["mae"] == pytest.approx(0.0)
    # regional k = 2.5 -> preds 25 and 25 vs actual 40 and 10
    assert v["regional_k"]["mae"] == pytest.approx(15.0)
    assert v["regional_k"]["rel_error"] == pytest.approx(30 / 50)
    assert v["mae_improvement_vs_regional"] == pytest.approx(1.0)
    assert v["k_level_counts"] == {"hex": 2}


def test_pick_holdout_needs_two_years(warsaw):
    assert pick_holdout_year(monthly_df([(warsaw, 2015, 3, 10, 40)]), 2012, 2025) is None


def test_synthetic_is_deterministic():
    bbox = (20.8, 52.1, 21.3, 52.4)
    a = synthetic_detections(bbox, [2022, 2023])
    b = synthetic_detections(bbox, [2022, 2023])
    assert a.equals(b)
    counts = dict(a.group_by("sensor").len().iter_rows())
    assert counts["VIIRS"] > counts["MODIS"] > 0
    months = a["acq_date"].str.slice(5, 2).cast(int).value_counts().sort("count", descending=True)
    assert set(months["acq_date"].head(3).to_list()) <= {3, 4, 8}


def test_export_tiles_when_too_big(tmp_path: Path, warsaw, gdansk):
    rows = [
        [c, y, m, (i * 7) % 13, (i * 11) % 17, round(i * 1.37, 2), None, "normal"]
        for i, (c, y, m) in enumerate((c, y, m) for c in (warsaw, gdansk) for y in range(1990, 2025) for m in range(1, 13))
    ]
    full_size = len(_gzip(_dumps({"fields": MONTHLY_FIELDS, "rows": rows})))
    limit_mb = (full_size - 1) / (1024 * 1024)
    files = write_outputs(tmp_path, hexes=[], rows=rows, coef={}, meta={"x": 1}, max_file_mb=limit_mb)
    assert files["tiled"] is True
    index = json.loads((tmp_path / "index.json").read_text())
    assert set(index["tiles"]) == {h3.cell_to_parent(warsaw, 2), h3.cell_to_parent(gdansk, 2)}
    assert not (tmp_path / "monthly.json.gz").exists()


def test_run_pipeline_synthetic_sample(tmp_path: Path):
    cfg = {
        "region": {"name": "poland", "bbox": [13.5, 48.5, 24.5, 55.5]},
        "sample": {"name": "sample", "bbox": [20.8, 52.1, 21.3, 52.4], "years": [2022, 2023]},
    }
    cfg_path = tmp_path / "config.yaml"
    cfg_path.write_text(yaml.safe_dump(cfg))
    out = tmp_path / "out"
    assert run_pipeline(cfg_path, sample=True, out_dir=out, use_synthetic=True) == 0
    for name in ("hexes.json", "monthly.json.gz", "coef.json", "meta.json"):
        assert (out / name).exists()
    meta = json.loads((out / "meta.json").read_text())
    assert meta["synthetic"] is True
    assert meta["validation"]["holdout_year"] == 2023
    assert meta["validation"]["hex_k"]["mae"] is not None
    monthly = json.loads(gzip.decompress((out / "monthly.json.gz").read_bytes()))
    assert len(monthly["rows"]) == meta["counts"]["monthly_rows"]
