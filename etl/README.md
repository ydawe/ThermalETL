# ThermalETL — ETL

Python pipeline that fetches NASA FIRMS MODIS/VIIRS detections, aggregates to H3 hexes, estimates local harmonization coefficients, and writes static JSON for the web app.

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
export FIRMS_MAP_KEY=...   # never commit
python -m thermaletl run --config ../config.yaml --sample
pytest
```
