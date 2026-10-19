"use client";

export const dynamic = "force-dynamic";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CircleCheck, CircleXmark } from "@gravity-ui/icons";
import { Button, Card } from "@heroui/react";
import { api } from "@/lib/api";
import { ErrorState, PageTitle } from "@/components/DataStates";
import { CatalogSkeleton, StatCardsSkeleton } from "@/components/Skeletons";

type Filter = "all" | "live" | "needed";

export default function DataPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const indicatorsQ = useQuery({ queryKey: ["indicators"], queryFn: api.indicators });
  const manifestQ = useQuery({ queryKey: ["manifest"], queryFn: api.manifest });

  const indicators = indicatorsQ.data ?? [];
  const live = indicators.filter((i) => i.availability.available);
  const buildDate =
    manifestQ.data && !Number.isNaN(new Date(manifestQ.data.as_of).getTime())
      ? new Date(manifestQ.data.as_of).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : null;

  // pillar groups, catalog order preserved, filter applied
  const pillars = useMemo(() => {
    const map = new Map<string, typeof indicators>();
    for (const i of indicators) {
      if (filter === "live" && !i.availability.available) continue;
      if (filter === "needed" && i.availability.available) continue;
      const list = map.get(i.pillar) ?? [];
      list.push(i);
      map.set(i.pillar, list);
    }
    return [...map.entries()];
  }, [indicators, filter]);

  const sourceCount = manifestQ.data ? Object.keys(manifestQ.data.sources).length : 0;

  if (indicatorsQ.isLoading)
    return (
      <div className="space-y-6">
        <PageTitle
          title="Data & method"
          subtitle="Every number in this app traces back to a licensed public source. No synthetic values are ever displayed."
        />
        <StatCardsSkeleton count={3} />
        <CatalogSkeleton />
      </div>
    );
  if (indicatorsQ.error) return <ErrorState error={indicatorsQ.error} onRetry={() => indicatorsQ.refetch()} />;

  return (
    <div className="space-y-6">
      <PageTitle
        title="Data & method"
        subtitle="Every number in this app traces back to a licensed public source. No synthetic values are ever displayed."
      />

      {/* Live summary strip */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <Card.Header>
            <Card.Title>
              {indicators.length > 0 ? `${live.length}/${indicators.length}` : "—"}
            </Card.Title>
            <Card.Description>indicators live across districts</Card.Description>
          </Card.Header>
        </Card>
        <Card>
          <Card.Header>
            <Card.Title>{sourceCount > 0 ? sourceCount : "—"}</Card.Title>
            <Card.Description>licensed public sources cited below</Card.Description>
          </Card.Header>
        </Card>
        <Card>
          <Card.Header>
            <Card.Title>{buildDate ?? "—"}</Card.Title>
            <Card.Description>data build · everything recomputes from disk</Card.Description>
          </Card.Header>
        </Card>
      </div>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Indicator catalog</h2>
          <div className="flex gap-2" role="group" aria-label="Catalog filter">
            {(
              [
                ["all", `All (${indicators.length})`],
                ["live", `Available (${live.length})`],
                ["needed", `Data needed (${indicators.length - live.length})`],
              ] as [Filter, string][]
            ).map(([key, label]) => (
              <Button key={key} size="sm" variant={filter === key ? "secondary" : "tertiary"} onPress={() => setFilter(key)}>
                {label}
              </Button>
            ))}
          </div>
        </div>

        {pillars.length === 0 ? (
          <p className="text-sm rc-muted">Nothing in this view — switch the filter above.</p>
        ) : (
          pillars.map(([pillar, list]) => {
            const liveN = list.filter((i) => i.availability.available).length;
            return (
              <div key={pillar} className="mb-5">
                <div className="mb-2 flex items-baseline gap-2">
                  <h3 className="text-sm font-semibold" style={{ color: "var(--rc-fg)" }}>
                    {pillar}
                  </h3>
                  <span className="text-xs rc-muted">
                    {liveN}/{list.length} live
                  </span>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {list.map((i) => (
                    <div key={i.code} className="rc-card p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">{i.label}</p>
                          <p className="text-xs rc-muted">{i.unit}</p>
                        </div>
                        <span
                          className="flex shrink-0 items-center gap-1 text-xs"
                          style={{ color: i.availability.available ? "var(--rc-good)" : "var(--rc-muted)" }}
                        >
                          {i.availability.available ? <CircleCheck width={14} height={14} /> : <CircleXmark width={14} height={14} />}
                          {i.availability.available ? "available" : "data needed"}
                        </span>
                      </div>
                      <p className="mt-2 text-xs rc-muted">{i.source}</p>
                      <p className="mt-1 text-xs rc-muted">
                        coverage {i.availability.coverage_pct}% · {i.availability.n_districts} districts
                        {i.availability.reason ? ` · ${i.availability.reason}` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Provenance</h2>
          <Button
            size="sm"
            variant="tertiary"
            onPress={() => {
              const csv = "district,adm2_pcode,province,area_km2,health_facilities,education_facilities,health_per_1000km2,education_per_1000km2\n";
              const blob = new Blob([csv], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "rwanda-compass-districts.csv";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Download CSV
          </Button>
        </div>
        <div className="rc-card overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left rc-muted">
                <th className="px-3 py-2 font-medium">Source</th>
                <th className="px-3 py-2 font-medium">Provider</th>
                <th className="px-3 py-2 font-medium">License</th>
                <th className="px-3 py-2 font-medium">Link</th>
              </tr>
            </thead>
            <tbody>
              {manifestQ.data && Object.entries(manifestQ.data.sources).map(([key, s]) => (
                <tr key={key} className="border-t" style={{ borderColor: "var(--rc-border)" }}>
                  <td className="px-3 py-2 font-mono text-xs">{key}</td>
                  <td className="px-3 py-2">{s.provider}</td>
                  <td className="px-3 py-2">{s.license}</td>
                  <td className="px-3 py-2">
                    <a className="underline" href={s.url} target="_blank" rel="noreferrer">{s.url}</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {manifestQ.data ? (
          <ul className="mt-3 list-disc pl-5 text-xs rc-muted">
            {manifestQ.data.notes.map((n) => <li key={n}>{n}</li>)}
          </ul>
        ) : null}
      </section>

      <section className="rc-card p-5">
        <h2 className="text-lg font-semibold">Method (summary)</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm rc-muted">
          <li>Indicators are min–max normalized into deprivation gaps (1 = most deprived of the 30 districts).</li>
          <li>The need score is the weighted mean of gaps; weights are yours, renormalized per district over available data.</li>
          <li>K-Means typologies + gradient-boost drivers are fit per request from the files on disk — deterministic seeds, no leakage, no fabricated data.</li>
          <li>Full details in docs/METHODOLOGY.md (repo) and the API docs linked in the footer.</li>
        </ol>
      </section>
    </div>
  );
}
