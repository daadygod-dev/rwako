// Typed client for the Rwanda Compass API (/api/v1).
// Mirrors server/schemas.py — keep both in sync when the contract changes.

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

export type Availability = {
  available: boolean;
  coverage_pct: number;
  n_districts: number;
  reason: string | null;
};

export type Indicator = {
  code: string;
  label: string;
  unit: string;
  direction: "worse_high" | "better_high";
  pillar: string;
  served_from: "derived" | "survey";
  source: string;
  default_weight: number;
  availability: Availability;
};

export type District = {
  district: string;
  adm2_pcode: string;
  province: string;
  area_km2: number | null;
  values: Record<string, number | null>;
};

export type IndexRow = { rank: number; district: string; adm2_pcode: string; province: string; priority_index: number };
export type IndexResponse = {
  as_of: string;
  indicators_used: string[];
  gaps: Record<string, Record<string, number | null>>;
  ranking: IndexRow[];
};

export type AllocationRow = {
  rank: number; district: string; adm2_pcode: string; province: string;
  priority_index: number; allocation_rwf_m: number; share_pct: number;
};
export type AllocationResponse = { as_of: string; budget_rwf_m: number; floor_pct: number; rows: AllocationRow[] };

export type TypologiesResponse = {
  as_of: string;
  indicators_used: string[];
  silhouette: number;
  members: { district: string; adm2_pcode: string; province: string; cluster: number; x: number; y: number }[];
  profiles: { cluster: number; severity: number; mean_gaps: Record<string, number> }[];
};

export type DriversResponse = {
  as_of: string;
  target: string;
  target_label: string;
  r2: number;
  n_features: number;
  drivers: { code: string; label: string; importance: number }[];
  caveat: string;
};

export type PredictResponse = {
  as_of: string;
  target: string;
  target_label: string;
  unit: string;
  district: string;
  adm2_pcode: string;
  baseline: number;
  predicted: number;
  delta: number;
  clipped: string[];
  cv_r2: number;
  cv_mae: number;
  n_rows: number;
  n_features: number;
  top_drivers: { code: string; label: string; importance: number }[];
  feature_ranges: Record<string, { min: number; max: number; current: number }>;
  caveat: string;
};

export type DistrictDetail = {
  as_of: string; district: string; adm2_pcode: string; province: string;
  priority_index: number; rank: number; of: number; median: number;
  values: Record<string, number | null>;
  gaps: Record<string, number | null>;
  median_gaps: Record<string, number | null>;
  neighbours: string[];
  facilities: number; schools: number;
};

export type Manifest = {
  as_of: string; n_districts: number; n_facilities: number;
  sources: Record<string, Record<string, string>>; notes: string[];
};

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type VisualSpec =
  | { kind: "bars"; title: string; unit?: string; items: { label: string; value: number }[] }
  | { kind: "groupedBars"; title: string; unit?: string; categories: string[]; series: { name: string; values: (number | null)[] }[] }
  | { kind: "donut"; title: string; unit?: string; slices: { label: string; value: number }[] }
  | { kind: "table"; title: string; columns: string[]; rows: (string | number | null)[][] };

export type AskResponse = {
  as_of: string;
  answer: string;
  sources: string[];
  suggested_weights: Record<string, number> | null;
  weights_note: string | null;
  visual: VisualSpec | null;
  follow_ups: string[];
  recommendations: { text: string; href: string | null }[];
};

export class ApiError extends Error {
  constructor(readonly status: number, readonly detail: string) { super(detail); }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try { detail = (await res.json())?.detail ?? detail; } catch { /* keep default */ }
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () => request<{ status: string; as_of: string; n_districts: number }>("/api/v1/health"),
  manifest: () => request<Manifest>("/api/v1/manifest"),
  indicators: () => request<Indicator[]>("/api/v1/indicators"),
  geo: () => request<GeoJson>("/api/v1/geo"),
  districts: () => request<District[]>("/api/v1/districts"),
  districtDetail: (pcode: string) => request<DistrictDetail>(`/api/v1/districts/${pcode}`),
  facilities: (kind: "health" | "education") =>
    request<{ district: string; kind: string; type: string; name: string; lon: number; lat: number }[]>(
      `/api/v1/facilities?kind=${kind}`),
  index: (weights: Record<string, number>) =>
    request<IndexResponse>("/api/v1/analysis/index", { method: "POST", body: JSON.stringify({ weights }) }),
  allocate: (budget_rwf_m: number, weights: Record<string, number>, floor_pct: number) =>
    request<AllocationResponse>("/api/v1/analysis/allocate", {
      method: "POST", body: JSON.stringify({ budget_rwf_m, weights, floor_pct }),
    }),
  typologies: (k: number) =>
    request<TypologiesResponse>("/api/v1/analysis/typologies", { method: "POST", body: JSON.stringify({ k }) }),
  drivers: (target: string) =>
    request<DriversResponse>("/api/v1/analysis/drivers", { method: "POST", body: JSON.stringify({ target }) }),
  predict: (target: string, adm2_pcode: string, scenario: Record<string, number>) =>
    request<PredictResponse>("/api/v1/analysis/predict", {
      method: "POST", body: JSON.stringify({ target, adm2_pcode, scenario }),
    }),
  ask: (message: string, history: ChatMessage[], weights: Record<string, number>) =>
    request<AskResponse>("/api/v1/analysis/ask", {
      method: "POST",
      body: JSON.stringify({ message, history, weights }),
    }),
};

// GeoJSON (subset we use)
export type GeoJson = {
  type: "FeatureCollection";
  features: {
    type: "Feature";
    geometry: { type: "Polygon" | "MultiPolygon"; coordinates: number[][][] | number[][][][] };
    properties: { shapeName: string; adm2_pcode: string; province: string; [k: string]: unknown };
  }[];
};
