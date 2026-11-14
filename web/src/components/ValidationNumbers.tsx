"use client";

import { useEffect, useState } from "react";
import { resolveRegion } from "@/lib/config";
import { loadMeta } from "@/lib/data";
import { fmt } from "@/lib/analysis";
import type { Meta } from "@/lib/types";
import KDiagram from "./KDiagram";

export default function ValidationNumbers() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    loadMeta(resolveRegion(window.location.search), ctrl.signal)
      .then(setMeta)
      .catch((e: Error) => e.name !== "AbortError" && setError(e.message));
    return () => ctrl.abort();
  }, []);

  if (error) return <p role="alert" className="text-sm text-ember-deep">Validation numbers unavailable: {error}</p>;
  if (!meta) return <p role="status" className="text-sm text-ink-mute">Loading validation numbers…</p>;

  const v = meta.validation;
  const regionalK = meta.regional_k?.overall ?? 4.7;
  return (
    <div className="space-y-6">
      <KDiagram regionalK={regionalK} />
      {v ? (
        <div>
          <p className="text-ink-soft">
            We hid the year <strong className="text-ink">{v.holdout_year}</strong>, rebuilt the ratios without it, and
            predicted VIIRS from MODIS alone in {fmt(v.n_cells_months)} hexagon-months. Lower error is better.
            {meta.synthetic && " (These numbers come from the synthetic demo sample.)"}
          </p>
          <table className="mt-3 w-full max-w-xl border-collapse text-left text-sm tabular-nums">
            <caption className="sr-only">Hold-out validation results</caption>
            <thead>
              <tr className="border-b border-ink/20 text-xs uppercase tracking-wide text-ink-mute">
                <th scope="col" className="py-2 pr-4 font-semibold">Method</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Mean abs. error</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Relative error</th>
                <th scope="col" className="py-2 font-semibold">Predicted total</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-ink/10">
                <th scope="row" className="py-2 pr-4 font-normal">One regional k</th>
                <td className="py-2 pr-4">{fmt(v.regional_k.mae, 2)}</td>
                <td className="py-2 pr-4">{fmt(v.regional_k.rel_error * 100, 1)}%</td>
                <td className="py-2">{fmt(v.regional_k.pred_total)}</td>
              </tr>
              <tr className="border-b border-ink/10 bg-tide/5">
                <th scope="row" className="py-2 pr-4 font-semibold">k per hexagon (ThermalETL)</th>
                <td className="py-2 pr-4 font-semibold">{fmt(v.hex_k.mae, 2)}</td>
                <td className="py-2 pr-4 font-semibold">{fmt(v.hex_k.rel_error * 100, 1)}%</td>
                <td className="py-2">{fmt(v.hex_k.pred_total)}</td>
              </tr>
              <tr>
                <th scope="row" className="py-2 pr-4 font-normal text-ink-mute">Actual VIIRS</th>
                <td className="py-2 pr-4 text-ink-mute">—</td>
                <td className="py-2 pr-4 text-ink-mute">—</td>
                <td className="py-2 text-ink-mute">{fmt(v.actual_viirs_total)}</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-3 font-display text-xl text-ink">
            {v.mae_improvement_vs_regional >= 0
              ? `${fmt(v.mae_improvement_vs_regional * 100, 0)}% smaller error than a single regional ratio.`
              : `${fmt(-v.mae_improvement_vs_regional * 100, 0)}% larger error than a single regional ratio in this sample.`}
          </p>
        </div>
      ) : (
        <p className="text-ink-soft">Validation has not been run for this region yet.</p>
      )}
      <p className="text-xs text-ink-mute">
        Region <code>{meta.region}</code> · H3 resolution {meta.h3_resolution} · overlap years {meta.overlap_years[0]}–
        {meta.overlap_years[1]} · minimum support {meta.min_support} MODIS detections · generated{" "}
        {new Date(meta.generated_at).toLocaleDateString("en-GB")}
      </p>
    </div>
  );
}
