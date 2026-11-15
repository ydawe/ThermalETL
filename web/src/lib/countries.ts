/** Approximate country bboxes [west, south, east, north] for crop / fitBounds.
 * Names match FIRMS country CSV archives where possible (underscored English).
 */

export type BBox = [number, number, number, number];

export interface CountryInfo {
  id: string;
  label: string;
  /** FIRMS archive name (underscored); null if not a FIRMS country file. */
  firms?: string | null;
  bbox: BBox;
}

export const COUNTRIES: CountryInfo[] = [
  { id: "world", label: "Whole world", firms: null, bbox: [-180, -56, 180, 72] },
  // Contiguous US only for fitBounds (Alaska/Hawaii not in this crop).
  { id: "united_states", label: "United States", firms: "United_States", bbox: [-125, 24, -66, 49.4] },
  // View bbox includes southern Ontario; hex filter uses inCountry() (not the raw box).
  { id: "canada", label: "Canada", firms: "Canada", bbox: [-141, 41.7, -52, 70] },
  { id: "mexico", label: "Mexico", firms: "Mexico", bbox: [-118, 14, -86, 33] },
  { id: "brazil", label: "Brazil", firms: "Brazil", bbox: [-74, -34, -34, 5] },
  { id: "argentina", label: "Argentina", firms: "Argentina", bbox: [-74, -56, -53, -21] },
  { id: "chile", label: "Chile", firms: "Chile", bbox: [-76, -56, -66, -17] },
  { id: "bolivia", label: "Bolivia", firms: "Bolivia", bbox: [-70, -23, -57, -9] },
  { id: "colombia", label: "Colombia", firms: "Colombia", bbox: [-79, -5, -66, 13] },
  { id: "peru", label: "Peru", firms: "Peru", bbox: [-82, -19, -68, 0] },
  { id: "australia", label: "Australia", firms: "Australia", bbox: [112, -44, 154, -10] },
  { id: "indonesia", label: "Indonesia", firms: "Indonesia", bbox: [95, -11, 141, 6] },
  { id: "india", label: "India", firms: "India", bbox: [68, 6, 98, 36] },
  { id: "china", label: "China", firms: "China", bbox: [73, 18, 135, 54] },
  { id: "russia", label: "Russia", firms: "Russia", bbox: [27, 41, 180, 78] },
  { id: "kazakhstan", label: "Kazakhstan", firms: "Kazakhstan", bbox: [46, 40, 88, 56] },
  { id: "mongolia", label: "Mongolia", firms: "Mongolia", bbox: [87, 41, 120, 52] },
  { id: "poland", label: "Poland", firms: "Poland", bbox: [14, 49, 24.5, 55] },
  { id: "ukraine", label: "Ukraine", firms: "Ukraine", bbox: [22, 44, 41, 53] },
  { id: "romania", label: "Romania", firms: "Romania", bbox: [20, 43.5, 30, 48.5] },
  { id: "germany", label: "Germany", firms: "Germany", bbox: [5.8, 47.2, 15.1, 55.1] },
  { id: "france", label: "France", firms: "France", bbox: [-5.5, 41.3, 10, 51.2] },
  { id: "spain", label: "Spain", firms: "Spain", bbox: [-10, 35.9, 4.5, 44] },
  { id: "portugal", label: "Portugal", firms: "Portugal", bbox: [-9.6, 36.9, -6.1, 42.2] },
  { id: "italy", label: "Italy", firms: "Italy", bbox: [6.6, 36.6, 18.6, 47.1] },
  { id: "greece", label: "Greece", firms: "Greece", bbox: [19.3, 34.8, 29.7, 41.8] },
  { id: "turkey", label: "Turkey", firms: "Turkey", bbox: [25.6, 35.8, 45, 42.3] },
  { id: "united_kingdom", label: "United Kingdom", firms: "United_Kingdom", bbox: [-8.7, 49.8, 1.8, 59] },
  { id: "south_africa", label: "South Africa", firms: "South_Africa", bbox: [16, -35, 33, -22] },
  { id: "angola", label: "Angola", firms: "Angola", bbox: [11.5, -18.1, 24.1, -4.3] },
  { id: "drc", label: "DR Congo", firms: "Democratic_Republic_of_the_Congo", bbox: [12, -13.5, 31.5, 5.5] },
  { id: "zambia", label: "Zambia", firms: "Zambia", bbox: [21.9, -18.1, 33.7, -8.2] },
  { id: "mozambique", label: "Mozambique", firms: "Mozambique", bbox: [30.1, -26.9, 40.9, -10.4] },
  { id: "madagascar", label: "Madagascar", firms: "Madagascar", bbox: [43, -25.7, 50.6, -11.9] },
  { id: "ethiopia", label: "Ethiopia", firms: "Ethiopia", bbox: [32.9, 3.3, 48, 14.9] },
  { id: "kenya", label: "Kenya", firms: "Kenya", bbox: [33.9, -4.8, 42, 5.1] },
  { id: "nigeria", label: "Nigeria", firms: "Nigeria", bbox: [2.6, 4.2, 14.8, 13.9] },
  { id: "ghana", label: "Ghana", firms: "Ghana", bbox: [-3.3, 4.7, 1.3, 11.2] },
  { id: "thailand", label: "Thailand", firms: "Thailand", bbox: [97.3, 5.6, 105.7, 20.5] },
  { id: "vietnam", label: "Vietnam", firms: "Vietnam", bbox: [102.1, 8.4, 109.6, 23.5] },
  { id: "myanmar", label: "Myanmar", firms: "Myanmar", bbox: [92.1, 9.5, 101.2, 28.6] },
  { id: "philippines", label: "Philippines", firms: "Philippines", bbox: [116.9, 4.6, 126.7, 21.2] },
  { id: "papua_new_guinea", label: "Papua New Guinea", firms: "Papua_New_Guinea", bbox: [140.8, -11.7, 156, -1] },
  { id: "japan", label: "Japan", firms: "Japan", bbox: [129, 30, 146, 46] },
  { id: "south_korea", label: "South Korea", firms: "South_Korea", bbox: [125.8, 33.1, 129.7, 38.7] },
];

