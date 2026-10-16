"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Button, Card, Disclosure } from "@heroui/react";
import { api } from "@/lib/api";
import { useUI, presetBoost } from "@/lib/store";
import { ErrorState, PageTitle } from "@/components/DataStates";
import { ChartSkeleton, SliderListSkeleton, StatCardsSkeleton, TableSkeleton } from "@/components/Skeletons";
import { gapColor, fmt } from "@/lib/viz";

const PRESETS = ["balanced", "poverty", "education", "health"] as const;

function toUrlSync(weights: Record<string, number>): string {
  const q = Object.entries(weights).map(([k, v]) => `${k}:${v}`).join(",");
  return `?w=${encodeURIComponent(q)}`;
}

export default function IndexPage() {
  const store = useUI();
  const [view, setView] = useState<"chart" | "table">("chart");
  const [openPillars, setOpenPillars] = useState<string[]>([]);
  const indicatorsQ = useQuery({ queryKey: ["indicators"], queryFn: api.indicators });
  const indexQ = useQuery({
    queryKey: ["index", store.weights],
    queryFn: () => api.index(store.weights),
    placeholderData: (prev) => prev,
  });

  const indicators = indicatorsQ.data ?? [];
  const available = indicators.filter((i) => i.availability.available);

  // group indicators by pillar, catalog order preserved
  const pillars = useMemo(() => {
    const map = new Map<string, typeof indicators>();
    for (const i of indicators) {
      const list = map.get(i.pillar) ?? [];
      list.push(i);
      map.set(i.pillar, list);
    }
    return [...map.entries()];
  }, [indicators]);

  // initialize persisted weights with server defaults once, and open the first live pillar
  useEffect(() => {
    if (indicatorsQ.data && !store.weightsInitialized) {
      const defaults = Object.fromEntries(indicators.map((i) => [i.code, i.default_weight]));
      store.initWeights(defaults);
    }
    if (indicatorsQ.data && openPillars.length === 0) {
      const firstLive = pillars.find(([, list]) => list.some((i) => i.availability.available));
      if (firstLive) setOpenPillars([firstLive[0]]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicatorsQ.data, store]);

  const ranking = indexQ.data?.ranking ?? [];
  const top1 = ranking[0];
  const median =
    ranking.length > 0
      ? [...ranking.map((r) => r.priority_index)].sort((a, b) => a - b)[Math.floor(ranking.length / 2)]
      : null;

  const top15 = useMemo(
    () => ranking.slice(0, 15).map((r) => ({ district: r.district, index: r.priority_index, pcode: r.adm2_pcode })),
    [ranking],
  );

  const applyPreset = (preset: (typeof PRESETS)[number]) => {
    const next: Record<string, number> = {};
    for (const i of available) next[i.code] = presetBoost(preset, i.pillar);
    store.applyWeights(next);
    if (typeof window !== "undefined") window.history.replaceState(null, "", toUrlSync(next));
  };

  const setWeight = (code: string, value: number) => {
    store.setWeight(code, value);
    if (typeof window !== "undefined") window.history.replaceState(null, "", toUrlSync({ ...store.weights, [code]: value }));
  };

  const togglePillar = (pillar: string) =>
    setOpenPillars((prev) => (prev.includes(pillar) ? prev.filter((p) => p !== pillar) : [...prev, pillar]));

  if (indicatorsQ.isLoading)
    return (
      <div>
        <PageTitle
          title="Priority Index builder"
          subtitle="Set what matters; the ranking follows your weights — transparently, as a weighted mean of deprivation gaps."
        />
        <div className="mb-4">
          <StatCardsSkeleton count={3} />
        </div>
        <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
          <SliderListSkeleton count={5} />
          <ChartSkeleton height={420} />
        </div>
      </div>
    );
  if (indicatorsQ.error) return <ErrorState error={indicatorsQ.error} onRetry={() => indicatorsQ.refetch()} />;

  return (
    <div>
      <PageTitle
        title="Priority Index builder"
        subtitle="Set what matters; the ranking follows your weights — transparently, as a weighted mean of deprivation gaps."
      />

      {/* Live summary strip */}
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card>
          <Card.Header>
            <Card.Title>{top1 ? `${top1.district} · ${top1.priority_index.toFixed(3)}` : "—"}</Card.Title>
            <Card.Description>highest need district</Card.Description>
          </Card.Header>
        </Card>
        <Card>
          <Card.Header>
            <Card.Title>{median != null ? median.toFixed(3) : "—"}</Card.Title>
            <Card.Description>median index across districts</Card.Description>
          </Card.Header>
        </Card>
        <Card>
          <Card.Header>
            <Card.Title>
              {indexQ.data ? `${indexQ.data.indicators_used.length}/${indicators.length}` : "—"}
            </Card.Title>
            <Card.Description>indicators in play · renormalized per district</Card.Description>
          </Card.Header>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        {/* Controls */}
        <div className="rc-card flex flex-col gap-4 p-4">
          <div>
            <h3 className="mb-2 text-sm font-semibold">Preset</h3>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <Button key={p} size="sm" variant="secondary" onPress={() => applyPreset(p)}>
                  <span className="capitalize">{p}-first</span>
                </Button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold">
              Weights {store.province ? `(filtered: ${store.province})` : ""}
            </h3>
            <div className="flex flex-col gap-2">
              {pillars.map(([pillar, list]) => {
                const live = list.filter((i) => i.availability.available).length;
                const open = openPillars.includes(pillar);
                return (
                  <Disclosure key={pillar} isExpanded={open} onExpandedChange={() => togglePillar(pillar)}>
                    <Disclosure.Heading>
                      <Disclosure.Trigger>
                        <span className="flex w-full items-center justify-between gap-2 px-1 py-2 text-left">
                          <span className="text-sm font-medium" style={{ color: "var(--rc-fg)" }}>
                            {pillar}
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="text-xs rc-muted">
                              {live}/{list.length} live
                            </span>
                            <Disclosure.Indicator />
                          </span>
                        </span>
                      </Disclosure.Trigger>
                    </Disclosure.Heading>
                    <Disclosure.Content>
                      <div className="flex flex-col gap-4 px-1 pb-3 pt-1">
                        {list.map((i) => (
                          <div key={i.code} className={i.availability.available ? "" : "opacity-50"}>
                            <div className="flex items-baseline justify-between text-sm">
                              <span className="font-medium">{i.label}</span>
                              <span className="rc-muted">{(store.weights[i.code] ?? i.default_weight).toFixed(1)}</span>
                            </div>
                            <input
                              type="range" min={0} max={5} step={0.5} className="rc-slider"
                              value={store.weights[i.code] ?? i.default_weight}
                              disabled={!i.availability.available}
                              onChange={(e) => setWeight(i.code, Number(e.target.value))}
                              aria-label={`Weight for ${i.label}`}
                            />
                            {!i.availability.available && (
                              <p className="text-xs rc-muted">Data needed — {i.availability.reason}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </Disclosure.Content>
                  </Disclosure>
                );
              })}
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="rc-card flex flex-col p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">
              {view === "chart" ? "Most deprived districts (top 15)" : `Full ranking (${ranking.length})`}
            </h3>
            <div className="flex gap-2">
              <Button size="sm" variant={view === "chart" ? "secondary" : "tertiary"} onPress={() => setView("chart")}>
                Chart
              </Button>
              <Button size="sm" variant={view === "table" ? "secondary" : "tertiary"} onPress={() => setView("table")}>
                Ranking
              </Button>
            </div>
          </div>

          {indexQ.isLoading ? (
            view === "chart" ? <ChartSkeleton height={420} /> : <TableSkeleton rows={10} />
          ) : indexQ.error ? (
            <ErrorState error={indexQ.error} onRetry={() => indexQ.refetch()} />
          ) : view === "chart" ? (
            <div className="h-[480px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={top15} layout="vertical" margin={{ left: 60 }}>
                  <XAxis type="number" domain={[0, 1]} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="district" width={140} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="index" radius={[0, 4, 4, 0]}
                    onClick={(d: { payload?: { pcode?: string } }) => d?.payload?.pcode && store.openDistrict(d.payload.pcode)}>
                    {top15.map((d) => <Cell key={d.pcode} fill={gapColor(d.index)} cursor="pointer" />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="max-h-[480px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0" style={{ background: "var(--rc-surface)" }}>
                  <tr className="text-left rc-muted">
                    <th className="px-3 py-2 font-medium">Rank</th>
                    <th className="px-3 py-2 font-medium">District</th>
                    <th className="px-3 py-2 font-medium">Province</th>
                    <th className="px-3 py-2 text-right font-medium">Priority index</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((r) => (
                    <tr key={r.adm2_pcode} className="cursor-pointer border-t hover:opacity-80"
                      style={{ borderColor: "var(--rc-border)" }}
                      onClick={() => store.openDistrict(r.adm2_pcode)}>
                      <td className="px-3 py-2 rc-muted">{r.rank}</td>
                      <td className="px-3 py-2 font-medium">{r.district}</td>
                      <td className="px-3 py-2 rc-muted">{r.province}</td>
                      <td className="px-3 py-2 text-right">{fmt(r.priority_index, 4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <p className="mt-2 text-xs rc-muted">
        Indicators used: {indexQ.data?.indicators_used.join(", ") || "—"} · weights are renormalized per district over available data — no imputation.
      </p>
    </div>
  );
}
