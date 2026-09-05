/**
 * Appearance mode — `auto` (follow the OS), `light` or `dark`. Ported from
 * `theme.py`'s `resolve_mode`, but persisted to `localStorage` rather than a
 * server session, so a choice sticks across visits the way a real app
 * setting should.
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type ThemeMode = "auto" | "light" | "dark";

export const THEME_STORAGE_KEY = "air-web-console:theme";

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      mode: "auto",
      setMode: (mode) => set({ mode }),
    }),
    {
      name: THEME_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