export function countryById(id: string): CountryInfo | undefined {
  return COUNTRIES.find((c) => c.id === id);
}

export function inBBox(lat: number, lon: number, bbox: BBox): boolean {
  const [west, south, east, north] = bbox;
  if (west <= east) return lon >= west && lon <= east && lat >= south && lat <= north;
  // antimeridian
  return (lon >= west || lon <= east) && lat >= south && lat <= north;
}

/** Canada vs contiguous US share a long parallel at 49°N; a raw bbox always leaks. */
function inCanada(lat: number, lon: number): boolean {
  if (lon < -141 || lon > -52 || lat < 41.6 || lat > 84) return false;
  // Exclude Alaska (US) west of the Yukon/BC panhandle.
  if (lon < -130 && lat < 60) return false;
  if (lat >= 49) return true;
  // South of 49°: southern Ontario / Quebec only.
  if (lon >= -95 && lon <= -74) return true;
  // Vancouver Island / Lower Mainland tip.
  if (lon >= -129 && lon <= -122 && lat >= 48.2) return true;
  return false;
}

function inUnitedStates(lat: number, lon: number): boolean {
  // Contiguous US (demo crop). Exclude Canada north of ~49 and southern Ontario.
  if (lon < -125 || lon > -66 || lat < 24 || lat > 49.4) return false;
  if (lat >= 49) return false;
  // Keep northern US (MN/ND/MT/ME) but drop Canadian land south of 49 in ON/QC.
  if (lat >= 41.7 && lon >= -95 && lon <= -74 && lat >= 46.5) {
    // Rough: north of Great Lakes / St. Lawrence → Canada (ON/QC).
    // Keep US side: MI UP, NY, VT, NH, ME roughly south of border jogs.
    if (lon >= -83 && lon <= -74 && lat >= 45.0 && lat < 49) {
      // Eastern Ontario / southern Quebec vs NY/VT/NH/ME — approximate:
      // north of ~45° between -76 and -74 is often Canada; keep simple:
      if (lon <= -76.5 && lat >= 45.5) return false; // eastern Ontario
    }
    if (lon >= -95 && lon <= -83 && lat >= 48) return false; // near 49th west of lakes
  }
  return true;
}

/**
 * Country membership for crop/filter. Uses refined rules where a bbox would
 * pull in a neighboring country (Canada ↔ USA). Falls back to bbox otherwise.
 */
export function inCountry(lat: number, lon: number, countryId: string, bbox: BBox): boolean {
  if (countryId === "canada") return inCanada(lat, lon);
  if (countryId === "united_states") return inUnitedStates(lat, lon);
  return inBBox(lat, lon, bbox);
}

/** Lon/lat ring [lon, lat][] for the red selection outline (closed). */
export type LonLat = [number, number];

function bboxRing(bbox: BBox): LonLat[] {
  const [w, s, e, n] = bbox;
  return [
    [w, s],
    [e, s],
    [e, n],
    [w, n],
    [w, s],
  ];
}

/** Simplified Canada outline: 49°N west + southern Ontario / Quebec jog. */
function canadaOutline(): LonLat[] {
  return [
    [-141, 60],
    [-141, 69.5],
    [-120, 70],
    [-95, 70],
    [-80, 73],
    [-60, 70],
    [-52, 60],
    [-52, 47],
    [-60, 47],
    [-65, 44],
    [-70, 45],
    [-74, 45],
    [-76.5, 44],
    [-79, 43],
    [-82.5, 41.7],
    [-83.5, 42],
    [-84.5, 45.5],
    [-87, 48],
    [-90, 48],
    [-95, 49],
    [-125, 49],
    [-130, 54],
    [-135, 58],
    [-141, 60],
  ];
}

export function countryOutline(countryId: string, bbox: BBox): LonLat[] {
  if (countryId === "canada") return canadaOutline();
  return bboxRing(bbox);
}
