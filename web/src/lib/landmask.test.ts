import { describe, expect, it } from "vitest";
import { filterLandHexes, isPolandLand } from "./landmask";

describe("isPolandLand", () => {
  it("keeps inland Warsaw", () => {
    expect(isPolandLand(52.23, 21.01)).toBe(true);
  });

  it("drops open Baltic north of Gdańsk", () => {
    expect(isPolandLand(55.2, 18.5)).toBe(false);
  });

  it("drops the Bay of Puck / Gulf of Gdańsk", () => {
    expect(isPolandLand(54.55, 18.7)).toBe(false);
  });

  it("drops nearshore Baltic just north of Gdańsk", () => {
    expect(isPolandLand(54.5, 18.9)).toBe(false);
    expect(isPolandLand(54.4, 18.6)).toBe(false);
  });
});

describe("filterLandHexes", () => {
  it("filters only the poland region", () => {
    const hexes = [
      { h3: "a", lat: 52.23, lon: 21.01 },
      { h3: "b", lat: 55.2, lon: 18.5 },
    ];
    expect(filterLandHexes("poland", hexes).map((h) => h.h3)).toEqual(["a"]);
    expect(filterLandHexes("sample", hexes)).toHaveLength(2);
  });
});
