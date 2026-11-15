from __future__ import annotations

from datetime import date
from pathlib import Path

import pytest
import requests

from thermaletl.config import config_from_dict
from thermaletl.fetch import (
    FirmsRequestError,
    MissingMapKeyError,
    date_chunks,
    fetch_area,
    get_map_key,
    request_with_retry,
    sensor_label,
)

CSV = (
    "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,"
    "bright_ti5,frp,daynight\n"
    "52.2,21.0,330,0.4,0.4,2022-03-01,1130,N,VIIRS,n,2.0NRT,290,5.1,D\n"
    "52.3,21.1,330,0.4,0.4,2022-03-02,0130,N,VIIRS,l,2.0NRT,290,1.0,N\n"
)


class FakeResp:
    def __init__(self, status: int, text: str = ""):
        self.status_code = status
        self.text = text


class FakeSession:
    def __init__(self, responses):
        self.responses = list(responses)
        self.urls: list[str] = []

    def get(self, url, timeout=None):
        self.urls.append(url)
        r = self.responses.pop(0)
        if isinstance(r, Exception):
            raise r
        return r


def _cfg():
    return config_from_dict(
        {
            "region": {"name": "t", "bbox": [20.0, 52.0, 22.0, 53.0]},
            "fetch": {"max_days_per_request": 5, "sleep_between_requests_seconds": 0, "retry_backoff_seconds": 0},
        }
    )


def test_date_chunks_max_5_days():
    chunks = date_chunks(date(2022, 1, 1), date(2022, 1, 12), 5)
    assert chunks == [(date(2022, 1, 1), 5), (date(2022, 1, 6), 5), (date(2022, 1, 11), 2)]
    assert sum(d for _, d in date_chunks(date(2020, 1, 1), date(2020, 12, 31), 5)) == 366
    assert all(d <= 5 for _, d in date_chunks(date(2020, 1, 1), date(2020, 12, 31), 5))
    assert date_chunks(date(2022, 1, 2), date(2022, 1, 1)) == []
    assert date_chunks(date(2022, 1, 1), date(2022, 1, 1)) == [(date(2022, 1, 1), 1)]


def test_get_map_key():
    assert get_map_key({"FIRMS_MAP_KEY": " abc "}) == "abc"
    with pytest.raises(MissingMapKeyError):
        get_map_key({})


def test_sensor_label():
    assert sensor_label("MODIS_SP") == "MODIS"
    assert sensor_label("VIIRS_SNPP_NRT") == "VIIRS"


def test_retry_on_429_and_5xx_then_success():
    sleeps: list[float] = []
    s = FakeSession([FakeResp(429), FakeResp(503), requests.ConnectionError("x"), FakeResp(200, CSV)])
    text = request_with_retry("http://x", session=s, retry_max=5, backoff_seconds=1, sleep=sleeps.append)
    assert text == CSV
    assert sleeps == [1, 2, 4]


def test_no_retry_on_400_and_key_redacted():
    sleeps: list[float] = []
    s = FakeSession([FakeResp(400, "Invalid area")])
    with pytest.raises(FirmsRequestError) as ei:
        request_with_retry("http://x/SECRET/", session=s, map_key="SECRET", sleep=sleeps.append)
    assert ei.value.status == 400
    assert "SECRET" not in str(ei.value)
    assert sleeps == []
    assert len(s.urls) == 1


def test_retry_on_transaction_limit_400():
    sleeps: list[float] = []
    s = FakeSession([FakeResp(400, "Exceeding allowed transaction limit."), FakeResp(200, CSV)])
    text = request_with_retry("http://x", session=s, retry_max=5, backoff_seconds=1, sleep=sleeps.append)
    assert text == CSV
    assert sleeps == [60.0]


def test_retry_gives_up():
    s = FakeSession([FakeResp(500)] * 3)
    with pytest.raises(FirmsRequestError):
        request_with_retry("http://x", session=s, retry_max=2, backoff_seconds=0, sleep=lambda _: None)


def test_fetch_area_url_and_checkpoint_resume(tmp_path: Path):
    cfg = _cfg()
    s = FakeSession([FakeResp(200, CSV), FakeResp(200, "")])
    df = fetch_area(
        "VIIRS_SNPP_SP", cfg.region.bbox, date(2022, 3, 1), date(2022, 3, 7),
        map_key="KEY", cfg=cfg, checkpoint_dir=tmp_path, session=s, sleep=lambda _: None,
    )
    assert s.urls[0] == (
        "https://firms.modaps.eosdis.nasa.gov/api/area/csv/KEY/VIIRS_SNPP_SP/20.0,52.0,22.0,53.0/5/2022-03-01"
    )
    assert s.urls[1].endswith("/2/2022-03-06")
    assert df.height == 1  # 'l' confidence filtered out
    assert len(list(tmp_path.rglob("*.parquet"))) == 2

    s2 = FakeSession([])  # all chunks served from checkpoint
    df2 = fetch_area(
        "VIIRS_SNPP_SP", cfg.region.bbox, date(2022, 3, 1), date(2022, 3, 7),
        map_key="KEY", cfg=cfg, checkpoint_dir=tmp_path, session=s2, sleep=lambda _: None,
    )
    assert s2.urls == []
    assert df2.equals(df)


def test_config_rejects_more_than_5_days():
    with pytest.raises(ValueError):
        config_from_dict({"region": {"name": "t", "bbox": [0, 0, 1, 1]}, "fetch": {"max_days_per_request": 10}})
