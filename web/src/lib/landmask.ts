/**
 * Land / water filter for map hexes.
 * Ocean and major water centres are dropped so the fire grid does not paint the sea.
 * Boxes are tight on purpose — earlier Great Lakes / Atlantic rectangles deleted real US land.
 */

type LonLat = [number, number];
type Box = { west: number; south: number; east: number; north: number };

/** Simplified Poland mainland (lon, lat), inland of Baltic / lagoons. */
const POLAND_LAND: LonLat[] = [
  [14.25, 53.7],
  [14.55, 53.35],
  [14.35, 52.85],
  [14.7, 52.2],
  [15.0, 51.0],
  [15.2, 50.75],
  [16.5, 50.3],
  [17.5, 50.05],
  [19.0, 49.45],
  [19.5, 49.25],
  [20.2, 49.15],
  [21.2, 49.25],
  [22.25, 49.05],
  [22.85, 48.95],
  [23.55, 49.95],
  [24.0, 50.3],
  [24.05, 50.75],
  [23.6, 51.45],
  [23.85, 52.0],
  [23.5, 52.35],
  [23.15, 52.65],
  [23.45, 53.05],
  [23.3, 53.45],
  [22.85, 54.05],
  [21.8, 54.1],
  [20.85, 54.15],
  [19.65, 54.18],
  [18.85, 54.2],
  [18.35, 54.22],
  [17.75, 54.25],
  [16.85, 54.2],
  [16.1, 54.05],
  [15.35, 53.9],
  [14.7, 53.8],
  [14.25, 53.7],
];

/** Tight water boxes only — never span whole countries. */
const GLOBAL_WATER: Box[] = [
  // Deep open oceans (away from continental shelves)
  { west: -180, south: -60, east: 180, north: -52 },
  { west: -40, south: 15, east: -20, north: 40 }, // mid N. Atlantic core
  { west: -160, south: 10, east: -140, north: 40 }, // mid N. Pacific core
  { west: 60, south: -30, east: 90, north: 5 }, // Indian Ocean core
  // Baltic / Polish coast
  { west: 13.2, south: 54.15, east: 22.5, north: 66 },
  { west: 18.2, south: 54.15, east: 19.8, north: 55.2 },
  { west: 13.2, south: 53.4, east: 14.95, north: 54.5 },
  { west: 19.15, south: 54.15, east: 20.2, north: 54.65 },
  // Great Lakes open water only (leave Chicago, Milwaukee, Cleveland on land)
  { west: -91.5, south: 46.6, east: -84.5, north: 48.9 }, // Superior
  { west: -87.35, south: 41.8, east: -86.2, north: 45.9 }, // Michigan
  { west: -84.5, south: 43.2, east: -80.0, north: 46.2 }, // Huron
  { west: -83.4, south: 41.4, east: -79.0, north: 42.85 }, // Erie
  { west: -79.8, south: 43.3, east: -76.2, north: 44.2 }, // Ontario
  // Caspian / Black Sea cores
  { west: 47.5, south: 37.5, east: 54.0, north: 47.0 },
  { west: 28.5, south: 41.2, east: 41.5, north: 46.8 },
  // Mediterranean open water (leave Iberia / Italy / Greece land alone)
  { west: 5.0, south: 35.0, east: 20.0, north: 40.5 },
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

function inBox(lon: number, lat: number, b: Box): boolean {
  return lon >= b.west && lon <= b.east && lat >= b.south && lat <= b.north;
}

function inAnyWater(lon: number, lat: number): boolean {
  return GLOBAL_WATER.some((b) => inBox(lon, lat, b));
}

/** Poland-specific: must be inside mainland outline AND not in water boxes. */
export function isPolandLand(lat: number, lon: number): boolean {
  if (inAnyWater(lon, lat)) return false;
  if (lat >= 54.15 && lon >= 13.2 && lon <= 22.5) return false;
  return pointInRing(lon, lat, POLAND_LAND);
}

/**
 * Global heuristic: drop obvious ocean / sea centres.
 * Used for world hexes. Not a full coastline product.
 */
export function isLikelyLand(lat: number, lon: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat < -60 || lat > 78) return false;
  if (inAnyWater(lon, lat)) return false;
  if (lat >= 54.15 && lon >= 13.2 && lon <= 22.5) return false;
  return true;
}

export function filterLandHexes<T extends { lat: number; lon: number }>(
  region: string,
  hexes: T[],
): T[] {
  if (region === "poland") return hexes.filter((h) => isPolandLand(h.lat, h.lon));
  if (region === "world") return hexes.filter((h) => isLikelyLand(h.lat, h.lon));
  return hexes;
}
