import { cellToParent, getResolution } from "h3-js";

/**
 * Pick H3 resolution for the current map zoom.
 * Zoomed out → merge to parents; by ~city scale we show the finest published cells.
 */
export function targetResForZoom(zoom: number, nativeRes: number): number {
  if (zoom < 2.5) return Math.max(0, nativeRes - 3);
  if (zoom < 4) return Math.max(0, nativeRes - 2);
  if (zoom < 5.5) return Math.max(0, nativeRes - 1);
  return nativeRes;
}

export interface AggregableHex {
  h3: string;
  total: number;
  selected: boolean;
  active: boolean;
}

/** Roll child hexes up to ``targetRes`` by summing totals (and OR-ing selection flags). */
export function aggregateHexesToRes<T extends AggregableHex>(hexes: T[], targetRes: number): T[] {
  if (!hexes.length) return hexes;
  const native = getResolution(hexes[0].h3);
  if (targetRes >= native) return hexes;

  const byParent = new Map<string, T>();
  for (const h of hexes) {
    const parent = cellToParent(h.h3, targetRes);
    const cur = byParent.get(parent);
    if (!cur) {
      byParent.set(parent, { ...h, h3: parent });
    } else {
      cur.total += h.total;
      cur.selected = cur.selected || h.selected;
      cur.active = cur.active || h.active;
    }
  }
  return Array.from(byParent.values());
}
