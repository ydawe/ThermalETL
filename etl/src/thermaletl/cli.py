"""CLI entrypoint: ``thermaletl run --config ../config.yaml [--sample] [--synthetic]``."""

from __future__ import annotations

import argparse
import sys


def _years(value: str) -> list[int]:
    """Parse '2012', '2012-2015' or '2012,2014'."""
    out: list[int] = []
    for part in value.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            a, b = part.split("-", 1)
            out.extend(range(int(a), int(b) + 1))
        else:
            out.append(int(part))
    return sorted(set(out))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="thermaletl", description="ThermalETL pipeline")
    sub = parser.add_subparsers(dest="command")
    run_p = sub.add_parser("run", help="Run the ETL pipeline")
    run_p.add_argument("--config", required=True, help="Path to config.yaml")
    run_p.add_argument("--sample", action="store_true", help="Tiny sample bbox/years (falls back to synthetic)")
    run_p.add_argument("--synthetic", action="store_true", help="Use deterministic synthetic detections")
    run_p.add_argument("--out", default=None, help="Override output directory")
    run_p.add_argument("--stage", choices=["all", "fetch", "process"], default="all")
    run_p.add_argument("--years", type=_years, default=None, help="e.g. 2012-2015 or 2020,2021")
    run_p.add_argument("--sensors", default=None, help="Comma list: MODIS,VIIRS")
    run_p.add_argument("--raw-dir", default=None, help="Raw parquet directory")
    nrt = run_p.add_mutually_exclusive_group()
    nrt.add_argument("--nrt", dest="include_nrt", action="store_true", default=None, help="Fetch NRT last days")
    nrt.add_argument("--no-nrt", dest="include_nrt", action="store_false", help="Skip NRT")
    run_p.add_argument("--refresh", action="store_true", help="Re-fetch years that already have raw files")
    args = parser.parse_args(argv)

    if args.command != "run":
        parser.print_help()
        return 1

    from thermaletl.pipeline import run_pipeline

    return run_pipeline(
        config_path=args.config,
        sample=args.sample,
        out_dir=args.out,
        use_synthetic=args.synthetic,
        stage=args.stage,
        years=args.years,
        sensors=[s.strip() for s in args.sensors.split(",") if s.strip()] if args.sensors else None,
        raw_dir=args.raw_dir,
        include_nrt=args.include_nrt,
        refresh=args.refresh,
    )


if __name__ == "__main__":
    sys.exit(main())
