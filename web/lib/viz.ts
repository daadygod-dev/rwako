// Shared viz helpers — one semantic language: worse = darker red.

export function gapColor(t: number | null | undefined): string {
  if (t == null || Number.isNaN(t)) return "oklch(75% 0.01 90)";
  const t1 = Math.min(1, Math.max(0, t));
  // light amber -> deep red (oklch lightness 88% -> 38%)
  const l = 88 - 50 * t1 + 0.0;
  return `oklch(${l}% ${0.05 + 0.15 * t1} 35)`;
}

export function quantileBins(values: number[], n = 5): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const cuts: number[] = [];
  for (let i = 1; i < n; i++) {
    const pos = (i / n) * (sorted.length - 1);
    const lo = Math.floor(pos), hi = Math.ceil(pos);
    cuts.push(sorted[lo] + (pos - lo) * (sorted[hi] - sorted[lo]));
  }
  return cuts;
}

export function binIndex(value: number, cuts: number[], min: number, max: number): number {
  for (let i = 0; i < cuts.length; i++) if (value <= cuts[i]) return i;
  return cuts.length;
}

export function relativeColor01(value: number, min: number, max: number, worse_high: boolean): number {
  if (max === min) return 0.5;
  const t = (value - Math.min(min, max)) / Math.abs(max - min);
  return worse_high ? t : 1 - t;
}

export const fmt = (v: number | null | undefined, digits = 1): string =>
  v == null ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: digits });
