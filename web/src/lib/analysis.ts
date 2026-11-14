import { keyMonth, keyYear, monthKey } from "./data";
import type { Dataset, KLevel, Metric, MonthRange, MonthlyRow, Selection } from "./types";

export const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const METRIC_FIELD: Record<Metric, "harm_n" | "modis_n" | "viirs_n"> = {
  harm: "harm_n",
  modis: "modis_n",
  viirs: "viirs_n",
};

export const METRIC_LABEL: Record<Metric, string> = {
  harm: "Harmonized",
  modis: "MODIS only",
  viirs: "VIIRS only",
};

export const formatMonth = (key: number) => `${MONTHS_SHORT[keyMonth(key) - 1]} ${keyYear(key)}`;

export function fmt(n: number, digits = 0): string {
  if (!Number.isFinite(n)) return "–";
  const d = Math.abs(n) < 10 && digits === 0 && n % 1 !== 0 ? 1 : digits;
  return n.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: 0 });
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Last month that has data, from meta.last_date (YYYY-MM-DD). */
export function lastDataKey(ds: Dataset): number {
  const [y, m] = ds.meta.last_date.split("-").map(Number);
  return monthKey(y, m);
}

export function fullRange(ds: Dataset): MonthRange {
  const years = ds.meta.calendar_years;
  return { from: monthKey(years[0], 1), to: lastDataKey(ds) };
}

export function selectedCells(ds: Dataset, selection: Selection): string[] {
  if (selection.kind === "all") return ds.hexes.map((h) => h.h3);
  return ds.hexes.filter((h) => selection.cells.has(h.h3)).map((h) => h.h3);
}

export function hexTotals(ds: Dataset, range: MonthRange, metric: Metric): Map<string, number> {
  const field = METRIC_FIELD[metric];
  const out = new Map<string, number>();
  for (const hex of ds.hexes) {
    let sum = 0;
    const rows = ds.monthly.get(hex.h3);
    if (rows) {
      rows.forEach((row, key) => {
        if (key >= range.from && key <= range.to) sum += row[field];
      });
    }
    out.set(hex.h3, sum);
  }
  return out;
}

export interface CalendarCell {
  year: number;
  month: number;
  key: number;
  /** null when the month is after the last available data. */
  value: number | null;
  modis: number;
  viirs: number;
  harm: number;
  median: number;
  /** value / median; null when median is 0 or no data. */
  ratio: number | null;
  inRange: boolean;
}

export interface AreaCalendar {
  years: number[];
  cells: CalendarCell[][];
  median: number[];
  /** 1-based months with the highest median, top 3. */
  critical: number[];
  monthlyMean: number[];
}

function sumRows(ds: Dataset, cells: string[], key: number) {
  let modis = 0;
  let viirs = 0;
  let harm = 0;
  for (const h3 of cells) {
    const row: MonthlyRow | undefined = ds.monthly.get(h3)?.get(key);
    if (row) {
      modis += row.modis_n;
      viirs += row.viirs_n;
      harm += row.harm_n;
    }
  }
  return { modis, viirs, harm };
}

/**
 * Year × month calendar for the selected cells. The median baseline uses every
 * available year (not just the selected range) so "usual" stays stable.
 */
