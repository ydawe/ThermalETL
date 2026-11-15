"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { resolveRegion } from "@/lib/config";
import { DataError, loadDataset, loadMeta } from "@/lib/data";
import {
  areaCalendar, csvForSelection, downloadText, fmt, formatMonth, fullRange, hexDetail, hexTotals,
  METRIC_LABEL, selectedCells, summarize,
} from "@/lib/analysis";
import { COUNTRIES, inBBox, type CountryInfo } from "@/lib/countries";
import { cellsInPolygon, cellsInRadius, circlePolygon, closeRing, type LonLat } from "@/lib/geo";
import type { Dataset, Meta, Metric, MonthRange, Selection } from "@/lib/types";
import type { DrawMode } from "./HexMap";
import FireCalendar from "./FireCalendar";
import SummaryCards from "./SummaryCards";
import HexPanel from "./HexPanel";
import { CountLegend } from "./Legend";
import { AreaControls, DateRangePicker, MetricToggle } from "./Controls";

function bboxRing(bbox: [number, number, number, number]): LonLat[] {
  const [w, s, e, n] = bbox;
  return [
    [w, s],
    [e, s],
    [e, n],
    [w, n],
    [w, s],
  ];
}

const HexMap = dynamic(() => import("./HexMap"), {
  ssr: false,
  loading: () => <MapPlaceholder text="Loading map…" />,
});

function MapPlaceholder({ text }: { text: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-ash-100/70" role="status">
      <div className="flex flex-col items-center gap-3 text-ink-soft">
        <span className="loader-hex" aria-hidden />
        <span className="text-sm">{text}</span>
      </div>
    </div>
  );
}

type Status =
  | { state: "loading"; step: string; meta?: Meta }
  | { state: "error"; message: string }
  | { state: "ready"; ds: Dataset };

export default function ThermalApp() {
  const [status, setStatus] = useState<Status>({ state: "loading", step: "Reading dataset description…" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    const region = resolveRegion(window.location.search);
    setStatus({ state: "loading", step: "Reading dataset description…" });
    (async () => {
      try {
        const meta = await loadMeta(region, ctrl.signal);
        setStatus({ state: "loading", step: "Unpacking monthly hotspot history…", meta });
        const ds = await loadDataset(region, meta, ctrl.signal);
        setStatus({ state: "ready", ds });
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        const message =
          err instanceof DataError && err.status === 404
            ? `No data published yet for region "${region}".`
            : (err as Error).message || "Something went wrong while loading the data.";
        setStatus({ state: "error", message });
      }
    })();
    return () => ctrl.abort();
  }, [attempt]);

  if (status.state === "error") {
    return (
      <div className="mx-auto max-w-xl px-6 py-24 text-center" role="alert">
        <h2 className="font-display text-2xl text-ink">We couldn&apos;t load the fire data</h2>
        <p className="mt-2 text-ink-soft">{status.message}</p>
        <button
          type="button"
          onClick={() => setAttempt((a) => a + 1)}
          className="mt-5 border border-tide-deep bg-tide px-4 py-2 text-white transition-colors hover:bg-tide-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide"
        >
          Try again
        </button>
      </div>
    );
  }

  if (status.state === "loading") {
    return (
      <div className="grid min-h-[60vh] lg:grid-cols-[minmax(0,1.4fr)_minmax(360px,1fr)]">
        <div className="h-[55vh] lg:h-auto">
          <MapPlaceholder text={status.step} />
        </div>
        <div className="space-y-3 p-5" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse bg-ash-200/60" />
          ))}
          <div className="h-64 animate-pulse bg-ash-200/60" />
        </div>
      </div>
    );
  }

  return <Explorer ds={status.ds} />;
}

