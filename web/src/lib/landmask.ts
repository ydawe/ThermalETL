/**
 * Land mask for the default Poland bbox.
 * Keeps hex centres on land so the fire grid does not paint the Baltic.
 *
 * Ring is [lon, lat], closed. Simplified mainland outline (not a legal boundary).
 */

type LonLat = [number, number];

/**
 * Mainland Poland outline, deliberately inland of the open Baltic /
 * Gulf of Gdańsk / lagoons so coastal water hexes drop out.
 */
const POLAND_LAND: LonLat[] = [
  [14.15, 53.85],
  [14.55, 53.45],
  [14.30, 52.85],
  [14.65, 52.25],
  [14.95, 51.05],
  [15.15, 50.80],
  [16.45, 50.35],
  [17.45, 50.10],
  [18.95, 49.50],
  [19.45, 49.30],
  [20.15, 49.20],
  [21.15, 49.30],
  [22.20, 49.10],
  [22.80, 49.00],
  [23.55, 50.00],
  [24.05, 50.35],
  [24.10, 50.80],
  [23.65, 51.50],
  [23.90, 52.05],
  [23.55, 52.40],
  [23.20, 52.70],
  [23.50, 53.10],
  [23.35, 53.50],
  [22.90, 54.15],
  [21.85, 54.20],
  [20.90, 54.25],
  [19.70, 54.28],
  [18.90, 54.30],
  [18.40, 54.35], // stay south of Gdańsk Bay open water
  [17.80, 54.40],
  [16.90, 54.35],
  [16.15, 54.20],
  [15.40, 54.05],
  [14.75, 53.95],
  [14.15, 53.85],
];

/** Hard water rectangles (lon/lat). Anything inside is never shown. */
const WATER_BOXES: Array<{ west: number; south: number; east: number; north: number }> = [
  // Whole Baltic strip north of the Polish coast
  { west: 13.4, south: 54.32, east: 21.2, north: 56.5 },
  // Gulf of Gdańsk / Bay of Puck
  { west: 18.35, south: 54.28, east: 19.65, north: 54.90 },
  // Pomeranian Bay / Szczecin Lagoon approaches
  { west: 13.4, south: 53.55, east: 14.85, north: 54.45 },
  // Vistula Lagoon
  { west: 19.25, south: 54.22, east: 20.15, north: 54.60 },
];

function pointInRing(lon: number, lat: number, ring: LonLat[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
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
  if (lat >= 54.32 && lon >= 13.4 && lon <= 21.2) return false;
  if (inWaterBox(lon, lat)) return false;
  return pointInRing(lon, lat, POLAND_LAND);
}

export function filterLandHexes<T extends { lat: number; lon: number }>(
  region: string,
  hexes: T[],
): T[] {
  if (region !== "poland") return hexes;
  return hexes.filter((h) => isPolandLand(h.lat, h.lon));
}
