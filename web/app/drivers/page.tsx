"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Button, Card, ListBox, Select } from "@heroui/react";
import { api, ApiError } from "@/lib/api";
import { useUI } from "@/lib/store";
import { ErrorState, DataNeeded, PageTitle } from "@/components/DataStates";
import { ChartSkeleton, StatCardsSkeleton } from "@/components/Skeletons";
import { gapColor, fmt } from "@/lib/viz";

export default function DriversPage() {
  const store = useUI();
  const [mode, setMode] = useState<"explain" | "predict">("explain");
  const [district, setDistrict] = useState<string | null>(null);
  const [scenario, setScenario] = useState<Record<string, number>>({});
  const indicatorsQ = useQuery({ queryKey: ["indicators"], queryFn: api.indicators });
  const available = (indicatorsQ.data ?? []).filter((i) => i.availability.available);

  // reset stale target if it disappears from the catalog
  useEffect(() => {
    if (indicatorsQ.data && store.driversTarget && !available.some((i) => i.code === store.driversTarget)) {
      store.setDriversTarget(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicatorsQ.data]);

  const target = store.driversTarget;
  const q = useQuery({
    queryKey: ["drivers", target],
    queryFn: () => api.drivers(target!),
    enabled: !!target,
    retry: false, // 406 (feature-starved) surfaces as warning toast + inline card
  });
  const districtsQ = useQuery({ queryKey: ["districts"], queryFn: api.districts });
  const indexQ = useQuery({
    queryKey: ["index", store.weights],
    queryFn: () => api.index(store.weights),
    placeholderData: (prev) => prev,
  });
  // default district = current highest-need district
  useEffect(() => {
    if (!district && indexQ.data?.ranking[0]) setDistrict(indexQ.data.ranking[0].adm2_pcode);
  }, [indexQ.data, district]);
  // fresh scenario whenever the question changes
  useEffect(() => {
    setScenario({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, district]);
  const predictQ = useQuery({
    queryKey: ["predict", target, district, scenario],
    queryFn: () => api.predict(target!, district!, scenario),
    enabled: !!target && !!district,
    placeholderData: (prev) => prev,
    retry: false,
  });

  const notAvailable = q.error instanceof ApiError && q.error.status === 406;
  const meta = indicatorsQ.data?.find((i) => i.code === target);
  const topFeatures = (q.data?.drivers ?? []).slice(0, 5);
  const ranges = predictQ.data?.feature_ranges ?? {};
  const improved =
    predictQ.data && meta
      ? meta.direction === "worse_high"
        ? predictQ.data.delta < 0
        : predictQ.data.delta > 0
      : null;
  const top = q.data?.drivers[0];

  return (
    <div>
      <PageTitle
        title="Deprivation drivers"
        subtitle="Pick an outcome — gradient boosting shows which companions travel with it. Association, not causal proof."
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="text-sm rc-muted">Outcome to explain:</span>
        <Select
          className="w-72"
          variant="secondary"
          aria-label="Outcome indicator"
          placeholder="Choose an available indicator"
          selectedKey={target ?? undefined}
          onSelectionChange={(key) => store.setDriversTarget(key != null ? String(key) : null)}
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {available.map((i) => (
                <ListBox.Item key={i.code} id={i.code} textValue={`${i.label} (${i.unit})`}>
                  {i.label} ({i.unit})
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
        <div className="flex gap-2" role="group" aria-label="Drivers mode">
          <Button size="sm" variant={mode === "explain" ? "secondary" : "tertiary"} onPress={() => setMode("explain")}>
            Explain
          </Button>
          <Button size="sm" variant={mode === "predict" ? "secondary" : "tertiary"} onPress={() => setMode("predict")}>
            Predict what-if
          </Button>
        </div>
      </div>

      {mode === "predict" ? (
        !target ? (
          <DataNeeded
            reason="Pick an outcome above, then a district and the changes to test."
            action="Prediction learns the outcome from the other indicators across districts."
          />
        ) : !district ? (
          <StatCardsSkeleton count={3} />
        ) : predictQ.isLoading && !predictQ.data ? (
          <>
            <div className="mb-4">
              <StatCardsSkeleton count={3} />
            </div>
            <ChartSkeleton height={320} />
          </>
        ) : predictQ.error ? (
          <ErrorState error={predictQ.error} onRetry={() => predictQ.refetch()} />
        ) : predictQ.data ? (
          <>
            <div className="mb-4 grid gap-3 sm:grid-cols-3">
              <Card>
                <Card.Header>
                  <Card.Title>{predictQ.data.baseline.toFixed(1)} {predictQ.data.unit}</Card.Title>
                  <Card.Description>
                    {predictQ.data.district} today · model baseline
                  </Card.Description>
                </Card.Header>
              </Card>
              <Card>
                <Card.Header>
                  <Card.Title>{predictQ.data.predicted.toFixed(1)} {predictQ.data.unit}</Card.Title>
                  <Card.Description>predicted under your scenario</Card.Description>
                </Card.Header>
              </Card>
              <Card>
                <Card.Header>
                  <Card.Title>
                    <span style={{ color: improved ? "var(--rc-good)" : "var(--rc-fg)" }}>
                      {predictQ.data.delta > 0 ? "+" : ""}{predictQ.data.delta.toFixed(1)}
                    </span>
                  </Card.Title>
                  <Card.Description>
                    predicted change{improved ? " · improvement" : improved === false ? " · worsening" : ""}
                  </Card.Description>
                </Card.Header>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
              <div className="rc-card p-4">
                <h3 className="mb-1 text-sm font-semibold">Scenario for {predictQ.data.district}</h3>
                <p className="mb-3 text-xs rc-muted">
                  Move a lever — the prediction recomputes live. Values stay inside observed district ranges.
                </p>
                <div className="mb-4">
                  <span className="text-xs rc-muted">District</span>
                  <Select
                    className="mt-1 w-full"
                    variant="secondary"
                    aria-label="Scenario district"
                    selectedKey={district}
                    onSelectionChange={(key) => {
                      if (key != null) setDistrict(String(key));
                    }}
                  >
                    <Select.Trigger>
                      <Select.Value />
                      <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover>
                      <ListBox>
                        {(districtsQ.data ?? []).map((d) => (
                          <ListBox.Item key={d.adm2_pcode} id={d.adm2_pcode} textValue={`${d.district} (${d.province})`}>
                            {d.district} ({d.province})
                            <ListBox.ItemIndicator />
                          </ListBox.Item>
                        ))}
                      </ListBox>
                    </Select.Popover>
                  </Select>
                </div>
                <div className="flex flex-col gap-4">
                  {topFeatures.map((f) => {
                    const r = ranges[f.code];
                    if (!r) return null;
                    const v = scenario[f.code] ?? r.current;
                    const step = Math.max((r.max - r.min) / 100, 0.01);
                    return (
                      <div key={f.code}>
                        <div className="flex items-baseline justify-between text-sm">
                          <span className="font-medium">{f.label}</span>
                          <span className="rc-muted">
                            {v.toFixed(1)}
                            {scenario[f.code] == null ? "" : ` (was ${r.current.toFixed(1)})`}
                          </span>
                        </div>
                        <input
                          type="range" min={r.min} max={r.max} step={step} className="rc-slider"
                          value={v}
                          onChange={(e) => setScenario((s) => ({ ...s, [f.code]: Number(e.target.value) }))}
                          aria-label={`Scenario value for ${f.label}`}
                        />
                      </div>
                    );
                  })}
                </div>
                {predictQ.data.clipped.length > 0 && (
                  <p className="mt-3 text-xs rc-muted">
                    Clipped to observed range: {predictQ.data.clipped.join(", ")} — the model does not extrapolate.
                  </p>
                )}
              </div>

              <div className="rc-card p-4">
                <h3 className="mb-2 text-sm font-semibold">How much to trust this</h3>
                <ul className="flex flex-col gap-2 text-sm">
                  <li className="flex items-baseline justify-between gap-2">
                    <span className="rc-muted">Leave-one-out fit (R²)</span>
                    <b className="tabular-nums">{predictQ.data.cv_r2.toFixed(2)}</b>
                  </li>
                  <li className="flex items-baseline justify-between gap-2">
                    <span className="rc-muted">Average miss (MAE, {predictQ.data.unit})</span>
                    <b className="tabular-nums">{predictQ.data.cv_mae.toFixed(1)}</b>
                  </li>
                  <li className="flex items-baseline justify-between gap-2">
                    <span className="rc-muted">Districts learned from</span>
                    <b className="tabular-nums">{predictQ.data.n_rows}</b>
                  </li>
                  <li className="flex items-baseline justify-between gap-2">
                    <span className="rc-muted">Strongest lever</span>
                    <b>{predictQ.data.top_drivers[0]?.label ?? "—"}</b>
                  </li>
                </ul>
                <p className="mt-3 text-xs rc-muted">{predictQ.data.caveat}</p>
              </div>
            </div>
          </>
        ) : null
      ) : !target ? (
        <DataNeeded
          reason={`Pick one of the ${available.length} available indicators above to explain it from the rest.`}
          action="See /data → indicator catalog for exact coverage."
        />
      ) : q.isLoading ? (
        <>
          <div className="mb-4">
            <StatCardsSkeleton count={3} />
          </div>
          <ChartSkeleton height={380} />
        </>
      ) : notAvailable ? (
        <DataNeeded reason={q.error!.message} />
      ) : q.data ? (
        <>
          {/* Verdict strip */}
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <Card>
              <Card.Header>
                <Card.Title>{q.data.target_label}</Card.Title>
                <Card.Description>outcome being explained</Card.Description>
              </Card.Header>
            </Card>
            <Card>
              <Card.Header>
                <Card.Title>{top ? top.label : "—"}</Card.Title>
                <Card.Description>
                  {top ? `strongest companion · importance ${top.importance.toFixed(2)}` : "strongest companion"}
                </Card.Description>
              </Card.Header>
            </Card>
            <Card>
              <Card.Header>
                <Card.Title>R² {q.data.r2.toFixed(2)}</Card.Title>
                <Card.Description>
                  in-sample fit · {q.data.n_features} companion features · target excluded
                </Card.Description>
              </Card.Header>
            </Card>
          </div>

          <div className="rc-card p-4">
            <h3 className="mb-2 text-sm font-semibold">
              Companion ranking ({q.data.drivers.length})
            </h3>
            <div className="h-[420px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={q.data.drivers.map((d) => ({ ...d, label: d.label }))} layout="vertical" margin={{ left: 140 }}>
                  <XAxis type="number" tick={{ fontSize: 11 }} domain={[0, "dataMax"]} />
                  <YAxis type="category" dataKey="label" width={220} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => [fmt(v as number, 3), "importance"]} />
                  <Bar dataKey="importance" radius={[0, 4, 4, 0]}>
                    {q.data.drivers.map((d, i) => {
                      const intensity = q.data.drivers.length > 1 ? i / (q.data.drivers.length - 1) : 0;
                      const l = 45 + 30 * (1 - intensity);
                      return <Cell key={d.code} fill={`oklch(${l}% 0.15 250)`} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-3 text-xs rc-muted">{q.data.caveat}</p>
          </div>
        </>
      ) : null}
    </div>
  );
}
