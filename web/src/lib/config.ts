/** Region folder under /public/data used when no ?region= is given. Switch to "poland" once backfill lands. */
export const DEFAULT_REGION = "sample";

/** Regions the app is allowed to load via ?region=. Missing folders fall back to an error state. */
export const KNOWN_REGIONS = ["sample", "poland"] as const;

export const BASEMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

export const ATTRIBUTION =
  "Data: NASA FIRMS (MODIS C6.1, VIIRS S-NPP). Not affiliated with or endorsed by NASA.";

export function resolveRegion(search: string | null | undefined): string {
  if (!search) return DEFAULT_REGION;
  const value = new URLSearchParams(search).get("region")?.trim().toLowerCase();
  if (value && (KNOWN_REGIONS as readonly string[]).includes(value)) return value;
  return DEFAULT_REGION;
}

export function dataUrl(region: string, file: string): string {
  return `/data/${region}/${file}`;
}
