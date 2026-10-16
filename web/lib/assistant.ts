// Compass Assistant — a grounded, deterministic answer engine.
// It answers ONLY from the live /api/v1 data passed in ctx (plus on-demand
// calls to /analysis/allocate) and is honest about what is not in the dataset
// yet. No external AI service, no fabricated numbers.

import { api } from "./api";
import type { District, IndexRow, Indicator, Manifest } from "./api";

export type AssistantContext = {
  indicators: Indicator[];
  ranking: IndexRow[];
  districts: District[];
  manifest: Manifest;
  weights: Record<string, number>;
  budgetRwfM: number;
  floorPct: number;
};

export type AssistantReply = { text: string; source: string };

const bullet = (s: string) => `• ${s}`;
const list = (items: string[]) => items.map(bullet).join("\n");

function indicatorMentions(q: string, indicators: Indicator[]): Indicator[] {
  return indicators.filter((i) => {
    if (q.includes(i.code.replace(/_/g, " "))) return true;
    const words = i.label.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3);
    return words.some((w) => q.includes(w));
  });
}

const PENDING_HINTS: [RegExp, string][] = [
  [/povert/, "poverty_rate"],
  [/stunt|malaria|child health/, "stunting_rate"],
  [/litera|read|write/, "adult_literacy_rate"],
  [/enrol|enroll|school/, "net_secondary_enrollment"],
  [/electric|energy/, "electricity_access"],
  [/water/, "improved_water_access"],
  [/insur|cbhi|mutuelle/, "health_insurance_coverage"],
  [/food|hunger|nutrition/, "food_security"],
  [/credit|loan|financ/, "access_to_credit"],
];

