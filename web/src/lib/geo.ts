import { cellToLatLng, getHexagonEdgeLengthAvg, greatCircleDistance, gridDisk, latLngToCell, polygonToCells, UNITS } from "h3-js";

/** [lon, lat] pairs, GeoJSON order. */
export type LonLat = [number, number];

/**
 * Cells covering a polygon. polygonToCells only returns cells whose centre is
 * inside the shape, so tiny shapes would select nothing — we always add the
 * cells under the vertices and the centroid as well.
 */
export function cellsInPolygon(ring: LonLat[], res: number): Set<string> {
  const latLng = ring.map(([lon, lat]) => [lat, lon]);
  const out = new Set<string>(polygonToCells(latLng, res));
  if (out.size === 0) {
    const cLon = ring.reduce((a, p) => a + p[0], 0) / ring.length;
    const cLat = ring.reduce((a, p) => a + p[1], 0) / ring.length;
    out.add(latLngToCell(cLat, cLon, res));
  }
  return out;
}

/** Cells whose centre lies within radiusKm of (lat, lon), plus the cell containing the point. */
export function cellsInRadius(lat: number, lon: number, radiusKm: number, res: number): Set<string> {
  const origin = latLngToCell(lat, lon, res);
  const spacing = getHexagonEdgeLengthAvg(res, UNITS.km) * Math.sqrt(3);
  const k = Math.max(0, Math.ceil(radiusKm / spacing) + 1);
  const out = new Set<string>([origin]);
  for (const cell of gridDisk(origin, k)) {
    const [cLat, cLon] = cellToLatLng(cell);
    if (greatCircleDistance([lat, lon], [cLat, cLon], UNITS.km) <= radiusKm) out.add(cell);
  }
  return out;
}

export function circlePolygon(lat: number, lon: number, radiusKm: number, steps = 64): LonLat[] {
  const R = 6371;
  const d = radiusKm / R;
  const φ1 = (lat * Math.PI) / 180;
  const λ1 = (lon * Math.PI) / 180;
  const ring: LonLat[] = [];
  for (let i = 0; i <= steps; i++) {
    const θ = (2 * Math.PI * i) / steps;
    const φ2 = Math.asin(Math.sin(φ1) * Math.cos(d) + Math.cos(φ1) * Math.sin(d) * Math.cos(θ));
    const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(d) * Math.cos(φ1), Math.cos(d) - Math.sin(φ1) * Math.sin(φ2));
    ring.push([(λ2 * 180) / Math.PI, (φ2 * 180) / Math.PI]);
  }
  return ring;
}

export function rectPolygon(a: LonLat, b: LonLat): LonLat[] {
  const [x1, y1] = a;
  const [x2, y2] = b;
  return [
    [x1, y1],
    [x2, y1],
    [x2, y2],
    [x1, y2],
    [x1, y1],
  ];
}
