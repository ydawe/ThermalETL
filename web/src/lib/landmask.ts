/**
 * Land / water filter for map hexes.
 * Ocean and major coastal water centres are dropped so the fire grid
 * does not paint the sea. Not a legal shoreline — deliberately inland
 * of coasts where basemap water tiles would look wrong.
 */

type LonLat = [number, number];
type Box = { west: number; south: number; east: number; north: number };

/** Simplified Poland mainland (lon, lat), inland of Baltic / lagoons. */
const POLAND_LAND: LonLat[] = [
  [14.25, 53.70],
  [14.55, 53.35],
  [14.35, 52.85],
  [14.70, 52.20],
  [15.00, 51.00],
  [15.20, 50.75],
  [16.50, 50.30],
  [17.50, 50.05],
  [19.00, 49.45],
  [19.50, 49.25],
  [20.20, 49.15],
  [21.20, 49.25],
  [22.25, 49.05],
  [22.85, 48.95],
  [23.55, 49.95],
  [24.00, 50.30],
  [24.05, 50.75],
  [23.60, 51.45],
  [23.85, 52.00],
  [23.50, 52.35],
  [23.15, 52.65],
  [23.45, 53.05],
  [23.30, 53.45],
  [22.85, 54.05],
  [21.80, 54.10],
  [20.85, 54.15],
  [19.65, 54.18],
  [18.85, 54.20],
  [18.35, 54.22],
  [17.75, 54.25],
  [16.85, 54.20],
  [16.10, 54.05],
  [15.35, 53.90],
  [14.70, 53.80],
  [14.25, 53.70],
];

/** Always-water boxes (any region). */
const GLOBAL_WATER: Box[] = [
  // Open oceans (coarse)
  { west: -180, south: -60, east: 180, north: -50 }, // Southern Ocean belt
  { west: -80, south: 0, east: -10, north: 45 }, // mid N. Atlantic
  { west: -180, south: 0, east: -120, north: 50 }, // N. Pacific
  { west: 140, south: 0, east: 180, north: 50 },
  { west: 40, south: -40, east: 100, north: 10 }, // Indian Ocean core
  // Baltic / North Sea / Polish coast (strict)
  { west: 13.2, south: 54.15, east: 22.5, north: 66 },
  { west: 18.2, south: 54.15, east: 19.8, north: 55.2 }, // Gdańsk Bay
  { west: 13.2, south: 53.40, east: 14.95, north: 54.50 }, // Szczecin Lagoon / Pomeranian Bay
  { west: 19.15, south: 54.15, east: 20.2, north: 54.65 }, // Vistula Lagoon
  { west: -5, south: 50, east: 13.5, north: 62 }, // North Sea / Skagerrak approaches
  // Great Lakes / Caspian / Black Sea cores
  { west: -93, south: 41, east: -75, north: 49.5 },
  { west: 46, south: 36, east: 55, north: 48 },
  { west: 27, south: 40.5, east: 42, north: 47.5 },
  // Mediterranean open water
  { west: 0, south: 32, east: 37, north: 42 },
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
  // Hard northern cutoff for Polish coast
  if (lat >= 54.15 && lon >= 13.2 && lon <= 22.5) return false;
  return pointInRing(lon, lat, POLAND_LAND);
}

/**
 * Global heuristic: drop obvious ocean / sea centres.
 * Used for world demo hexes. Not a full coastline product.
 */
export function isLikelyLand(lat: number, lon: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat < -60 || lat > 78) return false; // Antarctica fringe / high Arctic ice
  if (inAnyWater(lon, lat)) return false;
  // Europe Baltic strip always water for our viz
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
