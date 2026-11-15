import { describe, expect, it } from "vitest";
import { filterLandHexes, isLikelyLand, isPolandLand } from "./landmask";

describe("isPolandLand", () => {
  it("keeps inland Warsaw", () => {
    expect(isPolandLand(52.23, 21.01)).toBe(true);
  });

  it("drops open Baltic and Gdańsk Bay", () => {
    expect(isPolandLand(55.2, 18.5)).toBe(false);
    expect(isPolandLand(54.55, 18.7)).toBe(false);
    expect(isPolandLand(54.4, 18.6)).toBe(false);
  });

  it("drops Szczecin Lagoon / Pomeranian Bay", () => {
    expect(isPolandLand(53.8, 14.4)).toBe(false);
    expect(isPolandLand(53.6, 14.5)).toBe(false);
  });
});

describe("isLikelyLand", () => {
  it("rejects mid-Atlantic and Baltic", () => {
    expect(isLikelyLand(30, -40)).toBe(false);
    expect(isLikelyLand(55, 18)).toBe(false);
  });

  it("keeps inland points including US Midwest (not Great Lakes water)", () => {
    expect(isLikelyLand(52.23, 21.01)).toBe(true);
    expect(isLikelyLand(-15, -48)).toBe(true); // Brazil inland-ish
    expect(isLikelyLand(41.88, -87.63)).toBe(true); // Chicago
    expect(isLikelyLand(40.71, -74.01)).toBe(true); // NYC
    expect(isLikelyLand(39.1, -94.6)).toBe(true); // Kansas City
    expect(isLikelyLand(34.05, -118.25)).toBe(true); // LA
  });

  it("still drops lake centres", () => {
    expect(isLikelyLand(47.5, -87.5)).toBe(false); // Lake Superior
  });
});

describe("filterLandHexes", () => {
  it("filters poland and world", () => {
    const hexes = [
      { h3: "a", lat: 52.23, lon: 21.01 },
      { h3: "b", lat: 55.2, lon: 18.5 },
      { h3: "c", lat: 53.7, lon: 14.5 },
    ];
    expect(filterLandHexes("poland", hexes).map((h) => h.h3)).toEqual(["a"]);
    expect(filterLandHexes("world", hexes).map((h) => h.h3)).toEqual(["a"]);
    expect(filterLandHexes("sample", hexes)).toHaveLength(3);
  });
});
