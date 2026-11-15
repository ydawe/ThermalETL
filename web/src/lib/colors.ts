export type RGB = [number, number, number];

const VIRIDIS: RGB[] = [
  [68, 1, 84],
  [72, 40, 120],
  [62, 74, 137],
  [49, 104, 142],
  [38, 130, 142],
  [31, 158, 137],
  [53, 183, 121],
  [110, 206, 88],
  [181, 222, 43],
  [253, 231, 37],
];

/** ColorBrewer RdBu (7-class, reversed): colour-blind-safe diverging, blue = fewer, red = more.
 * Mid stop is a warm ash (not pure white) so "about usual" cells stay visible on the cream page. */
const DIVERGING: RGB[] = [
  [33, 102, 172],
  [103, 169, 207],
  [209, 229, 240],
  [214, 208, 198],
  [253, 219, 199],
  [239, 138, 98],
  [178, 24, 43],
];

function lerpStops(stops: RGB[], t: number): RGB {
  const x = Math.min(1, Math.max(0, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const a = stops[i];
  const b = stops[i + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}

export const viridis = (t: number) => lerpStops(VIRIDIS, t);

/** Max ratio shown at full saturation: 4× more (or 4× fewer) than the median. */
export const ANOMALY_CLAMP = 2;

/** log2(ratio) mapped onto the diverging ramp; ratio 1 is neutral. */
export function anomalyColor(ratio: number): RGB {
  const l = Math.log2(Math.max(ratio, 1e-6));
  const t = (Math.max(-ANOMALY_CLAMP, Math.min(ANOMALY_CLAMP, l)) + ANOMALY_CLAMP) / (2 * ANOMALY_CLAMP);
  return lerpStops(DIVERGING, t);
}

export const rgb = (c: RGB) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;

/** Relative luminance, used to pick legible text on top of a fill. */
export function isDark(c: RGB): boolean {
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.3;
}

export function viridisGradientCss(steps = 10): string {
  const parts = Array.from({ length: steps }, (_, i) => rgb(viridis(i / (steps - 1))));
  return `linear-gradient(to right, ${parts.join(", ")})`;
}

export function divergingGradientCss(): string {
  return `linear-gradient(to right, ${DIVERGING.map(rgb).join(", ")})`;
}

/** Log scale for skewed counts: 0 -> 0, max -> 1. */
export function countScale(max: number) {
  const lmax = Math.log1p(Math.max(max, 1));
  return (v: number) => (v <= 0 ? 0 : Math.log1p(v) / lmax);
}
