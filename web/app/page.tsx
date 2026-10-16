"use client";

export const dynamic = "force-dynamic";

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Button, Card, Chip } from "@heroui/react";
import { api } from "@/lib/api";
import { useUI } from "@/lib/store";
import { gapColor } from "@/lib/viz";

const STEPS = [
  {
    n: "01",
    title: "See every district side by side",
    body: "Public statistics for all 30 districts sit in one place, in the same units and the same scale — so comparing is finally fair and visible.",
  },
  {
    n: "02",
    title: "Say what matters most, get the ranking",
    body: "Move simple sliders — health, schools, water, money in your pocket — and the ranking of all 30 districts updates in front of you. No hidden formula: you set what counts.",
  },
  {
    n: "03",
    title: "Decide, and show your working",
    body: "Try a fair budget: more where people have least, none left out — and every number can be traced back to its public source.",
  },
];

export default function HomePage() {
  const router = useRouter();
  const store = useUI();

  const indicatorsQ = useQuery({ queryKey: ["indicators"], queryFn: api.indicators });
  const healthQ = useQuery({ queryKey: ["health"], queryFn: api.health });
  const indexQ = useQuery({
    queryKey: ["index", store.weights],
    queryFn: () => api.index(store.weights),
    placeholderData: (prev) => prev,
  });

  const indicators = indicatorsQ.data ?? [];
  const liveCount = indicators.filter((i) => i.availability.available).length;
  const ranking = indexQ.data?.ranking ?? [];
  const top5 = ranking.slice(0, 5);
  const top1 = ranking[0];
  const buildDate =
    healthQ.data && !Number.isNaN(new Date(healthQ.data.as_of).getTime())
      ? new Date(healthQ.data.as_of).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-8 sm:py-16">
      {/* Eyebrow + headline */}
      <Chip>Public data · all 30 districts · one picture</Chip>
      <h1
        className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl"
        style={{ color: "var(--rc-fg)" }}
      >
        Put the next franc where need is greatest.
      </h1>
      <p className="mt-4 max-w-2xl text-base rc-muted sm:text-lg">
        Public statistics for every district of Rwanda, brought together in one living map. See which
        communities have the least, understand what they lack beside what, and agree on where money and
        programs should go first.
      </p>

      {/* Actions */}
      <div className="mt-7 flex flex-wrap gap-3">
        <Button size="lg" variant="primary" onPress={() => router.push("/priority-index")}>
          Rank districts your way
        </Button>
        <Button size="lg" variant="secondary" onPress={() => router.push("/map")}>
          See the map
        </Button>
        <Button size="lg" variant="tertiary" onPress={() => router.push("/assistant")}>
          Ask about any district
        </Button>
      </div>

      {/* Live stats */}
      <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <Card.Header>
            <Card.Title>{healthQ.data?.n_districts ?? "—"}</Card.Title>
            <Card.Description>districts covered</Card.Description>
          </Card.Header>
        </Card>
        <Card>
          <Card.Header>
            <Card.Title>
              {indicatorsQ.data ? `${liveCount}/${indicators.length}` : "—"}
            </Card.Title>
            <Card.Description>indicators ready</Card.Description>
          </Card.Header>
        </Card>
        <Card>
          <Card.Header>
            <Card.Title>{buildDate ?? "—"}</Card.Title>
            <Card.Description>data updated</Card.Description>
          </Card.Header>
        </Card>
        <Card>
          <Card.Header>
            <Card.Title>{top1 ? top1.district : "—"}</Card.Title>
            <Card.Description>needs attention first right now</Card.Description>
          </Card.Header>
        </Card>
      </div>

      {/* Live top-5 + how it works */}
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <Card>
          <Card.Header>
            <Card.Title>Where need is greatest</Card.Title>
            <Card.Description>The five districts that need attention first right now — click one to see why</Card.Description>
          </Card.Header>
          <Card.Content>
            {indexQ.isLoading ? (
              <div className="flex flex-col gap-2">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-9 animate-pulse rounded-md rc-muted" style={{ background: "var(--g-color-base-selection)" }} />
                ))}
              </div>
            ) : (
              <ul className="flex flex-col gap-1">
                {top5.map((r) => (
                  <li key={r.adm2_pcode}>
                    <button
                      className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-opacity hover:opacity-75"
                      onClick={() => store.openDistrict(r.adm2_pcode)}
                    >
                      <span className="w-6 shrink-0 text-sm rc-muted">{r.rank}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium" style={{ color: "var(--rc-fg)" }}>
                          {r.district}
                        </span>
                        <span className="mt-1 block h-1.5 overflow-hidden rounded-full" style={{ background: "var(--g-color-base-selection)" }}>
                          <span
                            className="block h-full rounded-full"
                            style={{ width: `${Math.round(r.priority_index * 100)}%`, background: gapColor(r.priority_index) }}
                          />
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card.Content>
          <Card.Footer>
            <Button variant="tertiary" size="sm" onPress={() => router.push("/priority-index")}>
              See all 30 districts
            </Button>
          </Card.Footer>
        </Card>

        <Card>
          <Card.Header>
            <Card.Title>How it works</Card.Title>
            <Card.Description>Three steps — everything here is open and checkable</Card.Description>
          </Card.Header>
          <Card.Content>
            <ol className="flex flex-col">
              {STEPS.map((s, i) => (
                <li
                  key={s.n}
                  className={`flex gap-4 py-4 ${i > 0 ? "border-t" : ""}`}
                  style={{ borderColor: "var(--rc-border)" }}
                >
                  <span className="text-sm font-semibold" style={{ color: "var(--g-color-text-brand)" }}>
                    {s.n}
                  </span>
                  <span>
                    <span className="block text-sm font-medium" style={{ color: "var(--rc-fg)" }}>
                      {s.title}
                    </span>
                    <span className="mt-1 block text-sm rc-muted">{s.body}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Card.Content>
          <Card.Footer>
            <Button variant="tertiary" size="sm" onPress={() => router.push("/data")}>
              Data and method
            </Button>
          </Card.Footer>
        </Card>
      </div>
    </div>
  );
}
