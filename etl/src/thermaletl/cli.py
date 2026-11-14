"""CLI entrypoint (implemented fully in Phase 1)."""

from __future__ import annotations

import argparse
import sys


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="thermaletl", description="ThermalETL pipeline")
    sub = parser.add_subparsers(dest="command")
    run_p = sub.add_parser("run", help="Run the ETL pipeline")
    run_p.add_argument("--config", required=True, help="Path to config.yaml")
    run_p.add_argument("--sample", action="store_true", help="Generate tiny sample dataset")
    run_p.add_argument("--out", default=None, help="Override output directory")
    args = parser.parse_args(argv)

    if args.command != "run":
        parser.print_help()
        return 1

    from thermaletl.pipeline import run_pipeline

    return run_pipeline(config_path=args.config, sample=args.sample, out_dir=args.out)


if __name__ == "__main__":
    sys.exit(main())
