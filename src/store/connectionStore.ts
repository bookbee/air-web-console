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
  /** The customer picked on each target's Orchestrator customer channel, by
   * target name, so one target's customer is never carried to another. */
  customerByTarget: Record<string, string>;

  hydrate: (defaults: PublicDefaults) => void;
  /** Pick a customer for a target; "" is anonymous. Ignored for a subject
   * the target doesn't list. */
  setCustomer: (target: string, subject: string) => void;
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
      customerByTarget: {},

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

      setCustomer: (target, subject) => {
        const offered = get().targets[target]?.orchestratorCustomerSubjects ?? [];
        if (subject && !offered.includes(subject)) return;
        set((state) => ({ customerByTarget: { ...state.customerByTarget, [target]: subject } }));
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
        customerByTarget: state.customerByTarget,
        hydrated: state.hydrated,
      }),
    },
  ),
);

export interface Connections {
  classifier: Connection;
  orchestratorChat: Connection;
  orchestratorQuery: Connection;
  llm: Connection;
  rag: Connection;
  tools: Connection;
}

type ConnectionFieldsSlice = Pick<ConnectionState, "targets" | "selectedTarget" | "timeoutSeconds"> &
  Partial<Pick<ConnectionState, "customerByTarget">>;

/** The customer to send for the selected target: its stored pick, if the
 * target still offers tokens and still lists that customer. */
export function customerFor(state: ConnectionFieldsSlice): string | undefined {
  const target = state.targets[state.selectedTarget];
  const picked = state.customerByTarget?.[state.selectedTarget];
  if (!target?.orchestratorCustomerTokenConfigured || !picked) return undefined;
  return target.orchestratorCustomerSubjects.includes(picked) ? picked : undefined;
}

/** The four Connection objects every tab and the target bar read from —
 * classifier, orchestrator (chat route/customer channel), orchestrator
 * (query route/business channel), llm, rag, tools. A pure function of the store's
 * primitive fields, not itself a Zustand selector (see `useConnections`
 * below for the memoized hook every component should actually use — a raw
 * `useConnectionStore(buildConnections)` would allocate a new object every
 * render and loop). */
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
      service: "air-classifier-service",
      baseUrl: target?.classifierBaseUrl ?? "",
      authenticated: target?.classifierKeyed ?? false,
    },
    orchestratorChat: {
      ...base,
      service: "air-orchestrator-service",
      baseUrl: target?.orchestratorBaseUrl ?? "",
      authenticated: target?.orchestratorCustomerKeyed ?? false,
      channel: "customer",
      customer: customerFor(state),
    },
    orchestratorQuery: {
      ...base,
      service: "air-orchestrator-service",
      baseUrl: target?.orchestratorBaseUrl ?? "",
      authenticated: target?.orchestratorBusinessKeyed ?? false,
      channel: "business",
    },
    llm: {
      ...base,
      service: "air-model-gateway",
      baseUrl: target?.llmBaseUrl ?? "",
      authenticated: target?.llmKeyed ?? false,
    },
    rag: {
      ...base,
      service: "air-rag-service",
      baseUrl: target?.ragBaseUrl ?? "",
      authenticated: target?.ragKeyed ?? false,
    },
    tools: {
      ...base,
      service: "air-tools-gateway",
      baseUrl: target?.toolsBaseUrl ?? "",
      authenticated: target?.toolsReadKeyed ?? false,
      executeKeyed: target?.toolsExecuteKeyed ?? false,
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
  const customerByTarget = useConnectionStore((state) => state.customerByTarget);

  return useMemo(
    () => buildConnections({ targets, selectedTarget, timeoutSeconds, customerByTarget }),
    [targets, selectedTarget, timeoutSeconds, customerByTarget],
  );
}