function Explorer({ ds }: { ds: Dataset }) {
  const bounds = useMemo(() => fullRange(ds), [ds]);
  const [range, setRange] = useState<MonthRange>(bounds);
  const [metric, setMetric] = useState<Metric>("harm");
  const [selection, setSelection] = useState<Selection>({ kind: "all" });
  const [countryId, setCountryId] = useState("world");
  const [focusBbox, setFocusBbox] = useState<[number, number, number, number] | null>(null);
  const [drawMode, setDrawMode] = useState<DrawMode>("none");
  const [activeHex, setActiveHex] = useState<string | null>(null);
  const res = ds.meta.h3_resolution;

  const totals = useMemo(() => hexTotals(ds, range, metric), [ds, range, metric]);
  const maxTotal = useMemo(() => Math.max(1, ...Array.from(totals.values())), [totals]);
  const cells = useMemo(() => selectedCells(ds, selection), [ds, selection]);
  const cal = useMemo(() => areaCalendar(ds, cells, metric, range), [ds, cells, metric, range]);
  const summary = useMemo(() => summarize(cal, range), [cal, range]);
  const detail = useMemo(() => (activeHex ? hexDetail(ds, activeHex, range) : null), [ds, activeHex, range]);
  const selectedSet = useMemo(() => (selection.kind === "all" ? null : new Set(cells)), [selection, cells]);

  const center: [number, number] = [(ds.meta.bbox[1] + ds.meta.bbox[3]) / 2, (ds.meta.bbox[0] + ds.meta.bbox[2]) / 2];

  const onDrawComplete = useCallback(
    (ring: LonLat[]) => {
      const closed = closeRing(ring);
      setDrawMode("none");
      setSelection({
        kind: "shape",
        label: "your drawn shape",
        polygon: closed,
        cells: cellsInPolygon(closed, res),
      });
    },
    [res],
  );
  const onCircle = (lat: number, lon: number, radiusKm: number) => {
    setDrawMode("none");
    setSelection({
      kind: "circle",
      label: `${radiusKm} km around ${lat.toFixed(2)}, ${lon.toFixed(2)}`,
      lat, lon, radiusKm,
      polygon: circlePolygon(lat, lon, radiusKm),
      cells: cellsInRadius(lat, lon, radiusKm, res),
    });
  };

  const selectCountry = useCallback(
    (country: CountryInfo) => {
      setDrawMode("none");
      setCountryId(country.id);
      setActiveHex(null);
      setFocusBbox(country.bbox);
      if (country.id === "world") {
        setSelection({ kind: "all" });
        return;
      }
      const cells = new Set(
        ds.hexes.filter((h) => inBBox(h.lat, h.lon, country.bbox)).map((h) => h.h3),
      );
      setSelection({
        kind: "country",
        label: country.label,
        countryId: country.id,
        bbox: country.bbox,
        cells,
      });
    },
    [ds.hexes],
  );

  const resetAll = useCallback(() => {
    setSelection({ kind: "all" });
    setCountryId("world");
    setFocusBbox(ds.meta.bbox);
    setDrawMode("none");
    setRange(bounds);
    setMetric("harm");
    setActiveHex(null);
  }, [bounds, ds.meta.bbox]);

  const exportCsv = () => {
    const csv = csvForSelection(ds, cells, range, cal);
    const tag = `${formatMonth(range.from)}_${formatMonth(range.to)}`.replace(/\s/g, "-");
    downloadText(`thermaletl_${ds.region}_${tag}.csv`, csv);
  };

  const hexOptions = useMemo(
    () => [...ds.hexes].sort((a, b) => (totals.get(b.h3) ?? 0) - (totals.get(a.h3) ?? 0)),
    [ds.hexes, totals],
  );

  return (
    <div className="grid lg:h-[calc(100vh-7.5rem)] lg:min-h-[640px] lg:grid-cols-[minmax(0,1.4fr)_minmax(380px,1fr)]">
      <section aria-label="Map and filters" className="flex min-h-0 flex-col border-ink/10 lg:border-r">
        <div className="grid gap-4 border-b border-ink/10 bg-white/55 px-4 py-3 backdrop-blur-sm md:grid-cols-[minmax(0,1fr)_auto] 2xl:grid-cols-[minmax(0,1fr)_auto_auto]">
          <AreaControls
            drawMode={drawMode}
            onDrawMode={setDrawMode}
            onCircle={onCircle}
            onResetArea={() => {
              setDrawMode("none");
              selectCountry(COUNTRIES[0]);
            }}
            onResetAll={resetAll}
            onCountry={selectCountry}
            countryId={countryId}
            selectionLabel={selection.kind === "all" ? "whole region" : selection.label}
            selectedCount={cells.length}
            totalCount={ds.hexes.length}
            defaultCenter={center}
          />
          <DateRangePicker range={range} bounds={bounds} years={ds.meta.calendar_years} onChange={setRange} />
          <MetricToggle value={metric} onChange={setMetric} />
        </div>
        <div className="relative h-[58vh] min-h-[360px] lg:h-auto lg:flex-1">
          <HexMap
            hexes={ds.hexes}
            totals={totals}
            maxTotal={maxTotal}
            metricLabel={METRIC_LABEL[metric]}
            selected={selectedSet}
            selectionRing={
              selection.kind === "all"
                ? null
                : selection.kind === "country"
                  ? bboxRing(selection.bbox)
                  : selection.polygon
            }
            activeHex={activeHex}
            bbox={ds.meta.bbox}
            focusBbox={focusBbox}
            drawMode={drawMode}
            onHexClick={setActiveHex}
            onDrawComplete={onDrawComplete}
            onDrawCancel={() => setDrawMode("none")}
          />
          <div className="pointer-events-none absolute bottom-8 left-3 border border-ink/10 bg-white/90 p-2.5">
            <CountLegend max={maxTotal} metricLabel={METRIC_LABEL[metric]} />
          </div>
        </div>
      </section>

      <section aria-labelledby="calendar-title" className="min-h-0 animate-rise overflow-y-auto px-4 py-5 sm:px-6">
        {ds.meta.synthetic && (
          <p className="mb-4 border-l-4 border-ember/50 bg-ash-100/80 px-3 py-2 text-xs text-ink-soft" role="status">
            <strong>Demo data (not measured fires).</strong> Counts are synthetic for UI and method testing.
          </p>
        )}
        {ds.region === "world" && !ds.meta.synthetic && (
          <p className="mb-4 border-l-4 border-tide/40 bg-ash-100/80 px-3 py-2 text-xs text-ink-soft" role="status">
            <strong>Global FIRMS layer</strong> (multi-country archives). Use <em>Country</em> to crop a nation; zoom
            in to split hexes down to H3 res {ds.meta.h3_resolution}. Coverage grows as more country years are
            backfilled — empty nations simply have no published hexes yet.
          </p>
        )}
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="calendar-title" className="font-display text-2xl font-semibold text-ink">Fire calendar</h2>
          <span className="text-xs text-ink-mute tabular-nums">
            {formatMonth(range.from)} to {formatMonth(range.to)}
          </span>
        </div>
        <p className="mt-1 text-sm text-ink-soft">
          Each square is one month. Red means more hotspots than usual for that month, blue means fewer.
        </p>

        {cells.length === 0 ? (
          <div className="mt-6 border border-dashed border-ink/25 p-6 text-center" role="status">
            <p className="font-display text-lg text-ink">No hotspot hexagons in this area</p>
            <p className="mt-1 text-sm text-ink-soft">
              Fires were never detected here, or the area is outside the published region. Try a larger radius or
              select the whole region.
            </p>
            <button
              type="button"
              onClick={() => setSelection({ kind: "all" })}
              className="mt-3 border border-ink/20 bg-white px-3 py-1.5 text-sm text-ink hover:bg-ash-100"
            >
              Use whole region
            </button>
          </div>
        ) : (
          <>
            <div className="mt-4">
              <SummaryCards summary={summary} />
            </div>
            <div className="mt-5">
              <FireCalendar cal={cal} metricLabel={METRIC_LABEL[metric]} />
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-ink/10 pt-4">
              <p className="text-sm text-ink-soft">
                <span className="font-semibold text-ink tabular-nums">{fmt(summary.rangeTotal)}</span>{" "}
                {METRIC_LABEL[metric].toLowerCase()} hotspots in the selected area and dates.
              </p>
              <button
                type="button"
                onClick={exportCsv}
                className="border border-tide-deep bg-tide px-3 py-1.5 text-sm text-white transition-colors hover:bg-tide-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide"
              >
                Download CSV
              </button>
            </div>
          </>
        )}

        <div className="mt-6">
          <label htmlFor="hex-pick" className="text-xs font-semibold uppercase tracking-wider text-ink-mute">
            Inspect a hexagon
          </label>
          <select
            id="hex-pick"
            data-testid="hex-pick"
            className="mt-1 w-full border border-ink/25 bg-white px-2 py-1.5 text-sm text-ink focus:outline focus:outline-2 focus:outline-tide/40"
            value={activeHex ?? ""}
            onChange={(e) => setActiveHex(e.target.value || null)}
          >
            <option value="">Click a hexagon on the map, or choose one here…</option>
            {hexOptions.map((h) => (
              <option key={h.h3} value={h.h3}>
                {h.lat.toFixed(3)}, {h.lon.toFixed(3)}: {fmt(totals.get(h.h3) ?? 0)} hotspots
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-ink-mute">Opens a centred popup with conversion ratios for that cell.</p>
        </div>
      </section>

      {detail && (
        <HexPanel
          key={detail.h3}
          detail={detail}
          onClose={() => setActiveHex(null)}
        />
      )}
    </div>
  );
}
