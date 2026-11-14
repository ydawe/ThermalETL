import { dataUrl } from "./config";
import type { CoefFile, Dataset, HexesFile, Meta, MonthlyRow } from "./types";

export class DataError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "DataError";
  }
}

async function fetchOk(url: string, signal?: AbortSignal): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { signal });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new DataError(`Network error while loading ${url}`);
  }
  if (!res.ok) throw new DataError(`Could not load ${url} (HTTP ${res.status})`, res.status);
  return res;
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetchOk(url, signal);
  return (await res.json()) as T;
}

function isGzip(bytes: Uint8Array): boolean {
  return bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

async function gunzip(bytes: Uint8Array): Promise<string> {
  if (typeof DecompressionStream !== "undefined") {
    try {
      const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"));
      return await new Response(stream).text();
    } catch {
      // fall through to pako
    }
  }
  const { ungzip } = await import("pako");
  return ungzip(bytes, { to: "string" });
}

/**
 * Fetches a .json.gz file. Some static hosts already send it with
 * Content-Encoding: gzip, in which case the browser hands us plain JSON.
 */
async function fetchGzJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetchOk(url, signal);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const text = isGzip(bytes) ? await gunzip(bytes) : new TextDecoder().decode(bytes);
  return JSON.parse(text) as T;
}

interface MonthlyFile {
  fields: string[];
  rows: unknown[][];
}

export const monthKey = (year: number, month: number) => year * 12 + (month - 1);
export const keyYear = (key: number) => Math.floor(key / 12);
export const keyMonth = (key: number) => (key % 12) + 1;

function indexMonthly(file: MonthlyFile): Map<string, Map<number, MonthlyRow>> {
  const col = (name: string) => {
    const i = file.fields.indexOf(name);
    if (i < 0) throw new DataError(`monthly.json.gz is missing the "${name}" column`);
    return i;
  };
  const iH3 = col("h3");
  const iY = col("year");
  const iM = col("month");
  const iMod = col("modis_n");
  const iVii = col("viirs_n");
  const iHarm = col("harm_n");
  const out = new Map<string, Map<number, MonthlyRow>>();
  for (const r of file.rows) {
    const row: MonthlyRow = {
      h3: String(r[iH3]),
      year: Number(r[iY]),
      month: Number(r[iM]),
      modis_n: Number(r[iMod]) || 0,
      viirs_n: Number(r[iVii]) || 0,
      harm_n: Number(r[iHarm]) || 0,
    };
    let byMonth = out.get(row.h3);
    if (!byMonth) {
      byMonth = new Map();
      out.set(row.h3, byMonth);
    }
    byMonth.set(monthKey(row.year, row.month), row);
  }
  return out;
}

/** Small files first so the UI can render the map while the monthly table is still decompressing. */
export async function loadMeta(region: string, signal?: AbortSignal): Promise<Meta> {
  return fetchJson<Meta>(dataUrl(region, "meta.json"), signal);
}

export async function loadDataset(region: string, meta: Meta, signal?: AbortSignal): Promise<Dataset> {
  if (meta.files?.tiled) {
    throw new DataError("This region uses tiled data, which this build does not read yet.");
  }
  const [hexes, coef, monthly] = await Promise.all([
    fetchJson<HexesFile>(dataUrl(region, "hexes.json"), signal),
    fetchJson<CoefFile>(dataUrl(region, "coef.json"), signal),
    fetchGzJson<MonthlyFile>(dataUrl(region, "monthly.json.gz"), signal),
  ]);
  return { region, meta, hexes: hexes.hexes, coef, monthly: indexMonthly(monthly) };
}
