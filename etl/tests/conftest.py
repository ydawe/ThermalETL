from __future__ import annotations

import h3
import polars as pl
import pytest

from thermaletl.aggregate import MONTHLY_SCHEMA

# Warsaw area cell at res 5 and a far-away cell in a different res-3 parent
WARSAW = h3.latlng_to_cell(52.23, 21.01, 5)
GDANSK = h3.latlng_to_cell(54.35, 18.65, 5)


def monthly_df(rows: list[tuple[str, int, int, int, int]]) -> pl.DataFrame:
    return pl.DataFrame(rows, schema=MONTHLY_SCHEMA, orient="row")


@pytest.fixture
def warsaw() -> str:
    return WARSAW


@pytest.fixture
def gdansk() -> str:
    return GDANSK
