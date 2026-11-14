export type Metric = "harm" | "modis" | "viirs";

export type KLevel = "hex" | "res4" | "res3" | "region" | "region_all" | "default";

export interface HexInfo {
  h3: string;
  lat: number;
  lon: number;
  modis_total: number;
  viirs_total: number;
  harm_total: number;
  median: number[];
  p90: number[];
}

export interface HexesFile {
  hexes: HexInfo[];
}

export interface CoefCell {
  k: number[];
  level: KLevel[];
  support: number[];
}

export interface CoefFile {
  regional: { by_month: (number | null)[]; support: number[]; overall: number | null };
  cells: Record<string, CoefCell>;
}

export interface ValidationStats {
  mae: number;
  rel_error: number;
  bias: number;
  pred_total: number;
}

export interface Meta {
  region: string;
  bbox: [number, number, number, number];
  h3_resolution: number;
  generated_at: string;
  data_source?: string;
  synthetic?: boolean;
  years: [number, number];
  calendar_years: number[];
  last_date: string;
  overlap_years: [number, number];
  min_support: number;
  harmonization: string;
  k_fallback: string[];
  counts: {
    detections_modis: number;
    detections_viirs: number;
    hexes: number;
    monthly_rows: number;
  };
  k_level_counts?: Record<string, number>;
  regional_k?: { overall: number | null; by_month: (number | null)[] };
  validation?: {
    holdout_year: number;
    n_cells_months: number;
    actual_viirs_total: number;
    hex_k: ValidationStats;
    regional_k: ValidationStats;
    mae_improvement_vs_regional: number;
  };
  files?: { tiled?: boolean };
}

export interface MonthlyRow {
  h3: string;
  year: number;
  month: number;
  modis_n: number;
  viirs_n: number;
  harm_n: number;
}

export interface Dataset {
  region: string;
  meta: Meta;
  hexes: HexInfo[];
  coef: CoefFile;
  /** h3 -> (year*12 + month-1) -> row */
  monthly: Map<string, Map<number, MonthlyRow>>;
}

/** Inclusive month range expressed as year*12 + (month-1). */
export interface MonthRange {
  from: number;
  to: number;
}

export type Selection =
  | { kind: "all" }
  | { kind: "shape"; label: string; polygon: [number, number][]; cells: Set<string> }
  | { kind: "circle"; label: string; lat: number; lon: number; radiusKm: number; polygon: [number, number][]; cells: Set<string> };
