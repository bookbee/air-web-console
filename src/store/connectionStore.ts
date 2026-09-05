/**
 * Connection settings — the client-side counterpart to
 * `GET /api/config`'s redacted target catalogue.
 *
 * There is no editable Base URL / X-API-Key state here anymore: those are
 * server-only now (see `lib/config.ts`'s `resolveService`). The browser
 * can only *select* among the targets the server declared — switching to
 * a target this server doesn't recognize is a no-op, not a way to point
 * the BFF at an arbitrary host. Adding an environment is a `.env` change
 * on the server, not a sidebar edit.
 */
import { useMemo } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { Connection } from "@/lib/connection";
import type { PublicDefaults, PublicTarget } from "@/lib/types";

interface ConnectionState {
  hydrated: boolean;
  targets: Record<string, PublicTarget>;
  selectedTarget: string;
  timeoutSeconds: number;
  usdToInrRate: number;

  hydrate: (defaults: PublicDefaults) => void;
  selectTarget: (name: string) => void;
  setTimeoutSeconds: (value: number) => void;
  setUsdToInrRate: (value: number) => void;
}

export const useConnectionStore = create<ConnectionState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      targets: {},
      selectedTarget: "local",
      timeoutSeconds: 60,
      usdToInrRate: 87,

      hydrate: (defaults) => {
        const alreadyHydrated = get().hydrated;
        set((state) => ({
          // Always refresh the target catalogue — .env may have changed —
          // but only seed the user's own choices on a genuinely first load
          // this session.
          targets: defaults.targets,
          hydrated: true,
          selectedTarget: alreadyHydrated ? state.selectedTarget : defaults.selected,
          timeoutSeconds: alreadyHydrated ? state.timeoutSeconds : defaults.timeoutSeconds,
          usdToInrRate: alreadyHydrated ? state.usdToInrRate : defaults.usdToInrRate,
        }));
      },

      selectTarget: (name) => {
        // Selecting a target this server didn't declare is a no-op, not a
        // way to smuggle an arbitrary name through to the proxy routes
        // (which would fall back to the default target anyway, but there's
        // no reason to let the UI's own state say otherwise).
        if (!(name in get().targets)) return;
        set({ selectedTarget: name });
      },

      setTimeoutSeconds: (value) => set({ timeoutSeconds: value }),
      setUsdToInrRate: (value) => set({ usdToInrRate: value }),
    }),
    {
      name: "air-web-console:connection",
      storage: createJSONStorage(() => sessionStorage),
      // `targets` is deliberately excluded: it is always re-derived from a
      // fresh `/api/config` call, never restored from a stale snapshot.
      partialize: (state) => ({
        selectedTarget: state.selectedTarget,
        timeoutSeconds: state.timeoutSeconds,
        usdToInrRate: state.usdToInrRate,
        hydrated: state.hydrated,
      }),
    },
  ),
);

export interface Connections {
  classifier: Connection;
  platformCustomer: Connection;
  platformBusiness: Connection;
  llm: Connection;
}

type ConnectionFieldsSlice = Pick<ConnectionState, "targets" | "selectedTarget" | "timeoutSeconds">;

/** The four Connection objects every tab and the target bar read from —
 * classifier, platform (customer), platform (business), llm. A pure
 * function of the store's primitive fields, not itself a Zustand selector
 * (see `useConnections` below for the memoized hook every component
 * should actually use — a raw `useConnectionStore(buildConnections)` would
 * allocate a new object every render and loop). */
export function buildConnections(state: ConnectionFieldsSlice): Connections {
  const target = state.targets[state.selectedTarget];
  const targetLabel = target?.label ?? state.selectedTarget;
  const base = {
    target: state.selectedTarget,
    targetLabel,
    timeoutSeconds: state.timeoutSeconds,
  };
  return {
    classifier: {
      ...base,
      service: "air-classifier",
      baseUrl: target?.classifierBaseUrl ?? "",
      authenticated: target?.classifierKeyed ?? false,
    },
    platformCustomer: {
      ...base,
      service: "air-platform",
      baseUrl: target?.platformBaseUrl ?? "",
      authenticated: target?.platformCustomerKeyed ?? false,
      channel: "customer",
    },
    platformBusiness: {
      ...base,
      service: "air-platform",
      baseUrl: target?.platformBaseUrl ?? "",
      authenticated: target?.platformBusinessKeyed ?? false,
      channel: "business",
    },
    llm: {
      ...base,
      service: "air-llm",
      baseUrl: target?.llmBaseUrl ?? "",
      authenticated: target?.llmKeyed ?? false,
    },
  };
}

/** The memoized React hook every component should actually use. Subscribes
 * to each primitive slice individually and recomputes the derived
 * Connection objects only when one of those primitives changes reference. */
export function useConnections(): Connections {
  const targets = useConnectionStore((state) => state.targets);
  const selectedTarget = useConnectionStore((state) => state.selectedTarget);
  const timeoutSeconds = useConnectionStore((state) => state.timeoutSeconds);

  return useMemo(
    () => buildConnections({ targets, selectedTarget, timeoutSeconds }),
    [targets, selectedTarget, timeoutSeconds],
  );
}
