import { describe, expect, it } from "vitest";
import { latLngToCell } from "h3-js";
import { aggregateHexesToRes, targetResForZoom } from "./h3Zoom";

describe("targetResForZoom", () => {
  it("coarsens when zoomed out", () => {
    expect(targetResForZoom(2, 5)).toBe(2);
    expect(targetResForZoom(4, 5)).toBe(3);
    expect(targetResForZoom(6, 5)).toBe(4);
    expect(targetResForZoom(8, 5)).toBe(5);
  });
});

describe("aggregateHexesToRes", () => {
  it("sums children into the parent", () => {
    const a = latLngToCell(52.2, 21.0, 5);
    const b = latLngToCell(52.25, 21.05, 5);
    const out = aggregateHexesToRes(
      [
        { h3: a, total: 10, selected: true, active: false },
        { h3: b, total: 7, selected: false, active: true },
      ],
      4,
    );
    expect(out.length).toBeGreaterThanOrEqual(1);
    expect(out.reduce((s, h) => s + h.total, 0)).toBe(17);
    expect(out.some((h) => h.active)).toBe(true);
  });

  it("is a no-op at native resolution", () => {
    const a = latLngToCell(52.2, 21.0, 5);
    const rows = [{ h3: a, total: 3, selected: true, active: false }];
    expect(aggregateHexesToRes(rows, 5)).toEqual(rows);
  });
});
