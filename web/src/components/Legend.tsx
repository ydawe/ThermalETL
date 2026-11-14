import { divergingGradientCss, viridisGradientCss } from "@/lib/colors";
import { fmt } from "@/lib/analysis";

export function CountLegend({ max, metricLabel }: { max: number; metricLabel: string }) {
  const mid = Math.round(Math.expm1(Math.log1p(Math.max(max, 1)) / 2));
  return (
    <figure className="w-56 text-xs text-ink" aria-label={`Colour legend: ${metricLabel} hotspot count, 0 to ${fmt(max)}`}>
      <figcaption className="mb-1 font-semibold">{metricLabel} hotspots per hexagon</figcaption>
      <div className="h-2.5 w-full border border-ink/20" style={{ background: viridisGradientCss() }} aria-hidden />
      <div className="mt-0.5 flex justify-between tabular-nums text-ink-mute" aria-hidden>
        <span>0</span>
        <span>{fmt(mid)}</span>
        <span>{fmt(max)}</span>
      </div>
      <p className="mt-0.5 text-[11px] text-ink-mute">Count of detections, summed over selected months (log scale)</p>
    </figure>
  );
}

export function AnomalyLegend() {
  return (
    <figure className="text-xs text-ink" aria-label="Colour legend: blue means fewer hotspots than the median month, red means more, from a quarter to four times the median">
      <figcaption className="mb-1 font-semibold">Compared with the usual (median) for that month</figcaption>
      <div className="h-2.5 w-full border border-ink/20" style={{ background: divergingGradientCss() }} aria-hidden />
      <div className="mt-0.5 flex justify-between tabular-nums text-ink-mute" aria-hidden>
        <span>¼× fewer</span>
        <span>½×</span>
        <span>usual</span>
        <span>2×</span>
        <span>4× more</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-mute">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-flex h-3 w-3 items-center justify-center bg-[rgb(178,24,43)] text-[8px] font-bold text-white" aria-hidden>+</span>
          fires where usually none
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 border border-ink/20 bg-[rgb(236,240,241)]" aria-hidden />
          quiet, as usual
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 outline outline-2 outline-offset-[-2px] outline-ink" aria-hidden />
          critical month
        </span>
      </div>
    </figure>
  );
}
