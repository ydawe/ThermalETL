/**
 * Rough land mask for the default Poland bbox.
 * Keeps hex centres on (or very near) land so the map does not paint
 * a fire grid across the Baltic Sea and lagoons.
 *
 * Ring is [lon, lat], closed. Simplified mainland + major lakes excluded
 * only via coastline; not a legal boundary.
 */

type LonLat = [number, number];

/** Simplified Poland mainland outline (clockwise, lon/lat). */
const POLAND_LAND: LonLat[] = [
  [14.12, 53.95],
  [14.55, 53.50],
  [14.25, 52.85],
  [14.60, 52.30],
  [14.90, 51.10],
  [15.10, 50.85],
  [16.40, 50.40],
  [17.40, 50.15],
  [18.90, 49.55],
  [19.40, 49.35],
  [20.10, 49.25],
  [21.10, 49.35],
  [22.15, 49.15],
  [22.75, 49.05],
  [23.55, 50.05],
  [24.05, 50.40],
  [24.10, 50.85],
  [23.65, 51.55],
  [23.90, 52.10],
  [23.55, 52.45],
  [23.20, 52.75],
  [23.50, 53.15],
  [23.40, 53.55],
  [22.85, 54.25],
  [21.80, 54.25],
  [20.95, 54.35],
  [19.65, 54.40],
  [18.95, 54.45],
  [18.55, 54.55], // Gdańsk Bay mouth — stay inland of open Baltic
  [18.35, 54.70],
  [17.85, 54.75],
  [16.85, 54.55],
  [16.10, 54.30],
  [15.35, 54.15],
  [14.70, 54.05],
  [14.12, 53.95],
];

/** Open-water boxes clipped out even if the coarse polygon is loose. */
const WATER_BOXES: Array<{ west: number; south: number; east: number; north: number }> = [
  // Open Baltic north of the coast
  { west: 14.0, south: 54.55, east: 19.6, north: 56.0 },
  // Gulf of Gdańsk / Bay of Puck core
  { west: 18.45, south: 54.35, east: 19.55, north: 54.85 },
  // Szczecin Lagoon / Pomeranian Bay fringe
  { west: 13.9, south: 53.6, east: 14.7, north: 54.3 },
  // Vistula Lagoon
  { west: 19.35, south: 54.25, east: 20.0, north: 54.55 },
];

function pointInRing(lon: number, lat: number, ring: LonLat[]): boolean {
  // Ray casting
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect =
      yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi + 0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function inWaterBox(lon: number, lat: number): boolean {
  return WATER_BOXES.some(
    (b) => lon >= b.west && lon <= b.east && lat >= b.south && lat <= b.north,
  );
}

/** True when a hex centre should be shown on the Poland map. */
export function isPolandLand(lat: number, lon: number): boolean {
  if (inWaterBox(lon, lat)) return false;
  return pointInRing(lon, lat, POLAND_LAND);
}

/**
 * Filter hex list for display. Unknown regions pass through unchanged.
 */
export function filterLandHexes<T extends { lat: number; lon: number }>(
  region: string,
  hexes: T[],
): T[] {
  if (region !== "poland") return hexes;
  return hexes.filter((h) => isPolandLand(h.lat, h.lon));
}
