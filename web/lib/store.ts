// Global UI state (Zustand + localStorage persistence).
// Server state lives in TanStack Query; only cross-view UI state lives here.

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type Theme = "light" | "dark";

type UIState = {
  // Priority Index weights (indicator code -> 0..5). Hydrated with API defaults
  // on first indicators load, then user-edited values persist across views.
  weights: Record<string, number>;
  weightsInitialized: boolean;
  // Globe/2D choropleth metric selector
  metric: string | null;
  // Sharing/filtering
  province: string | null; // null = all
  // Analytic params shared across views
  k: number;               // typologies cluster count
  budgetRwfM: number;      // simulator envelope
  floorPct: number;        // simulator floor (% of equal split)
  driversTarget: string | null;
  // Drawer (global — any view can open it)
  drawerPcode: string | null;
  theme: Theme;

  setWeight: (code: string, value: number) => void;
  initWeights: (defaults: Record<string, number>) => void;
  applyWeights: (weights: Record<string, number>) => void;
  setMetric: (code: string) => void;
  setProvince: (province: string | null) => void;
  setK: (k: number) => void;
  setBudget: (v: number) => void;
  setFloor: (v: number) => void;
  setDriversTarget: (code: string | null) => void;
  openDistrict: (pcode: string) => void;
  closeDrawer: () => void;
  toggleTheme: () => void;
};

const PRESET_BY_PILLAR: Record<string, "poverty" | "education" | "health"> = {
  "Wellbeing & Social Protection": "poverty",
  "Education & Human Capital": "education",
  Health: "health",
};

export const useUI = create<UIState>()(
  persist(
    (set, get) => ({
      weights: {},
      weightsInitialized: false,
      metric: null,
      province: null,
      k: 4,
      budgetRwfM: 25_000,
      floorPct: 10,
      driversTarget: null,
      drawerPcode: null,
      theme: "light",

      setWeight: (code, value) => set((s) => ({ weights: { ...s.weights, [code]: value } })),

      // Called once when /indicators resolves; keeps the user's saved edits.
      initWeights: (defaults) => {
        if (get().weightsInitialized) return;
        set({ weights: { ...defaults, ...get().weights }, weightsInitialized: true });
      },

      applyWeights: (weights) => set({ weights }),

      setMetric: (code) => set({ metric: code }),
      setProvince: (province) => set({ province }),
      setK: (k) => set({ k: Math.min(6, Math.max(2, k)) }),
      setBudget: (budgetRwfM) => set({ budgetRwfM: Math.max(1, budgetRwfM) }),
      setFloor: (floorPct) => set({ floorPct: Math.min(50, Math.max(0, floorPct)) }),
      setDriversTarget: (driversTarget) => set({ driversTarget }),
      openDistrict: (drawerPcode) => set({ drawerPcode }),
      closeDrawer: () => set({ drawerPcode: null }),
      toggleTheme: () => set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),
    }),
    {
      name: "rc-ui",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      // Don't persist the drawer across reloads
      partialize: (s) => ({
        weights: s.weights,
        weightsInitialized: s.weightsInitialized,
        metric: s.metric,
        province: s.province,
        k: s.k,
        budgetRwfM: s.budgetRwfM,
        floorPct: s.floorPct,
        driversTarget: s.driversTarget,
        theme: s.theme,
      }),
    },
  ),
);

export function presetBoost(preset: "poverty" | "education" | "health" | "balanced", pillar: string): number {
  if (preset === "balanced") return 1;
  return PRESET_BY_PILLAR[pillar] === preset ? 4 : 0.5;
}
