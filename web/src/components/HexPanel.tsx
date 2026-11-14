"use client";

import { useState } from "react";
import { fmt, K_LEVEL_TEXT, MONTHS_LONG, MONTHS_SHORT, type HexDetail } from "@/lib/analysis";
import type { KLevel } from "@/lib/types";

const LEVEL_STYLE: Record<KLevel, { fill: string; text: string }> = {
  hex: { fill: "#1f5f78", text: "#ffffff" },
  res4: { fill: "#5f9bb0", text: "#13262f" },
  res3: { fill: "#a9c9d4", text: "#13262f" },
  region: { fill: "#d6c4b8", text: "#13262f" },
  region_all: { fill: "#d6c4b8", text: "#13262f" },
  default: { fill: "#e2e2e2", text: "#13262f" },
};

export default function HexPanel({ detail, onClose }: { detail: HexDetail; onClose: () => void }) {
  const [month, setMonth] = useState(() => detail.medians.indexOf(Math.max(...detail.medians)));
  const maxK = Math.max(...detail.k, 1);
  const level = detail.level[month];
  const levels = Array.from(new Set(detail.level));

  return (
    <section
      aria-labelledby="hex-panel-title"
      className="animate-rise border border-ink/15 bg-white/90 p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id="hex-panel-title" className="font-display text-lg font-semibold text-ink">
            Hexagon details
          </h3>
          <p className="font-mono text-[11px] text-ink-mute">{detail.h3}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="border border-ink/20 px-2 py-1 text-sm text-ink-soft transition-colors hover:bg-ash-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-tide"
          aria-label="Close hexagon details"
        >
          Close
        </button>
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-center tabular-nums">
        {[
          ["MODIS", detail.modisTotal],
          ["VIIRS", detail.viirsTotal],
          ["Harmonized", detail.harmTotal],
        ].map(([label, v]) => (
          <div key={label as string} className="border-l-2 border-tide/40 pl-2 text-left">
            <dt className="text-[11px] uppercase tracking-wide text-ink-mute">{label}</dt>
            <dd className="text-lg font-semibold text-ink">{fmt(v as number, 1)}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-1 text-[11px] text-ink-mute">Hotspots in the selected months.</p>

      <h4 className="mt-4 text-sm font-semibold text-ink">
        Conversion ratio <span className="font-normal text-ink-mute">(k = VIIRS ÷ MODIS) by month</span>
      </h4>
      <p className="text-xs text-ink-mute">
        VIIRS sees more small fires than MODIS. For years with only MODIS, we multiply by k to estimate what VIIRS would
        have seen.
      </p>
      <div role="radiogroup" aria-label="Choose a month to explain its conversion ratio" className="mt-3 flex h-36 items-end gap-1">
        {detail.k.map((k, i) => {
          const s = LEVEL_STYLE[detail.level[i]];
          const selected = i === month;
          return (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${MONTHS_LONG[i]}: k ${fmt(k, 2)}, from ${K_LEVEL_TEXT[detail.level[i]].short}, based on ${detail.support[i]} MODIS detections`}
              onClick={() => setMonth(i)}
              onKeyDown={(e) => {
                const next = e.key === "ArrowRight" ? (i + 1) % 12 : e.key === "ArrowLeft" ? (i + 11) % 12 : -1;
                if (next < 0) return;
                e.preventDefault();
                setMonth(next);
                (e.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
              }}
              tabIndex={selected ? 0 : -1}
              className="group flex h-full flex-1 flex-col items-center justify-end focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide"
            >
              <span className="mb-0.5 text-[10px] tabular-nums text-ink-soft">{fmt(k, 1)}</span>
              <span
                className="w-full origin-bottom transition-[height,transform] duration-300 group-hover:scale-x-110"
                style={{
                  height: `${Math.max(4, (k / maxK) * 100)}%`,
                  backgroundColor: s.fill,
                  outline: selected ? "2px solid #b8441b" : undefined,
                  outlineOffset: 1,
                }}
              />
              <span className={`mt-1 text-[10px] ${selected ? "font-bold text-ink" : "text-ink-mute"}`}>
                {MONTHS_SHORT[i][0]}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] tabular-nums text-ink-mute" aria-hidden>
        {detail.support.map((s, i) => (
          <span key={i} className="flex-1 text-center" title="support: MODIS detections behind k">
            {s}
          </span>
        ))}
      </div>
      <p className="text-right text-[10px] text-ink-mute">support_n (MODIS detections behind each k)</p>

      <div className="mt-3 border-t border-ink/10 pt-3" aria-live="polite">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-ink">{MONTHS_LONG[month]}: k = {fmt(detail.k[month], 2)}</span>
          <span
            className="px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
            style={{ backgroundColor: LEVEL_STYLE[level].fill, color: LEVEL_STYLE[level].text }}
          >
            {K_LEVEL_TEXT[level].short}
          </span>
          <span className="text-xs text-ink-mute">support {detail.support[month]}</span>
        </div>
        <p className="mt-1 text-sm text-ink-soft">{K_LEVEL_TEXT[level].long}</p>
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-mute" aria-label="Bar colours">
        {levels.map((l) => (
          <li key={l} className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5" style={{ backgroundColor: LEVEL_STYLE[l].fill }} aria-hidden />
            {K_LEVEL_TEXT[l].short}
          </li>
        ))}
      </ul>
    </section>
  );
}
