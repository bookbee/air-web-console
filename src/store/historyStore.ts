/**
 * The session's call log — every request this browser tab has sent, newest
 * first. Persisted to `localStorage` rather than kept in memory only, since
 * a browser reload is a routine event and losing the log on every refresh
 * would be a real regression.
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { Exchange } from "@/lib/http/exchange";

export const HISTORY_LIMIT = 25;

export interface HistoryEntry {
  id: string;
  at: string;
  service: string;
  exchange: Exchange;
}

interface HistoryState {
  entries: HistoryEntry[];
  remember: (service: string, exchange: Exchange) => void;
  clear: () => void;
}

export const useHistoryStore = create<HistoryState>()(
  persist(
    (set) => ({
      entries: [],
      remember: (service, exchange) =>
        set((state) => ({
          entries: [
            {
              id: crypto.randomUUID(),
              at: new Date().toISOString(),
              service,
              exchange,
            },
            ...state.entries,
          ].slice(0, HISTORY_LIMIT),
        })),
      clear: () => set({ entries: [] }),
    }),
    {
      name: "air-web-console:history",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
