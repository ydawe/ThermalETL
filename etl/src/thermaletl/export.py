"""Write web-facing JSON outputs under web/public/data/{region}/."""

from __future__ import annotations

import gzip
import json
import shutil
from collections import defaultdict
from pathlib import Path
from typing import Any

import h3
import polars as pl

MONTHLY_FIELDS = ["h3", "year", "month", "modis_n", "viirs_n", "harm_n", "anomaly_ratio", "anomaly"]


def _dumps(obj: Any) -> bytes:
    return json.dumps(obj, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")


def _gzip(data: bytes) -> bytes:
    # mtime=0 keeps output byte-identical across runs (clean git diffs)
    return gzip.compress(data, compresslevel=9, mtime=0)


def _round(v: float | None, nd: int) -> float | None:
    return None if v is None else round(float(v), nd)


def monthly_rows(harm: pl.DataFrame) -> list[list[Any]]:
    cols = harm.select(MONTHLY_FIELDS).sort(["h3", "year", "month"])
    return [
        [c, int(y), int(m), int(mo), int(vi), _round(hn, 2), _round(ar, 3), an]
        for c, y, m, mo, vi, hn, ar, an in cols.iter_rows()
    ]


def build_hexes(hexes: pl.DataFrame, harm: pl.DataFrame, calendar: pl.DataFrame) -> list[dict[str, Any]]:
    totals = {
        c: (int(mo), int(vi), float(hn))
        for c, mo, vi, hn in harm.group_by("h3")
        .agg(pl.col("modis_n").sum(), pl.col("viirs_n").sum(), pl.col("harm_n").sum())
        .iter_rows()
    }
    cal: dict[str, dict[str, list[float]]] = defaultdict(lambda: {"median": [0.0] * 12, "p90": [0.0] * 12})
    for c, m, med, p90 in calendar.select(["h3", "month", "median", "p90"]).iter_rows():
        cal[c]["median"][int(m) - 1] = round(float(med), 2)
        cal[c]["p90"][int(m) - 1] = round(float(p90), 2)
    out = []
    for c, lat, lon in hexes.select(["h3", "lat", "lon"]).iter_rows():
        mo, vi, hn = totals.get(c, (0, 0, 0.0))
        out.append(
            {
                "h3": c,
                "lat": lat,
                "lon": lon,
                "modis_total": mo,
                "viirs_total": vi,
                "harm_total": round(hn, 2),
                "median": cal[c]["median"],
                "p90": cal[c]["p90"],
            }
        )
    return out


def build_coef(coef: pl.DataFrame, regional: dict[str, Any]) -> dict[str, Any]:
    cells: dict[str, dict[str, list[Any]]] = {}
    for c, m, k, level, support in coef.sort(["h3", "month"]).iter_rows():
        entry = cells.setdefault(c, {"k": [None] * 12, "level": [None] * 12, "support": [0] * 12})
        entry["k"][int(m) - 1] = round(float(k), 4)
        entry["level"][int(m) - 1] = level
        entry["support"][int(m) - 1] = int(support)
    by_month = regional.get("by_month", {})
    return {
        "regional": {
            "by_month": [_round(by_month.get(m), 4) for m in range(1, 13)],
            "support": [int(regional.get("support", {}).get(m, 0)) for m in range(1, 13)],
            "overall": _round(regional.get("overall"), 4),
        },
        "cells": cells,
    }


def write_outputs(
    out_dir: str | Path,
    *,
    hexes: list[dict[str, Any]],
    rows: list[list[Any]],
    coef: dict[str, Any],
    meta: dict[str, Any],
    max_file_mb: float = 20.0,
    tile_parent_res: int = 2,
) -> dict[str, Any]:
    """Write hexes.json, monthly.json.gz (or tiles/ + index.json), coef.json, meta.json.

    Returns a dict describing the written files (also stored in ``meta["files"]``).
    """
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    limit = int(max_file_mb * 1024 * 1024)

    (out / "hexes.json").write_bytes(_dumps({"hexes": hexes}))
    (out / "coef.json").write_bytes(_dumps(coef))

    monthly_gz = _gzip(_dumps({"fields": MONTHLY_FIELDS, "rows": rows}))
    tiles_dir = out / "tiles"
    if tiles_dir.exists():
        shutil.rmtree(tiles_dir)
    index_path = out / "index.json"

    files: dict[str, Any] = {"hexes": "hexes.json", "coef": "coef.json", "meta": "meta.json"}
    if len(monthly_gz) <= limit:
        (out / "monthly.json.gz").write_bytes(monthly_gz)
        index_path.unlink(missing_ok=True)
        files.update({"monthly": "monthly.json.gz", "tiled": False})
    else:
        (out / "monthly.json.gz").unlink(missing_ok=True)
        tiles_dir.mkdir()
        groups: dict[str, list[list[Any]]] = defaultdict(list)
        for r in rows:
            groups[h3.cell_to_parent(r[0], tile_parent_res)].append(r)
        index: dict[str, Any] = {"fields": MONTHLY_FIELDS, "parent_res": tile_parent_res, "tiles": {}}
        for parent, trows in sorted(groups.items()):
            data = _gzip(_dumps({"fields": MONTHLY_FIELDS, "rows": trows}))
            if len(data) > limit:
                raise RuntimeError(f"tile {parent} is {len(data)} bytes > {limit}; use a finer tile_parent_res")
            (tiles_dir / f"{parent}.json.gz").write_bytes(data)
            index["tiles"][parent] = {
                "file": f"tiles/{parent}.json.gz",
                "rows": len(trows),
                "cells": len({r[0] for r in trows}),
            }
        index_path.write_bytes(_dumps(index))
        files.update({"monthly": None, "tiled": True, "index": "index.json", "n_tiles": len(groups)})

    meta = {**meta, "files": files}
    (out / "meta.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False, allow_nan=False), encoding="utf-8")

    sizes = {p.name: p.stat().st_size for p in out.iterdir() if p.is_file()}
    big = {k: v for k, v in sizes.items() if v > limit}
    if big:
        raise RuntimeError(f"output files exceed {max_file_mb} MB: {big}")
    return {**files, "sizes": sizes}
