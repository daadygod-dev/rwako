"use client";

export const dynamic = "force-dynamic";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button, Chip } from "@heroui/react";
import { AIInputWithLoading } from "@/components/ui/ai-input-with-loading";
import { api, ApiError, type AskResponse, type ChatMessage, type VisualSpec } from "@/lib/api";
import { useUI } from "@/lib/store";

type Entry =
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "assistant"; text: string; sources: string[]; suggested: Record<string, number> | null; weightsNote: string | null; applied?: boolean; visual: VisualSpec | null }
  | { id: string; kind: "error"; text: string };

function Visual({ spec }: { spec: VisualSpec }) {
  if (spec.kind === "groupedBars") {
    const rows = spec.categories.map((c, i) => ({
      category: c.length > 22 ? `${c.slice(0, 21)}…` : c,
      full: c,
      ...Object.fromEntries(spec.series.map((s) => [s.name, s.values[i] ?? 0])),
    }));
    const palette = ["var(--g-color-text-brand)", "var(--rc-muted)"];
    return (
      <div className="mt-3 rounded-md p-3" style={{ background: "var(--g-color-base-selection)" }}>
        <p className="mb-2 text-xs font-semibold" style={{ color: "var(--rc-fg)" }}>
          {spec.title}
          {spec.unit ? <span className="font-normal rc-muted"> · {spec.unit}</span> : null}
        </p>
        <div style={{ height: Math.min(360, 80 + spec.categories.length * 44) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 12 }}>
              <XAxis type="number" hide domain={[0, 1]} />
              <YAxis type="category" dataKey="category" width={150} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip
                formatter={(v, name) => [(v as number).toFixed(3), name]}
                contentStyle={{ borderRadius: 8, border: "1px solid var(--rc-border)", background: "var(--rc-surface)", fontSize: 12 }}
              />
              {spec.series.map((s, i) => (
                <Bar key={s.name} dataKey={s.name} radius={[0, 4, 4, 0]} fill={palette[i % palette.length]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }
  if (spec.kind === "donut") {
    return (
      <div className="mt-3 rounded-md p-3" style={{ background: "var(--g-color-base-selection)" }}>
        <p className="mb-1 text-xs font-semibold" style={{ color: "var(--rc-fg)" }}>
          {spec.title}
          {spec.unit ? <span className="font-normal rc-muted"> · {spec.unit}</span> : null}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div style={{ width: 170, height: 170 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip formatter={(v) => [`${(v as number).toFixed(1)}%`, "share"]} />
                <Pie data={spec.slices} dataKey="value" nameKey="label" innerRadius={52} outerRadius={78} paddingAngle={2} strokeWidth={0}>
                  {spec.slices.map((s, i) => (
                    <Cell key={s.label} fill={i === spec.slices.length - 1 && s.label === "Other districts" ? "var(--rc-muted)" : "var(--g-color-text-brand)"} fillOpacity={0.45 + (0.55 * (spec.slices.length - i)) / spec.slices.length} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="flex min-w-40 flex-1 flex-col gap-1">
            {spec.slices.map((s) => (
              <li key={s.label} className="flex items-baseline justify-between gap-2 text-xs">
                <span className="truncate font-medium" style={{ color: "var(--rc-fg)" }}>{s.label}</span>
                <span className="shrink-0 tabular-nums rc-muted">{s.value.toFixed(1)}%</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }
  if (spec.kind === "table") {
    return (
      <div className="mt-3 overflow-x-auto rounded-md" style={{ background: "var(--g-color-base-selection)" }}>
        <p className="px-3 pt-2.5 text-xs font-semibold" style={{ color: "var(--rc-fg)" }}>
          {spec.title}
        </p>
        <table className="w-full text-xs">
          <thead>
            <tr className="rc-muted">
              {spec.columns.map((c) => (
                <th key={c} className="px-3 py-1.5 text-left font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {spec.rows.map((r, i) => (
              <tr key={i} className="border-t" style={{ borderColor: "var(--rc-border)" }}>
                {r.map((cell, j) => (
                  <td key={j} className="px-3 py-1.5 tabular-nums" style={{ color: "var(--rc-fg)" }}>
                    {typeof cell === "number" ? cell.toFixed(cell < 10 && cell % 1 !== 0 ? 2 : 1) : (cell ?? "—")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  const max = Math.max(1e-9, ...spec.items.map((d) => d.value));
  return (
    <div className="mt-3 rounded-md p-3" style={{ background: "var(--g-color-base-selection)" }}>
      <p className="mb-2 text-xs font-semibold" style={{ color: "var(--rc-fg)" }}>
        {spec.title}
        {spec.unit ? <span className="font-normal rc-muted"> · {spec.unit}</span> : null}
      </p>
      <div style={{ height: Math.min(360, 60 + spec.items.length * 36) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={spec.items} layout="vertical" margin={{ left: 8, right: 12 }}>
            <XAxis type="number" hide domain={[0, max]} />
            <YAxis
              type="category"
              dataKey="label"
              width={150}
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              formatter={(v) => [(v as number).toFixed(3), spec.unit ?? "value"]}
              contentStyle={{
                borderRadius: 8,
                border: "1px solid var(--rc-border)",
                background: "var(--rc-surface)",
                fontSize: 12,
              }}
            />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {spec.items.map((d) => (
                <Cell key={d.label} fill="var(--g-color-text-brand)" />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

const STARTERS = [
  "Which 5 districts need help first?",
  "Compare Nyamagabe and Gasabo",
  "What drives poverty?",
  "Split 25 billion RWF across districts",
];

const SOURCE_LABELS: Record<string, string> = {
  district_profile: "district profile",
  ranking: "ranking",
  compare_districts: "comparison",
  explain_drivers: "drivers",
  describe_typologies: "typologies",
  simulate_allocation: "allocation",
  facility_services: "facilities",
  data_coverage: "coverage",
  provenance: "sources",
  search_web: "web search",
};

let idc = 0;
const nid = () => `m${++idc}`;

export default function AssistantPage() {
  const store = useUI();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const indicatorsQ = useQuery({ queryKey: ["indicators"], queryFn: api.indicators });
  const liveCount = (indicatorsQ.data ?? []).filter((i) => i.availability.available).length;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [entries, busy]);

  const send = async (raw: string) => {
    const message = raw.trim();
    if (!message || busy) return;
    const history: ChatMessage[] = entries
      .filter((e) => e.kind === "user" || e.kind === "assistant")
      .slice(-8)
      .map((e) => ({ role: e.kind as "user" | "assistant", content: e.kind === "user" ? e.text : e.text }));
    setEntries((prev) => [...prev, { id: nid(), kind: "user", text: message }]);
    setBusy(true);
    try {
      const res: AskResponse = await api.ask(message, history, store.weights);
      setEntries((prev) => [
        ...prev,
        {
          id: nid(),
          kind: "assistant",
          text: res.answer,
          sources: res.sources,
          suggested: res.suggested_weights,
          weightsNote: res.weights_note,
          visual: res.visual,
        },
      ]);
    } catch (err) {
      const detail =
        err instanceof ApiError
          ? err.status === 503
            ? "The analyst is offline — the server has no model key configured yet."
            : err.detail
          : String(err);
      setEntries((prev) => [...prev, { id: nid(), kind: "error", text: detail }]);
    } finally {
      setBusy(false);
    }
  };

  const applyWeights = (weights: Record<string, number>) => {
    store.applyWeights({ ...store.weights, ...weights });
    setEntries((prev) => prev.map((e) => (e.kind === "assistant" && e.suggested === weights ? { ...e, applied: true } : e)));
  };

  return (
    <div className="mx-auto flex h-[calc(100dvh-170px)] w-full max-w-3xl flex-col" ref={boxRef}>
      {/* Chat header */}
      <div className="flex items-center gap-3 pb-4">
        <img src="/assistant.svg" alt="Ask assistant" className="h-9 w-9 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-semibold leading-tight" style={{ color: "var(--rc-fg)" }}>
            Ask
          </h1>
          <p className="truncate text-xs rc-muted">Answers computed live from district data and ML</p>
        </div>
        {indicatorsQ.data ? (
          <Chip size="sm" color="success">
            {liveCount}/{indicatorsQ.data.length} indicators live
          </Chip>
        ) : null}
      </div>

      {/* Messages */}
      <div className="rc-noscroll min-h-0 flex-1 overflow-y-auto pb-4" role="log" aria-live="polite" aria-label="Conversation">
        {entries.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
            <p className="max-w-md text-lg font-medium" style={{ color: "var(--rc-fg)" }}>
              Ask about districts, rankings, drivers, clusters, or budgets.
            </p>
            <p className="-mt-3 max-w-md text-sm rc-muted">
              Every answer is computed from the live API — rankings, gaps, typologies, allocations.
            </p>
            <div className="flex max-w-lg flex-wrap justify-center gap-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => void send(s)}
                  className="rounded-md px-3 py-2 text-sm font-medium transition-opacity hover:opacity-75"
                  style={{ background: "var(--g-color-base-selection)", color: "var(--rc-fg)" }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {entries.map((e) =>
              e.kind === "user" ? (
                <div key={e.id} className="flex justify-end">
                  <div
                    className="max-w-[85%] whitespace-pre-wrap rounded-md rounded-br-sm px-4 py-2.5 text-sm"
                    style={{ background: "var(--g-color-base-brand)", color: "var(--g-color-private-brand-1000-solid)" }}
                  >
                    {e.text}
                  </div>
                </div>
              ) : e.kind === "error" ? (
                <div key={e.id} className="rc-card p-4">
                  <p className="text-sm font-medium" style={{ color: "var(--rc-fg)" }}>
                    Couldn&apos;t answer that
                  </p>
                  <p className="mt-1 text-sm rc-muted">{e.text}</p>
                  <div className="mt-3">
                    <Button size="sm" variant="secondary" onPress={() => {
                      setEntries((prev) => prev.slice(0, -1));
                    }}>
                      Dismiss
                    </Button>
                  </div>
                </div>
              ) : (
                <div key={e.id} className="flex gap-3">
                  <img src="/assistant.svg" alt="" className="h-7 w-7 shrink-0" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="rc-md" style={{ color: "var(--rc-fg)" }}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{e.text}</ReactMarkdown>
                    </div>
                    {e.visual && <Visual spec={e.visual} />}
                    {e.sources.length > 0 && (
                      <p className="mt-2 text-xs rc-muted">
                        Answered from: {e.sources.map((s) => SOURCE_LABELS[s] ?? s).join(" · ")}
                      </p>
                    )}
                    {e.suggested && !e.applied && (
                      <div className="mt-2">
                        <Button size="sm" variant="secondary" onPress={() => e.suggested && applyWeights(e.suggested)}>
                          Apply suggested weights
                        </Button>
                        {e.weightsNote && <p className="mt-1 text-xs rc-muted">{e.weightsNote}</p>}
                      </div>
                    )}
                    {e.suggested && e.applied && (
                      <p className="mt-2 text-xs" style={{ color: "var(--g-color-text-brand)" }}>
                        Weights applied — rankings everywhere now follow them.
                      </p>
                    )}
                  </div>
                </div>
              ),
            )}
            {busy && (
              <div className="flex gap-3">
                <img src="/assistant.svg" alt="" className="h-7 w-7 shrink-0" aria-hidden="true" />
                <div className="flex items-center gap-1.5 py-2" aria-label="Thinking">
                  {[0, 1, 2].map((d) => (
                    <span
                      key={d}
                      className="h-2 w-2 animate-bounce rounded-full rc-muted"
                      style={{ background: "var(--rc-muted)", animationDelay: `${d * 0.15}s` }}
                    />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Composer */}
      <AIInputWithLoading
        className="pt-2"
        loading={busy}
        onSubmit={(value) => send(value)}
        placeholder="Ask about districts, rankings, drivers, clusters, budgets…"
      />
      <p className="mt-1.5 text-center text-[11px] rc-muted">
        Grounded in live data — verify numbers against the Index, Drivers, and Simulator pages.
      </p>
    </div>
  );
}
