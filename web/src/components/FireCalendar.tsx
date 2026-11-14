"use client";

import { useRef, useState } from "react";
import { anomalyColor, isDark, rgb } from "@/lib/colors";
import { fmt, MONTHS_LONG, MONTHS_SHORT, type AreaCalendar, type CalendarCell } from "@/lib/analysis";
import { AnomalyLegend } from "./Legend";

const NEW_FILL: [number, number, number] = [178, 24, 43];
const QUIET_FILL: [number, number, number] = [236, 240, 241];

function cellFill(c: CalendarCell) {
  if (c.value === null) return null;
  if (c.ratio !== null) return anomalyColor(c.ratio);
  return c.value > 0 ? NEW_FILL : QUIET_FILL;
}

function describe(c: CalendarCell, metricLabel: string): string {
  const when = `${MONTHS_LONG[c.month - 1]} ${c.year}`;
  if (c.value === null) return `${when}: no data yet`;
  const vs =
    c.ratio !== null
      ? `${fmt(c.ratio, 2)} times the median of ${fmt(c.median)}`
      : c.value > 0
        ? "a typical year has none"
        : "quiet, as usual";
  return `${when}: ${fmt(c.value)} ${metricLabel.toLowerCase()} hotspots, ${vs}`;
}

export default function FireCalendar({ cal, metricLabel }: { cal: AreaCalendar; metricLabel: string }) {
  const [focus, setFocus] = useState<[number, number]>(() => [cal.years.length - 1, 0]);
  const [tip, setTip] = useState<{ r: number; c: number; x: number; y: number; flip: boolean } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const showTip = (r: number, c: number, el: HTMLElement) => {
    const gridW = gridRef.current?.clientWidth ?? 0;
    const flip = el.offsetLeft + 240 > gridW;
    setTip({ r, c, x: flip ? gridW - el.offsetLeft - el.offsetWidth : el.offsetLeft, y: el.offsetTop + el.offsetHeight + 6, flip });
  };

  const move = (r: number, c: number) => {
    const rr = Math.max(0, Math.min(cal.years.length - 1, r));
    const cc = Math.max(0, Math.min(11, c));
    setFocus([rr, cc]);
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-cell="${rr}-${cc}"]`)?.focus();
  };

  const onKey = (e: React.KeyboardEvent, r: number, c: number) => {
    const map: Record<string, [number, number]> = {
      ArrowRight: [r, c + 1],
      ArrowLeft: [r, c - 1],
      ArrowDown: [r + 1, c],
      ArrowUp: [r - 1, c],
      Home: [r, 0],
      End: [r, 11],
    };
    const next = map[e.key];
    if (next) {
      e.preventDefault();
      move(next[0], next[1]);
    } else if (e.key === "Escape") setTip(null);
  };

  const tipCell = tip ? cal.cells[tip.r]?.[tip.c] : null;

  return (
    <div>
      <div
        ref={gridRef}
        role="grid"
        aria-label="Fire calendar: rows are years, columns are months. Colour shows hotspots compared with the median for that month."
        aria-describedby="calendar-help"
        className="relative grid gap-[3px]"
        style={{ gridTemplateColumns: "2.75rem repeat(12, minmax(0, 1fr))" }}
        onMouseLeave={() => setTip(null)}
      >
        <div role="row" className="contents">
          <div role="columnheader" aria-label="Year" />
          {MONTHS_SHORT.map((m, i) => {
            const critical = cal.critical.includes(i + 1);
            return (
              <div
                key={m}
                role="columnheader"
                aria-label={`${MONTHS_LONG[i]}${critical ? ", critical month" : ""}`}
                className={`pb-1 text-center text-[11px] uppercase tracking-wide ${critical ? "font-bold text-ember-deep" : "text-ink-mute"}`}
                title={critical ? "Critical month: one of the 3 busiest months by median" : undefined}
              >
                <span aria-hidden>
                  {m[0]}
                  <span className="hidden sm:inline">{m.slice(1)}</span>
                </span>
              </div>
            );
          })}
        </div>
        {cal.cells.map((row, r) => (
          <div role="row" key={cal.years[r]} className="contents">
            <div role="rowheader" className="flex items-center text-xs tabular-nums text-ink-soft">
              {cal.years[r]}
            </div>
            {row.map((c, ci) => {
              const fill = cellFill(c);
              const critical = cal.critical.includes(c.month);
              const isFocus = focus[0] === r && focus[1] === ci;
              return (
                <button
                  key={c.key}
                  type="button"
                  role="gridcell"
                  data-cell={`${r}-${ci}`}
                  tabIndex={isFocus ? 0 : -1}
                  aria-label={`${describe(c, metricLabel)}${critical ? ". Critical month" : ""}${c.inRange ? "" : ". Outside selected dates"}`}
                  onKeyDown={(e) => onKey(e, r, ci)}
                  onFocus={(e) => {
                    setFocus([r, ci]);
                    showTip(r, ci, e.currentTarget);
                  }}
                  onBlur={() => setTip(null)}
                  onMouseEnter={(e) => showTip(r, ci, e.currentTarget)}
                  className={`cal-cell relative aspect-square min-h-[22px] ${critical ? "cal-critical" : ""}`}
                  style={{
                    backgroundColor: fill ? rgb(fill) : "transparent",
                    backgroundImage: fill
                      ? undefined
                      : "repeating-linear-gradient(45deg, rgba(19,38,47,.12) 0 2px, transparent 2px 6px)",
                    opacity: c.inRange ? 1 : 0.28,
                  }}
                >
                  {c.ratio === null && c.value !== null && c.value > 0 && (
                    <span aria-hidden className={`text-[10px] font-bold ${isDark(NEW_FILL) ? "text-white" : "text-ink"}`}>
                      +
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
        {tipCell && (
          <div
            role="tooltip"
            className="pointer-events-none absolute z-20 w-56 animate-fade border border-ink/15 bg-white p-3 text-sm text-ink shadow-md"
            style={tip!.flip ? { top: tip!.y, right: tip!.x } : { top: tip!.y, left: tip!.x }}
          >
            <div className="font-display text-base font-semibold">
              {MONTHS_LONG[tipCell.month - 1]} {tipCell.year}
            </div>
            {tipCell.value === null ? (
              <p className="text-ink-mute">No data yet for this month.</p>
            ) : (
              <dl className="mt-1 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 tabular-nums">
                <dt className="text-ink-mute">Harmonized</dt>
                <dd className="text-right">{fmt(tipCell.harm, 1)}</dd>
                <dt className="text-ink-mute">MODIS</dt>
                <dd className="text-right">{fmt(tipCell.modis)}</dd>
                <dt className="text-ink-mute">VIIRS</dt>
                <dd className="text-right">{fmt(tipCell.viirs)}</dd>
                <dt className="text-ink-mute">Median {MONTHS_SHORT[tipCell.month - 1]}</dt>
                <dd className="text-right">{fmt(tipCell.median, 1)}</dd>
                <dt className="text-ink-mute">vs median</dt>
                <dd className="text-right font-semibold">
                  {tipCell.ratio !== null ? `${fmt(tipCell.ratio, 2)}×` : tipCell.value > 0 ? "new" : "—"}
                </dd>
              </dl>
            )}
          </div>
        )}
      </div>
      <p id="calendar-help" className="mt-3 text-xs text-ink-mute">
        Use arrow keys to move between months. Bold month names are this area&apos;s three busiest months
        (outlined cells). Faded cells fall outside your selected dates; hatched cells have no data yet.
      </p>
      <div className="mt-3">
        <AnomalyLegend />
      </div>
    </div>
  );
}
