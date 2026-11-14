"""Fetch FIRMS hot spots: area API (chunked, retried, checkpointed) + country CSV fallback."""

from __future__ import annotations

import hashlib
import io
import logging
import os
import time
from datetime import date, timedelta
from pathlib import Path
from typing import Callable, Iterable

import polars as pl
import requests

from thermaletl.config import AppConfig, BBox
from thermaletl.normalize import clip_bbox, dedupe_detections, empty_detections, normalize_firms_csv

log = logging.getLogger(__name__)

FIRMS_BASE = "https://firms.modaps.eosdis.nasa.gov"
AREA_URL = FIRMS_BASE + "/api/area/csv/{map_key}/{source}/{west},{south},{east},{north}/{days}/{date}"
COUNTRY_YEAR_URL = FIRMS_BASE + "/data/country/{folder}/{year}/{prefix}_{year}_{country}.csv"

COUNTRY_NAMES = {"POL": "Poland"}
RETRY_STATUS = {429, 500, 502, 503, 504}


class MissingMapKeyError(RuntimeError):
    pass


class FirmsRequestError(RuntimeError):
    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        self.status = status


def get_map_key(env: dict[str, str] | None = None) -> str:
    env = os.environ if env is None else env
    key = (env.get("FIRMS_MAP_KEY") or "").strip()
    if not key:
        raise MissingMapKeyError(
            "FIRMS_MAP_KEY is not set. Add it as a GitHub Actions secret (or export it locally)."
        )
    return key


def sensor_label(source: str) -> str:
    s = source.upper()
    if "MODIS" in s:
        return "MODIS"
    if "VIIRS" in s:
        return "VIIRS"
    raise ValueError(f"Cannot infer sensor from source {source!r}")


def date_chunks(start: date, end: date, max_days: int = 5) -> list[tuple[date, int]]:
    """Split [start, end] (inclusive) into (chunk_start, n_days) with n_days <= max_days."""
    if max_days < 1:
        raise ValueError("max_days must be >= 1")
    if end < start:
        return []
    chunks: list[tuple[date, int]] = []
    cur = start
    while cur <= end:
        days = min(max_days, (end - cur).days + 1)
        chunks.append((cur, days))
        cur += timedelta(days=days)
    return chunks


def _redact(url: str, map_key: str | None) -> str:
    return url.replace(map_key, "***") if map_key else url


def request_with_retry(
    url: str,
    *,
    session: requests.Session | None = None,
    retry_max: int = 5,
    backoff_seconds: float = 5.0,
    timeout: float = 120.0,
    map_key: str | None = None,
    sleep: Callable[[float], None] = time.sleep,
) -> str:
    """GET with exponential backoff on 429/5xx and network errors. 4xx (e.g. 400) fail fast."""
    http = session or requests
    safe_url = _redact(url, map_key)
    last_err: Exception | None = None
    for attempt in range(retry_max + 1):
        try:
            resp = http.get(url, timeout=timeout)
        except (requests.ConnectionError, requests.Timeout) as e:
            last_err = e
            log.warning("network error on %s (attempt %d): %s", safe_url, attempt + 1, e)
        else:
            if resp.status_code == 200:
                return resp.text
            if resp.status_code not in RETRY_STATUS:
                raise FirmsRequestError(
                    f"HTTP {resp.status_code} for {safe_url}: {resp.text[:200]}", resp.status_code
                )
            last_err = FirmsRequestError(f"HTTP {resp.status_code} for {safe_url}", resp.status_code)
            log.warning("retryable HTTP %d on %s (attempt %d)", resp.status_code, safe_url, attempt + 1)
        if attempt < retry_max:
            sleep(backoff_seconds * (2**attempt))
    raise FirmsRequestError(f"giving up after {retry_max + 1} attempts: {last_err}")


def parse_firms_csv(text: str) -> pl.DataFrame:
    """Parse a FIRMS CSV body. FIRMS reports some errors as 200 + plain text."""
    body = text.strip()
    if not body:
        return pl.DataFrame()
    header = body.split("\n", 1)[0].lower()
    if "latitude" not in header:
        raise FirmsRequestError(f"Unexpected FIRMS response: {body[:200]}")
    return pl.read_csv(io.StringIO(body), infer_schema_length=0)  # all Utf8; normalize casts


def _bbox_tag(bbox: BBox) -> str:
    return hashlib.sha1(",".join(f"{v:.4f}" for v in bbox).encode()).hexdigest()[:10]


