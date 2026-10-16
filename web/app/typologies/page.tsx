"use client";

export const dynamic = "force-dynamic";

import { useQuery } from "@tanstack/react-query";
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Card, Chip, Skeleton } from "@heroui/react";
import { api } from "@/lib/api";
import { useUI } from "@/lib/store";
import { ErrorState, PageTitle } from "@/components/DataStates";
import { gapColor, fmt } from "@/lib/viz";

const CLUSTER_COLORS = ["oklch(45% 0.19 30)", "oklch(60% 0.15 80)", "oklch(55% 0.14 200)", "oklch(45% 0.12 300)", "oklch(50% 0.13 150)", "oklch(40% 0.1 60)"];

function severityWords(s: number): string {
  if (s >= 0.6) return "Highest need";
  if (s >= 0.45) return "High need";
  if (s >= 0.3) return "Moderate need";
  return "Better served";
}

function silhouetteWords(s: number): string {
  if (s >= 0.5) return "cleanly separated groups";
  if (s >= 0.25) return "fairly grouped";
  return "overlapping groups — try another k";
}

/** Shape-matched loading state: cluster cards + similarity map, shimmering. */
function TypologiesSkeleton() {
  return (
    <div aria-label="Loading typologies" aria-busy="true">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rc-card space-y-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-5 w-24 rounded-md" />
              <Skeleton className="h-6 w-24 rounded-md" />
            </div>
            <Skeleton className="h-3 w-40 rounded" />
            <div className="space-y-2 pt-1">
              {[0, 1, 2].map((j) => (
                <div key={j} className="space-y-1.5">
                  <div className="flex justify-between gap-2">
                    <Skeleton className="h-3.5 w-2/3 rounded" />
                    <Skeleton className="h-3.5 w-10 rounded" />
                  </div>
                  <Skeleton className="h-1.5 w-full rounded-full" />
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {[0, 1, 2, 3, 4, 5].map((j) => (
                <Skeleton key={j} className="h-6 w-20 rounded-md" />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="rc-card mt-4 space-y-3 p-4">
        <Skeleton className="h-4 w-48 rounded" />
        <Skeleton className="h-3 w-96 max-w-full rounded" />
        <Skeleton className="h-[300px] w-full rounded-md" />
      </div>
    </div>
  );
}

export default function TypologiesPage() {
  const store = useUI();
  const q = useQuery({
    queryKey: ["typologies", store.k],
    queryFn: () => api.typologies(store.k),
    placeholderData: (prev) => prev,
  });
  const indicatorsQ = useQuery({ queryKey: ["indicators"], queryFn: api.indicators });

  const clusters = q.data ? [...new Set(q.data.members.map((m) => m.cluster))].sort() : [];
  const labelOf = (code: string) => indicatorsQ.data?.find((i) => i.code === code)?.label ?? code;

  return (
    <div>
      <PageTitle
        title="District typologies"
        subtitle="Districts with similar deprivation fall into the same group — so each group can get one intervention package instead of thirty separate plans."
      />

      {/* Controls + verdict */}
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-3 text-sm">
          Groups (k): <b>{store.k}</b>
          <input type="range" min={2} max={6} step={1} className="rc-slider w-48"
            value={store.k} onChange={(e) => store.setK(Number(e.target.value))} />
        </label>
        {q.data ? (
          <Chip color={q.data.silhouette >= 0.25 ? "success" : "warning"}>
            {`Silhouette ${q.data.silhouette.toFixed(2)} · ${silhouetteWords(q.data.silhouette)}`}
          </Chip>
        ) : null}
      </div>

      {q.isLoading ? <TypologiesSkeleton /> : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : q.data && (
        <>
          {/* Cluster cards — one group per card, words before numbers */}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {q.data.profiles.map((p) => {
              const members = q.data!.members.filter((m) => m.cluster === p.cluster);
              const top = [...Object.entries(p.mean_gaps)].sort((a, b) => b[1] - a[1]).slice(0, 3);
              return (
                <Card key={p.cluster}>
                  <Card.Header>
                    <div className="flex items-center justify-between gap-2">
                      <Card.Title>
                        <span
                          className="mr-2 inline-block h-3 w-3 rounded-full align-middle"
                          style={{ background: CLUSTER_COLORS[(p.cluster - 1) % CLUSTER_COLORS.length] }}
                        />
                        Group {p.cluster}
                      </Card.Title>
                      <Chip size="sm" color={p.severity >= 0.45 ? "danger" : p.severity >= 0.3 ? "warning" : "success"}>
                        {severityWords(p.severity)}
                      </Chip>
                    </div>
                    <Card.Description>
                      {members.length} districts · average deprivation {p.severity.toFixed(2)}
                    </Card.Description>
                  </Card.Header>
                  <Card.Content>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide rc-muted">
                      What defines this group
                    </p>
                    <ul className="mb-3 flex flex-col gap-2">
                      {top.map(([code, v]) => (
                        <li key={code}>
                          <div className="flex items-baseline justify-between gap-2 text-sm">
                            <span className="truncate font-medium" style={{ color: "var(--rc-fg)" }}>
                              {labelOf(code)}
                            </span>
                            <span className="shrink-0 tabular-nums rc-muted">{v.toFixed(2)}</span>
                          </div>
                          <span className="mt-1 block h-1.5 overflow-hidden rounded-full" style={{ background: "var(--g-color-base-selection)" }}>
                            <span
                              className="block h-full rounded-full"
                              style={{ width: `${Math.round(v * 100)}%`, background: gapColor(v) }}
                            />
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide rc-muted">
                      Districts in this group
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {members.map((m) => (
                        <button
                          key={m.adm2_pcode}
                          onClick={() => store.openDistrict(m.adm2_pcode)}
                          className="rounded-md px-2.5 py-1 text-xs font-medium transition-opacity hover:opacity-70"
                          style={{ background: "var(--g-color-base-selection)", color: "var(--rc-fg)" }}
                        >
                          {m.district}
                        </button>
                      ))}
                    </div>
                  </Card.Content>
                </Card>
              );
            })}
          </div>

          {/* Scatter — now with a legend and a reading guide */}
          <div className="rc-card mt-4 p-4">
            <h3 className="text-sm font-semibold">Map of similarity</h3>
            <p className="mt-1 text-xs rc-muted">
              Each dot is a district. Dots close together have similar deprivation profiles;
              color shows the group above. Select any dot for its full profile.
            </p>
            <div className="mt-2 flex flex-wrap gap-3">
              {clusters.map((c) => (
                <span key={c} className="flex items-center gap-1.5 text-xs rc-muted">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: CLUSTER_COLORS[(c - 1) % CLUSTER_COLORS.length] }}
                  />
                  Group {c}
                </span>
              ))}
            </div>
            <div className="mt-2 h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                  <XAxis type="number" dataKey="x" name="Similarity axis 1" tick={false} />
                  <YAxis type="number" dataKey="y" name="Similarity axis 2" tick={false} width={24} />
                  <ZAxis range={[90, 91]} />
                  <Tooltip
                    content={({ payload }) => {
                      const p = payload?.[0]?.payload as { district?: string; cluster?: number } | undefined;
                      return p ? (
                        <div className="rc-card px-3 py-2 text-xs">
                          <b>{p.district}</b><br />group {p.cluster}
                        </div>
                      ) : null;
                    }}
                  />
                  <Scatter
                    data={q.data.members}
                    onClick={(d: { payload?: { adm2_pcode?: string } }) =>
                      d?.payload?.adm2_pcode && store.openDistrict(d.payload.adm2_pcode)}>
                    {q.data.members.map((m) => (
                      <Cell key={m.adm2_pcode} fill={CLUSTER_COLORS[(m.cluster - 1) % CLUSTER_COLORS.length]} cursor="pointer" />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
      <p className="mt-2 text-xs rc-muted">
        Groups describe shared deprivation patterns — they justify different intervention packages, but are not causal proof.
      </p>
    </div>
  );
}
