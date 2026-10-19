// Global UI state (Zustand + localStorage persistence).
// Server state lives in TanStack Query; only cross-view UI state lives here.

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type Theme = "light" | "dark";
export type Language = "en" | "kin";

type UIState = {
  weights: Record<string, number>;
  weightsInitialized: boolean;
  metric: string | null;
  province: string | null;
  k: number;
  budgetRwfM: number;
  floorPct: number;
  driversTarget: string | null;
  drawerPcode: string | null;
  theme: Theme;
  language: Language;

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
  setLanguage: (lang: Language) => void;
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
      language: "en",

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
      setLanguage: (language) => set({ language }),
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
        language: s.language,
      }),
    },
  ),
);

export function presetBoost(preset: "poverty" | "education" | "health" | "balanced", pillar: string): number {
  if (preset === "balanced") return 1;
  return PRESET_BY_PILLAR[pillar] === preset ? 4 : 0.5;
}
