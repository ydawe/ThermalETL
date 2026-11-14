"use client";

import { useId, useState } from "react";
import { keyMonth, keyYear, monthKey } from "@/lib/data";
import { METRIC_LABEL, MONTHS_SHORT } from "@/lib/analysis";
import type { Metric, MonthRange } from "@/lib/types";
import type { DrawMode } from "./HexMap";

const btn =
  "border px-2.5 py-1.5 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide disabled:opacity-50";
const btnIdle = `${btn} border-ink/20 bg-white/80 text-ink hover:bg-ash-100`;
const btnOn = `${btn} border-tide-deep bg-tide text-white`;
const field =
  "w-full border border-ink/25 bg-white px-2 py-1.5 text-sm text-ink focus:border-tide focus:outline focus:outline-2 focus:outline-tide/40";

export function MetricToggle({ value, onChange }: { value: Metric; onChange: (m: Metric) => void }) {
  const metrics: Metric[] = ["harm", "modis", "viirs"];
  return (
    <fieldset>
      <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-ink-mute">Sensor</legend>
      <div className="inline-flex" role="radiogroup" aria-label="Which hotspot count to show">
        {metrics.map((m, i) => (
          <label
            key={m}
            className={`${value === m ? btnOn : btnIdle} cursor-pointer ${i > 0 ? "-ml-px" : ""} focus-within:outline focus-within:outline-2 focus-within:outline-tide`}
          >
            <input type="radio" name="metric" value={m} checked={value === m} onChange={() => onChange(m)} className="sr-only" />
            {METRIC_LABEL[m]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function MonthPicker({
  label, value, years, onChange, min, max,
}: { label: string; value: number; years: number[]; onChange: (k: number) => void; min: number; max: number }) {
  const id = useId();
  const y = keyYear(value);
  const m = keyMonth(value);
  const clamp = (k: number) => Math.max(min, Math.min(max, k));
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1 text-xs text-ink-soft">{label}</legend>
      <div className="flex gap-1">
        <label htmlFor={`${id}-m`} className="sr-only">{label} month</label>
        <select id={`${id}-m`} className={`${field} min-w-[4.25rem] pr-6`} value={m} onChange={(e) => onChange(clamp(monthKey(y, Number(e.target.value))))}>
          {MONTHS_SHORT.map((name, i) => (
            <option key={name} value={i + 1}>{name}</option>
          ))}
        </select>
        <label htmlFor={`${id}-y`} className="sr-only">{label} year</label>
        <select id={`${id}-y`} className={`${field} min-w-[5rem] pr-6`} value={y} onChange={(e) => onChange(clamp(monthKey(Number(e.target.value), m)))}>
          {years.map((yr) => (
            <option key={yr} value={yr}>{yr}</option>
          ))}
        </select>
      </div>
    </fieldset>
  );
}

export function DateRangePicker({
  range, bounds, years, onChange,
}: { range: MonthRange; bounds: MonthRange; years: number[]; onChange: (r: MonthRange) => void }) {
  return (
    <fieldset>
      <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-ink-mute">Dates</legend>
      <div className="grid grid-cols-2 gap-2">
        <MonthPicker
          label="From"
          value={range.from}
          years={years}
          min={bounds.from}
          max={bounds.to}
          onChange={(from) => onChange({ from, to: Math.max(from, range.to) })}
        />
        <MonthPicker
          label="To"
          value={range.to}
          years={years}
          min={bounds.from}
          max={bounds.to}
          onChange={(to) => onChange({ from: Math.min(range.from, to), to })}
        />
      </div>
      {(range.from !== bounds.from || range.to !== bounds.to) && (
        <button type="button" className="mt-1 text-xs text-tide underline underline-offset-2" onClick={() => onChange(bounds)}>
          Reset to all available months
        </button>
      )}
    </fieldset>
  );
}

export function AreaControls({
  drawMode, onDrawMode, onCircle, onReset, selectionLabel, selectedCount, totalCount, defaultCenter,
}: {
  drawMode: DrawMode;
  onDrawMode: (m: DrawMode) => void;
  onCircle: (lat: number, lon: number, radiusKm: number) => void;
  onReset: () => void;
  selectionLabel: string;
  selectedCount: number;
  totalCount: number;
  defaultCenter: [number, number];
}) {
  const [lat, setLat] = useState(defaultCenter[0].toFixed(3));
  const [lon, setLon] = useState(defaultCenter[1].toFixed(3));
  const [radius, setRadius] = useState("15");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const la = Number(lat);
    const lo = Number(lon);
    const r = Number(radius);
    if (!Number.isFinite(la) || la < -90 || la > 90) return setError("Latitude must be between -90 and 90.");
    if (!Number.isFinite(lo) || lo < -180 || lo > 180) return setError("Longitude must be between -180 and 180.");
    if (!Number.isFinite(r) || r <= 0 || r > 500) return setError("Radius must be between 0 and 500 km.");
    setError(null);
    onCircle(la, lo, r);
  };

  return (
    <fieldset>
      <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-ink-mute">Area</legend>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className={drawMode === "rect" ? btnOn : btnIdle} aria-pressed={drawMode === "rect"} onClick={() => onDrawMode(drawMode === "rect" ? "none" : "rect")}>
          Draw rectangle
        </button>
        <button type="button" className={drawMode === "polygon" ? btnOn : btnIdle} aria-pressed={drawMode === "polygon"} onClick={() => onDrawMode(drawMode === "polygon" ? "none" : "polygon")}>
          Draw polygon
        </button>
        <button type="button" className={btnIdle} onClick={onReset}>
          Whole region
        </button>
      </div>
      <form onSubmit={submit} className="mt-2 grid grid-cols-[1fr_1fr_0.8fr_auto] items-end gap-1.5" aria-label="Select by coordinates">
        <label className="text-xs text-ink-soft">
          Lat
          <input className={field} inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} aria-describedby={error ? "area-error" : undefined} />
        </label>
        <label className="text-xs text-ink-soft">
          Lon
          <input className={field} inputMode="decimal" value={lon} onChange={(e) => setLon(e.target.value)} />
        </label>
        <label className="text-xs text-ink-soft">
          Radius km
          <input className={field} inputMode="decimal" value={radius} onChange={(e) => setRadius(e.target.value)} />
        </label>
        <button type="submit" className={btnIdle}>Apply</button>
      </form>
      {error && (
        <p id="area-error" role="alert" className="mt-1 text-xs text-ember-deep">{error}</p>
      )}
      <p className="mt-2 text-sm text-ink" aria-live="polite">
        <span className="font-semibold tabular-nums">{selectedCount}</span>
        <span className="text-ink-soft"> of {totalCount} hexagons selected · {selectionLabel}</span>
      </p>
    </fieldset>
  );
}