export async function askAssistant(question: string, ctx: AssistantContext): Promise<AssistantReply> {
  const q = question.toLowerCase().trim();
  const available = ctx.indicators.filter((i) => i.availability.available);

  // ---- greeting / capabilities --------------------------------------------
  if (/^(hi|hello|hey|muraho|bonjour|yo)\b/.test(q) || /what can you|help me|capabilit/.test(q)) {
    return {
      text:
        "Muraho! I am the Compass Assistant — I answer questions using the live district dataset " +
        "(no external AI service, every number traces to the API).\n\n" +
        "Try asking:\n" +
        list([
          "“Which districts are most deprived?”",
          "“How would we allocate a budget?”",
          "“Compare Gasabo and Nyamasheke”",
          "“What data does this app use?”",
        ]) +
        "\n\nSurvey indicators (poverty, stunting, literacy…) join the dataset once the NISR files are filled in — I will say so instead of guessing.",
      source: "/api/v1/indicators",
    };
  }

  // ---- data / provenance ---------------------------------------------------
  if (/data|source|licen|provenance|where.*come|manifest/.test(q)) {
    const rows = Object.entries(ctx.manifest.sources).map(
      ([, s]) => bullet(`${s.provider} — ${s.license}`),
    );
    return {
      text:
        `Dataset: ${ctx.manifest.n_districts} districts and ${ctx.manifest.n_facilities.toLocaleString("en-US")} facilities, built ${new Date(ctx.manifest.as_of).toLocaleDateString("en-GB")}. All sources are public and license-checked:\n` +
        rows.join("\n") +
        "\n\nNote: survey indicators (poverty, literacy, stunting…) are pending the official NISR CSV drop-in.",
      source: "/api/v1/manifest",
    };
  }

  // ---- methodology ---------------------------------------------------------
  if (/how.*(work|comput|calcul)|method|weights?|formula|index meaning|what is the index/.test(q)) {
    const active = ctx.indicators
      .filter((i) => i.availability.available && (ctx.weights[i.code] ?? 0) > 0)
      .map((i) => `${i.label} ×${ctx.weights[i.code] ?? 1}`);
    return {
      text:
        "The Priority Index is a transparent weighted mean, not a black box:\n" +
        "1. each indicator is min–max normalized into a deprivation gap (1 = most deprived of the 30 districts);\n" +
        "2. gaps are averaged with user weights, renormalized per district over available data;\n" +
        "3. allocation simply follows the index share.\n" +
        `Your current weighting: ${active.length ? active.join(", ") : "—"}.\n` +
        "Full details live in the methodology doc and /data.",
      source: "/api/v1/analysis/index",
    };
  }

  // ---- comparison ----------------------------------------------------------
  if (/(compare| vs | versus |difference between)/.test(q)) {
    const names = ctx.districts.filter((d) => q.includes(d.district.toLowerCase()));
    if (names.length >= 2) {
      const [a, b] = names;
      const lines = ctx.indicators
        .filter((i) => i.availability.available)
        .map((i) => {
          const va = a.values[i.code], vb = b.values[i.code];
          if (va == null || vb == null) return null;
          const better = i.direction === "better_high" ? Math.max : Math.min;
          const who = better(va, vb) === va ? a.district : b.district;
          return bullet(`${i.label}: ${a.district} ${va} vs ${b.district} ${vb} → ${who} ahead`);
        })
        .filter(Boolean) as string[];
      const byPcodeA = ctx.ranking.find((r) => r.adm2_pcode === a.adm2_pcode);
      const byPcodeB = ctx.ranking.find((r) => r.adm2_pcode === b.adm2_pcode);
      return {
        text:
          `${a.district} (index ${byPcodeA?.priority_index.toFixed(3) ?? "—"}, rank #${byPcodeA?.rank ?? "?"}) vs ` +
          `${b.district} (index ${byPcodeB?.priority_index.toFixed(3) ?? "—"}, rank #${byPcodeB?.rank ?? "?"}):\n` +
          lines.join("\n"),
        source: "/api/v1/districts",
      };
    }
    return {
      text: "Name two districts to compare, e.g. “Compare Gasabo and Nyamasheke” — I will line up every available indicator.",
      source: "compare",
    };
  }

  // ---- budget allocation ---------------------------------------------------
  if (/budget|allocat|distribut|spend|invest/.test(q)) {
    try {
      const alloc = await api.allocate(ctx.budgetRwfM, ctx.weights, ctx.floorPct);
      const top = alloc.rows.slice(0, 5).map((r) =>
        bullet(`${r.district} — RWF ${r.allocation_rwf_m.toLocaleString("en-US")} M (${r.share_pct}%)`),
      );
      return {
        text:
          `Splitting RWF ${alloc.budget_rwf_m.toLocaleString("en-US")} M by Priority-Index share (floor ${alloc.floor_pct}% of equal split):\n` +
          top.join("\n") +
          `\n\nEvery district keeps ≥ ${alloc.floor_pct}% of an equal share; the table always sums to the envelope (see Budget page for the full table + CSV).`,
        source: "/api/v1/analysis/allocate",
      };
    } catch (err) {
      return { text: `Allocation failed right now: ${(err as Error).message}`, source: "error" };
    }
  }

  // ---- index: top / bottom -------------------------------------------------
  if (/(most|worst|top|depriv|needy|priority|least|best|better)/.test(q)) {
    const r = ctx.ranking;
    if (!r.length) {
      return { text: "No ranking available yet — the dataset may still be building.", source: "index" };
    }
    const wantsBest = /least|best|better|top performer/.test(q) && !/most|worst/.test(q);
    const slice = wantsBest ? [...r].reverse().slice(0, 3) : r.slice(0, 3);
    const title = wantsBest ? "Best-served districts (lowest index):" : "Highest-priority districts (highest index):";
    return {
      text: `${title}\n` + slice.map((x, i) => bullet(`#${i + 1} ${x.district} (${x.province}) — ${x.priority_index.toFixed(3)}`)).join("\n") +
        "\n\nRanking uses your current weights; change them on the Priority Index page and ask again.",
      source: "/api/v1/analysis/index",
    };
  }

  // ---- pending survey indicators --------------------------------------------
  for (const [re, code] of PENDING_HINTS) {
    if (re.test(q)) {
      const ind = ctx.indicators.find((i) => i.code === code);
      if (ind && !ind.availability.available) {
        return {
          text:
            `${ind.label} is not in the dataset yet — coverage ${ind.availability.coverage_pct}%. ` +
            "It joins automatically when the official NISR district file is dropped in (data/raw/nisr → template), and I will rank districts with it then. " +
            `Meanwhile I can answer on: ${available.map((i) => i.label).join(", ")}.`,
          source: "/api/v1/indicators",
        };
      }
    }
  }

  // ---- available indicator insight -------------------------------------------
  const mentioned = indicatorMentions(q, ctx.indicators).filter((i) => i.availability.available);
  if (mentioned.length) {
    const ind = mentioned[0];
    const rows = ctx.districts
      .map((d) => ({ d, v: d.values[ind.code] }))
      .filter((x): x is { d: District; v: number } => x.v != null)
      .sort((x, y) => (ind.direction === "better_high" ? x.v - y.v : y.v - x.v));
    const worst = rows.slice(0, 3), best = rows.slice(-3).reverse();
    return {
      text:
        `${ind.label} (${ind.unit}, source: ${ind.source}):\n` +
        "Most deprived:\n" + worst.map((x) => bullet(`${x.d.district} — ${x.v}`)).join("\n") +
        "\nBest served:\n" + best.map((x) => bullet(`${x.d.district} — ${x.v}`)).join("\n"),
      source: "/api/v1/districts",
    };
  }

  // ---- single district profile ------------------------------------------------
  const named = ctx.districts.filter((d) => q.includes(d.district.toLowerCase()));
  if (named.length) {
    const d = named[0];
    const r = ctx.ranking.find((x) => x.adm2_pcode === d.adm2_pcode);
    const values = ctx.indicators
      .filter((i) => i.availability.available && d.values[i.code] != null)
      .map((i) => bullet(`${i.label}: ${d.values[i.code]} ${i.unit}`));
    return {
      text:
        `${d.district} (${d.province}, PCODE ${d.adm2_pcode}, ${d.area_km2?.toLocaleString("en-US")} km²)\n` +
        `Priority index ${r?.priority_index.toFixed(3) ?? "—"} → rank #${r?.rank ?? "?"} of ${ctx.ranking.length}.\n` +
        values.join("\n"),
      source: "/api/v1/districts",
    };
  }

  // ---- fallback ----------------------------------------------------------------
  return {
    text:
      "I could not map that to the dataset. I can help with:\n" +
      list([
        "most/least deprived districts under your weights",
        "budget allocation for a given envelope",
        "comparing two districts on available indicators",
        "a single district's profile (mention its name)",
        "data sources, licenses and method",
      ]) +
      "\nSurvey indicators (poverty, stunting…) answer once the official NISR CSV is loaded.",
    source: "capabilities",
  };
}
