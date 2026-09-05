/**
 * Types shared between the server-only config loader (`config.ts`) and the
 * client-side connection store. Kept dependency-free so importing them from
 * client code never pulls in the `server-only` guard.
 *
 * `Target`/`Defaults` hold real credentials and are never sent to the
 * browser. `PublicTarget`/`PublicDefaults` are what `GET /api/config`
 * actually returns: base URLs (not secret — needed for the "state the
 * destination" principle) but keys reduced to booleans.
 */

export interface Target {
  name: string;
  label: string;
  classifierBaseUrl: string;
  classifierApiKey: string;
  orchestratorBaseUrl: string;
  orchestratorCustomerKey: string;
  orchestratorBusinessKey: string;
  llmBaseUrl: string;
  llmApiKey: string;
  /** Per-target TLS verification, server-only — never a client-supplied
   * per-request choice (that was an SSRF/MITM-adjacent footgun). */
  verifyTls: boolean;
}

export interface Defaults {
  targets: Record<string, Target>;
  selected: string;
  timeoutSeconds: number;
  theme: "auto" | "light" | "dark";
  usdToInrRate: number;
}

export interface PublicTarget {
  name: string;
  label: string;
  classifierBaseUrl: string;
  classifierKeyed: boolean;
  orchestratorBaseUrl: string;
  orchestratorCustomerKeyed: boolean;
  orchestratorBusinessKeyed: boolean;
  llmBaseUrl: string;
  llmKeyed: boolean;
}

export interface PublicDefaults {
  targets: Record<string, PublicTarget>;
  selected: string;
  timeoutSeconds: number;
  theme: "auto" | "light" | "dark";
  usdToInrRate: number;
}