export function areaCalendar(ds: Dataset, cells: string[], metric: Metric, range: MonthRange): AreaCalendar {
  const years = ds.meta.calendar_years;
  const last = lastDataKey(ds);
  const raw = years.map((year) =>
    MONTHS_SHORT.map((_, i) => {
      const key = monthKey(year, i + 1);
      const sums = sumRows(ds, cells, key);
      const value = key > last ? null : metric === "harm" ? sums.harm : metric === "modis" ? sums.modis : sums.viirs;
      return { year, month: i + 1, key, value, ...sums };
    }),
  );
  const med = MONTHS_SHORT.map((_, m) =>
    median(raw.map((row) => row[m].value).filter((v): v is number => v !== null)),
  );
  const mean = MONTHS_SHORT.map((_, m) => {
    const vals = raw.map((row) => row[m].value).filter((v): v is number => v !== null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  });
  const critical = med
    .map((v, i) => ({ v, m: i + 1 }))
    .filter((x) => x.v > 0)
    .sort((a, b) => b.v - a.v)
    .slice(0, 3)
    .map((x) => x.m)
    .sort((a, b) => a - b);
  const grid: CalendarCell[][] = raw.map((row) =>
    row.map((c) => ({
      ...c,
      median: med[c.month - 1],
      ratio: c.value !== null && med[c.month - 1] > 0 ? c.value / med[c.month - 1] : null,
      inRange: c.key >= range.from && c.key <= range.to,
    })),
  );
  return { years, cells: grid, median: med, critical, monthlyMean: mean };
}

const SEASONS: Record<string, number[]> = {
  winter: [12, 1, 2],
  spring: [3, 4, 5],
  summer: [6, 7, 8],
  autumn: [9, 10, 11],
};

function monthSpan(months: number[]): string {
  const s = [...months].sort((a, b) => a - b);
  if (!s.length) return "";
  const contiguous = s.length > 1 && s.every((m, i) => i === 0 || m === s[i - 1] + 1);
  return contiguous
    ? `${MONTHS_SHORT[s[0] - 1]}–${MONTHS_SHORT[s[s.length - 1] - 1]}`
    : s.map((m) => MONTHS_SHORT[m - 1]).join(", ");
}

/** Mirrors etl calendar_stats.season_label so the app and the published meta agree. */
export function seasonLabel(monthlyMean: number[], critical: number[]): string {
  const total = monthlyMean.reduce((a, b) => a + b, 0);
  if (total <= 0 || !critical.length) return "No clear fire season";
  const shares = Object.fromEntries(
    Object.entries(SEASONS).map(([s, ms]) => [s, ms.reduce((a, m) => a + monthlyMean[m - 1], 0) / total]),
  );
  const ranked = Object.keys(SEASONS).sort((a, b) => shares[b] - shares[a]);
  const primary = ranked[0];
  const primMonths = critical.filter((m) => SEASONS[primary].includes(m));
  let label = `${primary[0].toUpperCase()}${primary.slice(1)} (${monthSpan(primMonths.length ? primMonths : SEASONS[primary])})`;
  const secondary = ranked[1];
  const secMonths = critical.filter((m) => SEASONS[secondary].includes(m));
  if (shares[secondary] >= 0.2 && secMonths.length) {
    label += ` with a smaller ${secondary} peak (${monthSpan(secMonths)})`;
  }
  return label;
}

export interface Summary {
  season: string;
  activeYears: { year: number; total: number }[];
  latest: {
    key: number;
    value: number;
    median: number;
    ratio: number | null;
    sentence: string;
    direction: "more" | "fewer" | "same" | "quiet" | "new";
  } | null;
  rangeTotal: number;
}

export function summarize(cal: AreaCalendar, range: MonthRange): Summary {
  const flat = cal.cells.flat();
  const inRange = flat.filter((c) => c.inRange && c.value !== null);
  const byYear = new Map<number, number>();
  for (const c of inRange) byYear.set(c.year, (byYear.get(c.year) ?? 0) + (c.value ?? 0));
  const activeYears = [...byYear.entries()]
    .map(([year, total]) => ({ year, total }))
    .filter((y) => y.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 3);

  const lastCell = [...inRange].sort((a, b) => b.key - a.key)[0];
  let latest: Summary["latest"] = null;
  if (lastCell) {
    const value = lastCell.value ?? 0;
    const med = lastCell.median;
    const monthName = MONTHS_LONG[lastCell.month - 1];
    let sentence: string;
    let direction: NonNullable<Summary["latest"]>["direction"];
    if (med <= 0 && value <= 0) {
      sentence = `No hotspots — and a typical ${monthName} here has none either.`;
      direction = "quiet";
    } else if (med <= 0) {
      sentence = `${fmt(value)} hotspots, while a typical ${monthName} here has none.`;
      direction = "new";
    } else {
      const r = value / med;
      if (r >= 1.1) {
        sentence = `${fmt(r, 1)}× more than the median ${monthName} (${fmt(value)} vs ${fmt(med)}).`;
        direction = "more";
      } else if (r <= 0.9) {
        sentence =
          value <= 0
            ? `No hotspots, where a typical ${monthName} has ${fmt(med)}.`
            : `${fmt(1 / r, 1)}× fewer than the median ${monthName} (${fmt(value)} vs ${fmt(med)}).`;
        direction = "fewer";
      } else {
        sentence = `About the same as the median ${monthName} (${fmt(value)} vs ${fmt(med)}).`;
        direction = "same";
      }
    }
    latest = { key: lastCell.key, value, median: med, ratio: med > 0 ? value / med : null, sentence, direction };
  }
  return {
    season: seasonLabel(cal.monthlyMean, cal.critical),
    activeYears,
    latest,
    rangeTotal: inRange.reduce((a, c) => a + (c.value ?? 0), 0),
  };
}

export interface HexDetail {
  h3: string;
  k: number[];
  level: KLevel[];
  support: number[];
  modisTotal: number;
  viirsTotal: number;
  harmTotal: number;
  medians: number[];
}

export function hexDetail(ds: Dataset, h3: string, range: MonthRange): HexDetail | null {
  const coef = ds.coef.cells[h3];
  if (!coef) return null;
  let modisTotal = 0;
  let viirsTotal = 0;
  let harmTotal = 0;
  ds.monthly.get(h3)?.forEach((row, key) => {
    if (key >= range.from && key <= range.to) {
      modisTotal += row.modis_n;
      viirsTotal += row.viirs_n;
      harmTotal += row.harm_n;
    }
  });
  const hex = ds.hexes.find((h) => h.h3 === h3);
  return {
    h3,
    k: coef.k,
    level: coef.level,
    support: coef.support,
    modisTotal,
    viirsTotal,
    harmTotal,
    medians: hex?.median ?? new Array(12).fill(0),
  };
}

export const K_LEVEL_TEXT: Record<KLevel, { short: string; long: string }> = {
  hex: { short: "This hex", long: "Measured right here: enough overlapping MODIS and VIIRS detections in this hexagon." },
  res4: { short: "Nearby area", long: "Borrowed from the surrounding area (about 7 hexagons) because this one had too few overlapping detections." },
  res3: { short: "Wider area", long: "Borrowed from a wider area (about 50 hexagons) because the nearby area was still too sparse." },
  region: { short: "Whole region", long: "Regional average for this month — too few overlapping detections anywhere nearby." },
  region_all: { short: "Whole region (all months)", long: "Region-wide average over all months — this calendar month had too little data." },
  default: { short: "Default", long: "No overlap data at all; the ratio defaults to 1." },
};

export function csvForSelection(ds: Dataset, cells: string[], range: MonthRange, cal: AreaCalendar): string {
  const header = ["year", "month", "modis_n", "viirs_n", "harm_n", "k_avg", "median", "anomaly_ratio"];
  const lines = [header.join(",")];
  const round = (n: number, d = 3) => String(Math.round(n * 10 ** d) / 10 ** d);
  const harmMedian = MONTHS_SHORT.map((_, m) =>
    median(cal.cells.map((row) => row[m]).filter((c) => c.value !== null).map((c) => c.harm)),
  );
  const last = lastDataKey(ds);
  for (let key = range.from; key <= Math.min(range.to, last); key++) {
    const month = keyMonth(key);
    const { modis, viirs, harm } = sumRows(ds, cells, key);
    const ks = cells.map((h) => ds.coef.cells[h]?.k[month - 1]).filter((k): k is number => typeof k === "number");
    const kAvg = ks.length ? ks.reduce((a, b) => a + b, 0) / ks.length : NaN;
    const med = harmMedian[month - 1];
    lines.push(
      [
        keyYear(key),
        month,
        modis,
        viirs,
        round(harm, 2),
        Number.isFinite(kAvg) ? round(kAvg, 4) : "",
        round(med, 2),
        med > 0 ? round(harm / med) : "",
      ].join(","),
    );
  }
  return lines.join("\n") + "\n";
}

export function downloadText(filename: string, text: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
