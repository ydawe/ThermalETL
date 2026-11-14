import { describe, expect, it } from "vitest";
import { cellsInPolygon, closeRing, rectPolygon, type LonLat } from "./geo";

describe("rectPolygon", () => {
  it("builds a closed axis-aligned ring", () => {
    const ring = rectPolygon([20, 50], [21, 51]);
    expect(ring).toEqual([
      [20, 50],
      [21, 50],
      [21, 51],
      [20, 51],
      [20, 50],
    ]);
  });
});

describe("closeRing", () => {
  it("appends the first point when open", () => {
    expect(closeRing([
      [0, 0],
      [1, 0],
      [1, 1],
    ])).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ]);
  });

  it("leaves an already-closed ring alone", () => {
    const ring: LonLat[] = [
      [0, 0],
      [1, 0],
      [0, 0],
    ];
    expect(closeRing(ring)).toBe(ring);
  });
});

describe("cellsInPolygon", () => {
  const res = 5;

  it("selects hexes for a Warsaw-area rectangle", () => {
    const ring = rectPolygon([20.9, 52.15], [21.2, 52.35]);
    const cells = cellsInPolygon(ring, res);
    expect(cells.size).toBeGreaterThan(0);
  });

  it("still returns cells for a tiny polygon via vertices/centroid", () => {
    // ~100 m box — centres may miss, vertices must still hit
    const ring = rectPolygon([21.0, 52.229], [21.001, 52.23]);
    const cells = cellsInPolygon(ring, res);
    expect(cells.size).toBeGreaterThan(0);
  });

  it("returns empty for fewer than 3 points", () => {
    expect(cellsInPolygon([[0, 0], [1, 1]], res).size).toBe(0);
  });
});