def fetch_area(
    source: str,
    bbox: BBox,
    start: date,
    end: date,
    *,
    map_key: str,
    cfg: AppConfig,
    checkpoint_dir: Path | None = None,
    session: requests.Session | None = None,
    sleep: Callable[[float], None] = time.sleep,
) -> pl.DataFrame:
    """Fetch + normalize detections for one source over [start, end] via the area API.

    Each chunk is persisted as parquet in ``checkpoint_dir`` so reruns resume.
    """
    sensor = sensor_label(source)
    fc = cfg.fetch
    ckpt = None
    if checkpoint_dir is not None:
        ckpt = Path(checkpoint_dir) / source / _bbox_tag(bbox)
        ckpt.mkdir(parents=True, exist_ok=True)

    west, south, east, north = bbox
    frames: list[pl.DataFrame] = []
    session = session or requests.Session()
    chunks = date_chunks(start, end, fc.max_days_per_request)
    for i, (chunk_start, days) in enumerate(chunks):
        part = ckpt / f"{chunk_start.isoformat()}_{days}.parquet" if ckpt else None
        if part is not None and part.exists():
            frames.append(pl.read_parquet(part))
            continue
        url = AREA_URL.format(
            map_key=map_key, source=source, west=west, south=south, east=east, north=north,
            days=days, date=chunk_start.isoformat(),
        )
        text = request_with_retry(
            url, session=session, retry_max=fc.retry_max, backoff_seconds=fc.retry_backoff_seconds,
            map_key=map_key, sleep=sleep,
        )
        df = normalize_firms_csv(
            parse_firms_csv(text), sensor,
            modis_confidence_min=cfg.modis_confidence_min, viirs_confidence=cfg.viirs_confidence,
        )
        if part is not None:
            df.write_parquet(part)
        frames.append(df)
        if (i + 1) % 50 == 0:
            log.info("%s: %d/%d chunks", source, i + 1, len(chunks))
        if fc.sleep_between_requests_seconds > 0 and i < len(chunks) - 1:
            sleep(fc.sleep_between_requests_seconds)

    if not frames:
        return empty_detections()
    return clip_bbox(pl.concat(frames, how="vertical"), bbox)


def _country_url(sensor: str, year: int, country_code: str) -> str:
    country = COUNTRY_NAMES.get(country_code.upper(), country_code)
    if sensor == "MODIS":
        folder = prefix = "modis"
    else:
        folder = prefix = "viirs-snpp"
    return COUNTRY_YEAR_URL.format(folder=folder, prefix=prefix, year=year, country=country)


def fetch_country_year(
    sensor: str,
    year: int,
    *,
    cfg: AppConfig,
    bbox: BBox,
    session: requests.Session | None = None,
    sleep: Callable[[float], None] = time.sleep,
) -> pl.DataFrame:
    """Fallback: FIRMS yearly country CSV (no MAP_KEY needed), clipped to bbox."""
    url = _country_url(sensor, year, cfg.region.country_code)
    text = request_with_retry(
        url, session=session, retry_max=cfg.fetch.retry_max,
        backoff_seconds=cfg.fetch.retry_backoff_seconds, timeout=600, sleep=sleep,
    )
    df = normalize_firms_csv(
        parse_firms_csv(text), sensor,
        modis_confidence_min=cfg.modis_confidence_min, viirs_confidence=cfg.viirs_confidence,
    )
    return clip_bbox(df, bbox)


def _year_range(year: int, sensor: str, cfg: AppConfig, today: date) -> tuple[date, date] | None:
    sensor_start = date.fromisoformat(cfg.fetch.modis_start if sensor == "MODIS" else cfg.fetch.viirs_start)
    start = max(date(year, 1, 1), sensor_start)
    end = min(date(year, 12, 31), today - timedelta(days=1))
    return (start, end) if start <= end else None


def fetch_history(
    sensors: Iterable[str],
    years: Iterable[int],
    *,
    cfg: AppConfig,
    bbox: BBox,
    map_key: str | None,
    checkpoint_dir: Path | None = None,
    today: date | None = None,
    allow_country_fallback: bool = True,
    session: requests.Session | None = None,
    sleep: Callable[[float], None] = time.sleep,
) -> pl.DataFrame:
    """Standard-product history per sensor/year: area API first, country CSV fallback."""
    today = today or date.today()
    session = session or requests.Session()
    frames: list[pl.DataFrame] = []
    for sensor in sensors:
        source = cfg.modis_source if sensor == "MODIS" else cfg.viirs_source
        for year in years:
            rng = _year_range(year, sensor, cfg, today)
            if rng is None:
                continue
            try:
                if not map_key:
                    raise MissingMapKeyError("no MAP_KEY")
                df = fetch_area(
                    source, bbox, rng[0], rng[1], map_key=map_key, cfg=cfg,
                    checkpoint_dir=checkpoint_dir, session=session, sleep=sleep,
                )
            except (FirmsRequestError, MissingMapKeyError, requests.RequestException) as e:
                if not allow_country_fallback:
                    raise
                log.warning("area API failed for %s %d (%s); trying country CSV fallback", source, year, e)
                df = fetch_country_year(sensor, year, cfg=cfg, bbox=bbox, session=session, sleep=sleep)
            log.info("%s %d: %d detections", source, year, df.height)
            frames.append(df)
    if not frames:
        return empty_detections()
    return dedupe_detections(pl.concat(frames, how="vertical"))


def fetch_nrt(
    *,
    cfg: AppConfig,
    bbox: BBox,
    map_key: str,
    today: date | None = None,
    days: int | None = None,
    session: requests.Session | None = None,
    sleep: Callable[[float], None] = time.sleep,
) -> pl.DataFrame:
    """Near-real-time detections for the last ``days`` (default cfg.fetch.nrt_days) for both sensors."""
    today = today or date.today()
    days = days or cfg.fetch.nrt_days
    start = today - timedelta(days=days - 1)
    frames = [
        fetch_area(source, bbox, start, today, map_key=map_key, cfg=cfg, session=session, sleep=sleep)
        for source in (cfg.modis_nrt, cfg.viirs_nrt)
    ]
    return dedupe_detections(pl.concat(frames, how="vertical"))
