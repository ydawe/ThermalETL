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
  { id: "united_states", label: "United States", firms: "United_States", bbox: [-125, 24, -66, 50] },
  { id: "canada", label: "Canada", firms: "Canada", bbox: [-141, 41, -52, 70] },
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
