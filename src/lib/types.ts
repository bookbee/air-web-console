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

/** A target's development customer-token settings (air-orchestrator-service
 * spec 0014). Server-only, like every key here: `privateKeyPem` is an
 * upstream credential. */
export interface CustomerTokenConfig {
  privateKeyPem: string;
  kid: string;
  issuer: string;
  tenant: string;
  /** Clamped to [60, 900]. */
  ttlSeconds: number;
  /** The customers a tester may act as on this target. */
  subjects: string[];
}

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
  ragBaseUrl: string;
  ragApiKey: string;
  /** Null when the target doesn't offer customer tokens. */
  orchestratorCustomerToken: CustomerTokenConfig | null;
  /** Set when the fields are half-configured or the key is unusable; the
   * target then never mints. A message naming fields, never values. */
  orchestratorCustomerTokenError: string | null;
  /** Whether the dev-only SIT token modes apply here (local target, and a
   * development server or AIR_WEB__CUSTOMER_TOKEN_TEST_MODES). */
  orchestratorCustomerTokenTestModes: boolean;
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
  ragBaseUrl: string;
  ragKeyed: boolean;
  /** The target mints customer tokens. The key, kid, issuer and tenant
   * stay server-side; only this flag and the subjects are public. */
  orchestratorCustomerTokenConfigured: boolean;
  /** Customer ids are not secret; the UI needs them for its picker. */
  orchestratorCustomerSubjects: string[];
  orchestratorCustomerTokenError: string | null;
  orchestratorCustomerTokenTestModes: boolean;
}

export interface PublicDefaults {
  targets: Record<string, PublicTarget>;
  selected: string;
  timeoutSeconds: number;
  theme: "auto" | "light" | "dark";
  usdToInrRate: number;
}
