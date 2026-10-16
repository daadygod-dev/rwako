"use client";

import { useQuery } from "@tanstack/react-query";
import { Xmark } from "@gravity-ui/icons";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { useUI } from "@/lib/store";
import { api } from "@/lib/api";
import { DrawerSkeleton } from "@/components/Skeletons";

/**
 * Global district drawer — mounted once in the layout. Any view opens it via
 * useUI.openDistrict(pcode); ESC/backdrop closes it.
 */
export function DistrictDrawer() {
  const pcode = useUI((s) => s.drawerPcode);
  const close = useUI((s) => s.closeDrawer);
  const openDistrict = useUI((s) => s.openDistrict);
  const { data, isLoading } = useQuery({
    queryKey: ["district", pcode],
    queryFn: () => api.districtDetail(pcode!),
    enabled: !!pcode,
  });

  if (!pcode) return null;

  const gaps = Object.entries(data?.gaps ?? {});
  const chartData = gaps.map(([code, gap]) => ({
    code,
    district: gap ?? 0,
    median: (data?.median_gaps?.[code] ?? 0) as number,
  }));

  return (
    <>
      {pcode ? <div className="fixed inset-0 z-40 bg-black/30" onClick={close} aria-hidden /> : null}
      <aside
        className="fixed right-0 top-0 z-50 h-full w-full max-w-md overflow-y-auto p-5 shadow-xl"
        style={{ background: "var(--rc-surface)", borderLeft: "1px solid var(--rc-border)" }}
        role="dialog"
        aria-modal="true"
        onKeyDown={(e) => e.key === "Escape" && close()}
      >
        <button className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-md hover:opacity-70" onClick={close} aria-label="Close">
          <Xmark width={18} height={18} />
        </button>

        {isLoading || !data ? (
          <DrawerSkeleton />
        ) : (
          <>
            <p className="text-xs uppercase tracking-wide rc-muted">{data.province}</p>
            <h2 className="text-xl font-semibold">{data.district}</h2>
            <p className="text-xs rc-muted">PCODE {data.adm2_pcode}</p>

            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rc-card p-3">
                <p className="text-2xl font-bold rc-accent">#{data.rank}</p>
                <p className="text-xs rc-muted">rank of {data.of}</p>
              </div>
              <div className="rc-card p-3">
                <p className="text-2xl font-bold">{data.priority_index.toFixed(3)}</p>
                <p className="text-xs rc-muted">index (median {data.median.toFixed(3)})</p>
              </div>
              <div className="rc-card p-3">
                <p className="text-2xl font-bold">{data.facilities + data.schools}</p>
                <p className="text-xs rc-muted">{data.facilities} health · {data.schools} edu.</p>
              </div>
            </div>

            <h3 className="mt-6 text-sm font-semibold">Deprivation composition (0 = best · 1 = worst)</h3>
            <div className="mt-2 h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 12 }}>
                  <XAxis type="number" domain={[0, 1]} hide />
                  <YAxis type="category" dataKey="code" width={110} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="district" name="district gap" fill="var(--rc-accent)" radius={[0, 3, 3, 0]} />
                  <ReferenceLine x="median" stroke="var(--rc-border)" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <h3 className="mt-6 text-sm font-semibold">Districts with similar profiles</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {data.neighbours.map((n) => (
                <button
                  key={n}
                  className="rounded-md border px-3 py-1 text-xs transition-opacity hover:opacity-70"
                  style={{ borderColor: "var(--rc-border)" }}
                  onClick={() => openDistrict(n)}
                >
                  {n}
                </button>
              ))}
            </div>

            <p className="mt-6 text-xs rc-muted">
              Sources per indicator in /data · gaps are relative to the 30-district range.
            </p>
          </>
        )}
      </aside>
    </>
  );
}
