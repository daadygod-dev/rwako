"use client";

export const dynamic = "force-dynamic";

import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { geoGraticule, geoMercator, geoPath } from "d3-geo";
import { Chip, ListBox, Select } from "@heroui/react";
import { api, type District } from "@/lib/api";
import { useUI } from "@/lib/store";
import { ErrorState, PageTitle } from "@/components/DataStates";
import { MapSkeleton } from "@/components/Skeletons";
import { gapColor, quantileBins, fmt } from "@/lib/viz";

export default function MapPage() {
  const store = useUI();
  const mapRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [activeBin, setActiveBin] = useState<number | null>(null);

  const geoQ = useQuery({ queryKey: ["geo"], queryFn: api.geo });
  const districtsQ = useQuery({ queryKey: ["districts"], queryFn: api.districts });
  const indicatorsQ = useQuery({ queryKey: ["indicators"], queryFn: api.indicators });
  const idxQ = useQuery({
    queryKey: ["index", store.weights],
    queryFn: () => api.index(store.weights),
    placeholderData: (prev) => prev,
  });

  const available = (indicatorsQ.data ?? []).filter((i) => i.availability.available);
  const activeMetric =
    store.metric && available.some((i) => i.code === store.metric) ? store.metric : "priority_index";
  const labelOf = (code: string) => indicatorsQ.data?.find((i) => i.code === code)?.label ?? code;

  const projection = useMemo(() => {
    if (!geoQ.data) return null;
    return geoMercator().fitSize([760, 560], geoQ.data as never);
  }, [geoQ.data]);

  const graticulePath = useMemo(() => {
    if (!projection) return "";
    return geoPath(projection)(geoGraticule().step([0.5, 0.5])() as never) ?? "";
  }, [projection]);

  const dark = store.theme === "dark";
  const ocean = dark ? "#141D28" : "#D9E8F3";
  const graticuleStroke = dark ? "rgba(255,255,255,0.10)" : "rgba(30,60,90,0.12)";

  const provinces = useMemo(
    () => [...new Set((districtsQ.data ?? []).map((d) => d.province))].sort(),
    [districtsQ.data],
  );

  // unified per-district view model: deprivation t, gaps, rank
  const rows = useMemo(() => {
    const ranking = idxQ.data?.ranking ?? [];
    const byPcode = new Map(ranking.map((r) => [r.adm2_pcode, r]));
    const valuesByPcode = new Map(districtsQ.data?.map((d) => [d.adm2_pcode, d.values]) ?? []);
    const vals = ranking.map((r) => r.priority_index);
    const lo = vals.length ? Math.min(...vals) : 0;
    const hi = vals.length ? Math.max(...vals) : 1;
    return (districtsQ.data ?? []).map((d) => {
      const row = byPcode.get(d.adm2_pcode);
      const t = row && hi > lo ? (row.priority_index - lo) / (hi - lo) : row ? 0.5 : null;
      const gaps = idxQ.data?.gaps[d.adm2_pcode] ?? {};
      const topGaps = Object.entries(gaps)
        .filter(([, v]) => v != null)
        .sort((a, b) => (b[1] as number) - (a[1] as number))
        .slice(0, 3) as [string, number][];
      return { ...d, row, t, topGaps, values: valuesByPcode.get(d.adm2_pcode) ?? {} };
    });
  }, [districtsQ.data, idxQ.data]);

  const byPcode = useMemo(() => new Map(rows.map((r) => [r.adm2_pcode, r])), [rows]);
  // 5 bins → 6 edges: [min, ...4 quantile cuts, max]
  const edges = useMemo(() => {
    const vals = rows.flatMap((r) => (r.row ? [r.row.priority_index] : []));
    if (vals.length === 0) return null;
    return [Math.min(...vals), ...quantileBins(vals, 5), Math.max(...vals)];
  }, [rows]);
  const binOf = (v: number) => {
    if (!edges) return -1;
    for (let i = 0; i < 5; i++) if (v <= edges[i + 1]) return i;
    return 4;
  };

  const visible = rows.filter(
    (d) =>
      (!store.province || d.province === store.province) &&
      (activeBin == null || (d.row && binOf(d.row.priority_index) === activeBin)),
  );
  const visiblePcodes = new Set(visible.map((r) => r.adm2_pcode));
  const ranked = [...visible].sort((a, b) => (b.row?.priority_index ?? -1) - (a.row?.priority_index ?? -1));
  const hoveredRow = hovered ? byPcode.get(hovered) : undefined;

  const onMove = (e: React.MouseEvent) => {
    const rect = mapRef.current?.getBoundingClientRect();
    if (rect) setCursor({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  if (geoQ.isLoading || idxQ.isLoading)
    return (
      <div>
        <PageTitle
          title="Map & ranking"
          subtitle="Darker red = more deprived. Hover any district — map and list move together. Select a district for its full profile."
        />
        <MapSkeleton />
      </div>
    );
  if (geoQ.error) return <ErrorState error={geoQ.error} onRetry={() => geoQ.refetch()} />;
  if (districtsQ.error)
    return <ErrorState error={districtsQ.error} onRetry={() => districtsQ.refetch()} />;

  return (
    <div>
      <PageTitle
        title="Map & ranking"
        subtitle="Darker red = more deprived. Hover any district — map and list move together. Select a district for its full profile."
      />

      {/* Controls: metric + provinces + legend */}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-3">
        <Select
          className="w-64"
          variant="secondary"
          aria-label="Map metric"
          selectedKey={activeMetric}
          onSelectionChange={(key) => {
            if (key != null) store.setMetric(String(key));
          }}
          disabledKeys={(indicatorsQ.data ?? []).filter((i) => !i.availability.available).map((i) => i.code)}
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              <ListBox.Item id="priority_index" textValue="Priority index (composite)">
                Priority index (composite)
                <ListBox.ItemIndicator />
              </ListBox.Item>
              {(indicatorsQ.data ?? []).map((i) => (
                <ListBox.Item key={i.code} id={i.code} textValue={i.label}>
                  {i.label}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Province filter">
          <button
            onClick={() => store.setProvince(null)}
            className="rounded-md px-2.5 py-1.5 text-xs font-medium transition-opacity hover:opacity-75"
            style={
              store.province == null
                ? { background: "var(--g-color-base-brand)", color: "var(--g-color-private-brand-1000-solid)" }
                : { background: "var(--g-color-base-selection)", color: "var(--rc-fg)" }
            }
          >
            All
          </button>
          {provinces.map((p) => (
            <button
              key={p}
              onClick={() => store.setProvince(store.province === p ? null : p)}
              className="rounded-md px-2.5 py-1.5 text-xs font-medium transition-opacity hover:opacity-75"
              style={
                store.province === p
                  ? { background: "var(--g-color-base-brand)", color: "var(--g-color-private-brand-1000-solid)" }
                  : { background: "var(--g-color-base-selection)", color: "var(--rc-fg)" }
              }
            >
              {p.replace(" Province", "").replace("City of ", "")}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5" role="group" aria-label="Deprivation bins">
          <span className="text-xs rc-muted">Bins:</span>
          {edges != null &&
            [0, 1, 2, 3, 4].map((b) => {
              const from = edges[b];
              const to = edges[b + 1];
              return (
                <button
                  key={b}
                  title={`${from.toFixed(2)} – ${to.toFixed(2)}: select to isolate`}
                  onClick={() => setActiveBin((prev) => (prev === b ? null : b))}
                  className="h-5 w-8 rounded transition-opacity hover:opacity-75"
                  style={{
                    background: gapColor((b + 0.5) / 5),
                    outline: activeBin === b ? "2px solid var(--g-color-text-brand)" : "none",
                    outlineOffset: 1,
                    opacity: activeBin == null || activeBin === b ? 1 : 0.35,
                  }}
                />
              );
            })}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        {/* Map */}
        <div
          ref={mapRef}
          className="rc-card relative overflow-hidden p-2"
          onMouseMove={onMove}
          onMouseLeave={() => {
            setHovered(null);
            setCursor(null);
          }}
        >
          {projection && (
            <svg viewBox="0 0 760 560" className="w-full rounded-lg">
              <defs>
                <clipPath id="rwanda-clip">
                  <rect x={0} y={0} width={760} height={560} rx={8} />
                </clipPath>
                <filter id="land-lift" x="-10%" y="-10%" width="120%" height="120%">
                  <feDropShadow dx={0} dy={3} stdDeviation={5} floodColor="#0B1520" floodOpacity={0.28} />
                </filter>
              </defs>

              {/* ocean */}
              <rect x={0} y={0} width={760} height={560} rx={8} fill={ocean} />

              <g clipPath="url(#rwanda-clip)">
                {/* graticule */}
                <path d={graticulePath} fill="none" stroke={graticuleStroke} strokeWidth={0.8} />
                {/* landmass */}
                <g filter="url(#land-lift)">
                  {geoQ.data!.features.map((f) => {
                    const pcode = f.properties.adm2_pcode;
                    const r = byPcode.get(pcode);
                    const dimmed = !visiblePcodes.has(pcode);
                    const isHover = hovered === pcode;
                    return (
                      <path
                        key={pcode}
                        d={geoPath(projection)(f as never) ?? ""}
                        fill={dimmed ? "oklch(88% 0.01 90)" : gapColor(r?.t)}
                        stroke={isHover ? "var(--g-color-text-brand)" : "rgba(255,255,255,0.85)"}
                        strokeWidth={isHover ? 2.2 : 0.7}
                        className="cursor-pointer"
                        opacity={dimmed ? 0.35 : 1}
                        onClick={() => pcode && store.openDistrict(pcode)}
                        onMouseEnter={() => setHovered(pcode)}
                      />
                    );
                  })}
                </g>
              </g>
            </svg>
          )}

          {/* north arrow — Mercator keeps north up */}
          <div
            className="pointer-events-none absolute right-4 top-4 flex flex-col items-center rounded-md px-2 py-1.5 text-xs font-semibold"
            style={{ background: "color-mix(in srgb, var(--g-color-base-background) 82%, transparent)", color: "var(--rc-fg)" }}
            aria-hidden="true"
          >
            <span className="text-base leading-none">↑</span>
            <span>N</span>
          </div>

          {/* Hover card — live district data attached to the cursor */}
          {hoveredRow && cursor && (
            <div
              className="rc-card pointer-events-none absolute z-10 w-60 p-3"
              style={{ left: Math.min(cursor.x + 16, 500), top: Math.max(cursor.y - 20, 8) }}
            >
              <p className="text-sm font-semibold" style={{ color: "var(--rc-fg)" }}>
                {hoveredRow.district}
              </p>
              <p className="text-xs rc-muted">
                {hoveredRow.province}
                {hoveredRow.row
                  ? ` · rank #${hoveredRow.row.rank} · index ${hoveredRow.row.priority_index.toFixed(3)}`
                  : " · no index yet"}
              </p>
              {hoveredRow.topGaps.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1.5">
                  {hoveredRow.topGaps.map(([code, v]) => (
                    <li key={code}>
                      <div className="flex items-baseline justify-between gap-2 text-xs">
                        <span className="truncate font-medium" style={{ color: "var(--rc-fg)" }}>
                          {labelOf(code)}
                        </span>
                        <span className="shrink-0 tabular-nums rc-muted">{v.toFixed(2)}</span>
                      </div>
                      <span
                        className="mt-0.5 block h-1 overflow-hidden rounded-full"
                        style={{ background: "var(--g-color-base-selection)" }}
                      >
                        <span
                          className="block h-full rounded-full"
                          style={{ width: `${Math.round(v * 100)}%`, background: gapColor(v) }}
                        />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-[11px] rc-muted">Select for full profile →</p>
            </div>
          )}
        </div>

        {/* Ranking */}
        <div className="flex max-h-[600px] flex-col">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">
              Ranking {store.province ? `· ${store.province}` : "· all provinces"}
            </h3>
            {activeBin != null && (
              <Chip size="sm" color="accent">
                Bin {activeBin + 1} isolated
              </Chip>
            )}
          </div>
          <div className="rc-card min-h-0 flex-1 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0" style={{ background: "var(--rc-surface)" }}>
                <tr className="text-left rc-muted">
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">District</th>
                  <th className="px-3 py-2 text-right font-medium">Index</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((r: District & { row?: { rank: number; priority_index: number } }) => (
                  <tr
                    key={r.adm2_pcode}
                    className="cursor-pointer border-t"
                    style={{
                      borderColor: "var(--rc-border)",
                      background: hovered === r.adm2_pcode ? "var(--g-color-base-selection)" : "transparent",
                    }}
                    onClick={() => store.openDistrict(r.adm2_pcode)}
                    onMouseEnter={() => setHovered(r.adm2_pcode)}
                    onMouseLeave={() => setHovered(null)}
                  >
                    <td className="px-3 py-2 rc-muted">{r.row?.rank ?? "—"}</td>
                    <td className="px-3 py-2">
                      <span className="block font-medium">{r.district}</span>
                      <span
                        className="mt-1 block h-1 overflow-hidden rounded-full"
                        style={{ background: "var(--g-color-base-selection)" }}
                      >
                        <span
                          className="block h-full rounded-full"
                          style={{
                            width: `${Math.round((r.row?.priority_index ?? 0) * 100)}%`,
                            background: gapColor(r.row?.priority_index ?? null),
                          }}
                        />
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(r.row?.priority_index, 3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
