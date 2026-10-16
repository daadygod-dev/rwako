"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Button, Card } from "@heroui/react";
import { api } from "@/lib/api";
import { useUI } from "@/lib/store";
import { ErrorState, DataNeeded, PageTitle } from "@/components/DataStates";
import { ChartSkeleton, StatCardsSkeleton } from "@/components/Skeletons";
import { gapColor, fmt } from "@/lib/viz";

function downloadCsv(rows: { rank: number; district: string; province: string; priority_index: number; allocation_rwf_m: number; share_pct: number }[]) {
  const header = "rank,district,province,priority_index,allocation_rwf_m,share_pct";
  const body = rows.map((r) => [r.rank, `"${r.district}"`, `"${r.province}"`, r.priority_index, r.allocation_rwf_m, r.share_pct].join(",")).join("\n");
  const blob = new Blob([`${header}\n${body}`], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "rwanda-compass-allocation.csv"; a.click();
  URL.revokeObjectURL(url);
}

export default function SimulatorPage() {
  const store = useUI();
  const [view, setView] = useState<"chart" | "table">("chart");
  const [envelope, setEnvelope] = useState(String(store.budgetRwfM));
  const allocQ = useQuery({
    queryKey: ["allocate", store.budgetRwfM, store.floorPct, store.weights],
    queryFn: () => api.allocate(store.budgetRwfM, store.weights, store.floorPct),
    placeholderData: (prev) => prev,
  });

  const rows = allocQ.data?.rows ?? [];
  const top5Share = rows.slice(0, 5).reduce((s, r) => s + r.share_pct, 0);
  const total = rows.reduce((s, r) => s + r.allocation_rwf_m, 0);
  const top1 = rows[0];

  const commitEnvelope = () => {
    const v = Number(envelope);
    if (Number.isFinite(v) && v > 0) store.setBudget(v);
    else setEnvelope(String(store.budgetRwfM));
  };

  return (
    <div>
      <PageTitle
        title="Budget simulator"
        subtitle="Split any envelope proportionally to need, with a floor no district falls below — then export the table."
      />

      {/* Live summary strip */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <Card.Header>
            <Card.Title>{allocQ.data ? fmt(allocQ.data.budget_rwf_m, 0) : "—"}</Card.Title>
            <Card.Description>envelope (RWF millions)</Card.Description>
          </Card.Header>
        </Card>
        <Card>
          <Card.Header>
            <Card.Title>{rows.length > 0 ? `${top5Share.toFixed(1)}%` : "—"}</Card.Title>
            <Card.Description>goes to the top-5 districts</Card.Description>
          </Card.Header>
        </Card>
        <Card>
          <Card.Header>
            <Card.Title>{rows.length > 0 ? top1.district : "—"}</Card.Title>
            <Card.Description>
              {top1 ? `largest share · ${fmt(top1.allocation_rwf_m, 1)} RWF M` : "largest allocation"}
            </Card.Description>
          </Card.Header>
        </Card>
        <Card>
          <Card.Header>
            <Card.Title>{rows.length > 0 ? fmt(total, 1) : "—"}</Card.Title>
            <Card.Description>
              {allocQ.data ? `allocated of ${fmt(allocQ.data.budget_rwf_m, 1)} · sums exactly` : "allocated total"}
            </Card.Description>
          </Card.Header>
        </Card>
      </div>

      {/* Controls */}
      <div className="rc-card mb-4 grid gap-6 p-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-semibold">Envelope</span>
          <span className="rc-muted"> — total to split, in RWF millions</span>
          <input
            className="mt-2 block w-44 rounded-md px-3 py-2"
            style={{ background: "var(--g-color-base-selection)", color: "var(--rc-fg)" }}
            value={envelope}
            inputMode="decimal"
            onChange={(e) => setEnvelope(e.target.value)}
            onBlur={commitEnvelope}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            aria-label="Budget envelope in RWF millions"
          />
        </label>
        <div className="text-sm">
          <span className="font-semibold">Floor per district</span>
          <span className="rc-muted"> — <b>{store.floorPct}%</b> of an equal split, guaranteed minimum</span>
          <input type="range" min={0} max={50} step={1} className="rc-slider mt-3 block w-full max-w-72"
            value={store.floorPct} onChange={(e) => store.setFloor(Number(e.target.value))}
            aria-label="Per-district floor percent" />
        </div>
      </div>

      {/* Results */}
      {allocQ.isLoading ? (
        <>
          <div className="mb-4">
            <StatCardsSkeleton count={4} />
          </div>
          <ChartSkeleton height={420} />
        </>
      ) : allocQ.error ? <ErrorState error={allocQ.error} onRetry={() => allocQ.refetch()} /> :
        rows.length === 0 ? (
          <DataNeeded reason="No district qualifies for allocation yet — check indicator availability in /data." />
        ) : (
          <div className="rc-card flex flex-col p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">
                {view === "chart" ? `Allocation (RWF M) — top ${rows.length}` : `Allocation table (${rows.length})`}
              </h3>
              <div className="flex gap-2">
                <Button size="sm" variant={view === "chart" ? "secondary" : "tertiary"} onPress={() => setView("chart")}>
                  Chart
                </Button>
                <Button size="sm" variant={view === "table" ? "secondary" : "tertiary"} onPress={() => setView("table")}>
                  Table
                </Button>
                <Button size="sm" variant="tertiary" onPress={() => downloadCsv(rows)}>
                  Export CSV
                </Button>
              </div>
            </div>

            {view === "chart" ? (
              <div className="h-[480px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={rows} layout="vertical" margin={{ left: 80 }}>
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="district" width={120} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="allocation_rwf_m" radius={[0, 3, 3, 0]}
                      onClick={(d: { payload?: { adm2_pcode?: string } }) =>
                        d?.payload?.adm2_pcode && store.openDistrict(d.payload.adm2_pcode)}>
                      {rows.map((r) => <Cell key={r.adm2_pcode} fill={gapColor(r.priority_index)} cursor="pointer" />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="max-h-[480px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0" style={{ background: "var(--rc-surface)" }}>
                    <tr className="text-left rc-muted">
                      <th className="px-3 py-2 font-medium">#</th>
                      <th className="px-3 py-2 font-medium">District</th>
                      <th className="px-3 py-2 font-medium">Province</th>
                      <th className="px-3 py-2 text-right font-medium">Index</th>
                      <th className="px-3 py-2 text-right font-medium">RWF M</th>
                      <th className="px-3 py-2 text-right font-medium">Share %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.adm2_pcode} className="cursor-pointer border-t hover:opacity-80"
                        style={{ borderColor: "var(--rc-border)" }}
                        onClick={() => store.openDistrict(r.adm2_pcode)}>
                        <td className="px-3 py-2 rc-muted">{r.rank}</td>
                        <td className="px-3 py-2 font-medium">{r.district}</td>
                        <td className="px-3 py-2 rc-muted">{r.province}</td>
                        <td className="px-3 py-2 text-right">{fmt(r.priority_index, 3)}</td>
                        <td className="px-3 py-2 text-right">{fmt(r.allocation_rwf_m, 3)}</td>
                        <td className="px-3 py-2 text-right">{fmt(r.share_pct, 1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      <p className="mt-2 text-xs rc-muted">
        Shares follow each district&apos;s share of the total Priority Index · largest-remainder rounding keeps the table exact.
      </p>
    </div>
  );
}
