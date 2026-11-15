from __future__ import annotations

import h3
import pytest

from conftest import monthly_df
from thermaletl.coefficients import compute_coefficients, compute_regional_k, safe_ratio
from thermaletl.harmonize import harmonize


def test_safe_ratio_zero_division():
    assert safe_ratio(10, 0) is None
    assert safe_ratio(0, 0) is None
    assert safe_ratio(5, -1) is None
    assert safe_ratio(10, 4) == pytest.approx(2.5)
    assert safe_ratio(0, 4) == 0.0


def test_hex_coefficient_used_when_supported(warsaw, gdansk):
    monthly = monthly_df(
        [
            (warsaw, 2015, 3, 10, 30),
            (warsaw, 2016, 3, 10, 30),
            (gdansk, 2015, 3, 10, 10),
        ]
    )
    coef, _ = compute_coefficients(monthly, min_support=5, overlap_start_year=2012)
    row = coef.filter((coef["h3"] == warsaw) & (coef["month"] == 3)).row(0, named=True)
    assert row["k"] == pytest.approx(3.0)
    assert row["k_level"] == "hex"
    assert row["support"] == 20


def test_fallback_to_parent_then_region(warsaw, gdansk):
    # A sibling cell in the same res-4 parent carries the support.
    parent4 = h3.cell_to_parent(warsaw, 4)
    sibling = next(c for c in h3.cell_to_children(parent4, 5) if c != warsaw)
    monthly = monthly_df(
        [
            (warsaw, 2015, 4, 1, 4),  # below MIN_SUPPORT on its own
            (sibling, 2015, 4, 9, 14),
            (gdansk, 2015, 4, 20, 40),
            (warsaw, 2015, 7, 0, 3),  # no MODIS in July anywhere nearby
            (gdansk, 2015, 7, 10, 25),
        ]
    )
    coef, regional = compute_coefficients(monthly, min_support=5, overlap_start_year=2012)
    apr = coef.filter((coef["h3"] == warsaw) & (coef["month"] == 4)).row(0, named=True)
    assert apr["k_level"] == "res4"
    assert apr["k"] == pytest.approx(18 / 10)

    jul = coef.filter((coef["h3"] == warsaw) & (coef["month"] == 7)).row(0, named=True)
    assert jul["k_level"] == "region"
    assert jul["k"] == pytest.approx(regional["by_month"][7])
    assert jul["k"] == pytest.approx(28 / 10)


def test_fallback_without_any_modis_never_divides_by_zero(warsaw):
    monthly = monthly_df([(warsaw, 2015, 5, 0, 7)])
    coef, regional = compute_coefficients(monthly, min_support=5, overlap_start_year=2012)
    assert regional["overall"] is None
    assert set(coef["k_level"].to_list()) == {"default"}
    assert all(k == 1.0 for k in coef["k"].to_list())


def test_overlap_years_exclude_pre_viirs(warsaw):
    monthly = monthly_df([(warsaw, 2005, 3, 100, 0), (warsaw, 2015, 3, 10, 40)])
    coef, _ = compute_coefficients(monthly, min_support=5, overlap_start_year=2012)
    row = coef.filter(coef["month"] == 3).row(0, named=True)
    assert row["k"] == pytest.approx(4.0)


def test_regional_k(warsaw, gdansk):
    monthly = monthly_df(
        [
            (warsaw, 2015, 3, 10, 20),
            (gdansk, 2015, 3, 30, 100),
            (gdansk, 2015, 8, 0, 5),
        ]
    )
    reg = compute_regional_k(monthly)
    assert reg["by_month"][3] == pytest.approx(120 / 40)
    assert reg["by_month"][8] is None
    assert reg["by_month"][1] is None
    assert reg["support"][3] == 40
    assert reg["overall"] == pytest.approx(125 / 40)


def test_harmonization_viirs_era_uses_viirs_even_when_zero(warsaw):
    monthly = monthly_df(
        [
            (warsaw, 2005, 3, 10, 0),  # pre-VIIRS -> MODIS * k
            (warsaw, 2014, 3, 10, 30),  # overlap for k (=3)
            (warsaw, 2015, 3, 10, 0),  # VIIRS era, zero -> 0 (not MODIS×k)
            (warsaw, 2016, 3, 10, 25),
        ]
    )
    coef, _ = compute_coefficients(monthly, min_support=5, overlap_start_year=2012)
    k = coef.filter((coef["h3"] == warsaw) & (coef["month"] == 3))["k"][0]
    harm = harmonize(monthly, coef)
    by_year = {r["year"]: r for r in harm.to_dicts()}
    assert by_year[2005]["harm_n"] == pytest.approx(10 * k)
    assert by_year[2005]["harm_src"] == "modis_k"
    assert by_year[2015]["harm_n"] == 0.0
    assert by_year[2015]["harm_src"] == "viirs"
    assert by_year[2016]["harm_n"] == 25
    assert by_year[2016]["harm_src"] == "viirs"
