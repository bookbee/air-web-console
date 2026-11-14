/**
 * Start-up defaults for the console — server-only, read from process.env.
 *
 * *Targets*: named bundles of base URLs and keys, declared once in `.env`.
 * One is always present — `local` — pre-wired to the AIR port map and the
 * sibling repos' own development keys, so a fresh checkout works before
 * anyone edits anything.
 *
 * Unlike the console's first iteration, **this module's output never
 * reaches the browser directly.** `GET /api/config` ships
 * `toPublicDefaults()`'s redacted shape (base URLs, but keys reduced to
 * booleans); the proxy routes call `resolveService()` here, server-side,
 * to attach the real key for an outbound call. A client can select a
 * target *by name* — it can never supply a base URL or key of its own and
 * have this server call it (that was the SSRF hole the first iteration
 * had). `import "server-only"` enforces that this file itself never ships
 * to the browser.
 */
import "server-only";

import { reportConfigError, resolveCustomerToken, type CustomerTokenFields } from "./auth/customerToken";
import { LOCAL_HOSTS, locationOf, type Location } from "./location";
import type { ToolsScope } from "./toolsScope";
import type { Defaults, PublicDefaults, PublicTarget, Target } from "./types";

export type { Defaults, PublicDefaults, PublicTarget, Target };

export const ENV_PREFIX = "AIR_WEB__";
const TARGETS_PREFIX = `${ENV_PREFIX}TARGETS__`;

export const LOCAL_TARGET_NAME = "local";

/**
 * Fallback values for the built-in `local` target, used only when `.env`
 * doesn't override a given field. **This is server-side configuration, not
 * client-held state**: nothing in this object ever reaches the browser.
 * The React app (everything under `src/components`) never sees, holds, or
 * sends any of these — only this Node.js server does, when it calls out to
 * air-classifier-service/air-orchestrator-service/air-model-gateway/air-rag-service on the browser's behalf. That's the
 * whole point of the BFF: the "web client" is dumb by design, and a
 * backend process (this one) is what actually holds credentials, exactly
 * like any server calling another server would.
 *
 * The base URLs are the AIR port map (air-infra/README.md): 8081
 * air-orchestrator-service, 8082 air-classifier-service, 8083 air-model-gateway, 8087
 * air-rag-service. The keys are the
 * literal development tokens the sibling air-* services' own
 * `.env.example` files provision for local development — kept
 * byte-for-byte so a fresh checkout authenticates with zero edits on
 * either side. `"air-client-dev"` is the token string air-model-gateway's own
 * `.env.example` maps to the `air-web-console` service identity
 * (`AIR_MODEL_GATEWAY_SECURITY__SERVICE_TOKENS`); the string is fixed by that
 * service's local config, not a naming choice made here.
 */
const LOCAL_TARGET_DEV_DEFAULTS = {
  classifierBaseUrl: "http://127.0.0.1:8082",
  classifierApiKey: "airc_local_dev_key",
  orchestratorBaseUrl: "http://127.0.0.1:8081",
  orchestratorCustomerKey: "airo_local_customer_key",
  orchestratorBusinessKey: "airo_local_business_key",
  llmBaseUrl: "http://127.0.0.1:8083",
  llmApiKey: "air-client-dev",
  ragBaseUrl: "http://127.0.0.1:8087",
  ragApiKey: "airr_local_dev_key",
  toolsBaseUrl: "http://127.0.0.1:8084",
  toolsReadApiKey: "airtg_read_local_dev",
  toolsExecuteApiKey: "airtg_exec_local_dev",
} as const;

export const DEFAULT_USD_TO_INR_RATE = 87.0;

export type ServiceKind =
  | "air-classifier-service"
  | "air-orchestrator-service"
  | "air-model-gateway"
  | "air-rag-service"
  | "air-tools-gateway";
export type OrchestratorChannel = "customer" | "business";
export type { ToolsScope };

export interface ResolvedService {
  baseUrl: string;
  apiKey: string;
  verifyTls: boolean;
}

/** The strongest of the services' locations — remote wins, even if
 * only one leg of an otherwise-local target points elsewhere. */
export function targetLocation(target: Target): Location {
  const legs = new Set<Location>([
    locationOf(target.classifierBaseUrl),
    locationOf(target.orchestratorBaseUrl),
    locationOf(target.llmBaseUrl),
    locationOf(target.ragBaseUrl),
    locationOf(target.toolsBaseUrl),
  ]);
  if (legs.has("remote")) return "remote";
  if (legs.has("local")) return "local";
  return "unset";
}

/** Resolve which base URL/key/TLS setting a proxy call should use — the
 * one place client intent (a target name, a channel) turns into a real
 * credential. A `targetName` the server doesn't recognize falls back to
 * the configured default target rather than failing outright, the same
 * safe-fallback precedent `loadDefaults()` sets for a bad `AIR_WEB__TARGET`. */
export function resolveService(
  defaults: Defaults,
  targetName: string,
  service: ServiceKind,
  channel?: OrchestratorChannel,
  toolsScope: ToolsScope = "read",
): ResolvedService {
  const target = defaults.targets[targetName] ?? defaults.targets[defaults.selected];
  if (service === "air-classifier-service") {
    return { baseUrl: target.classifierBaseUrl, apiKey: target.classifierApiKey, verifyTls: target.verifyTls };
  }
  if (service === "air-model-gateway") {
    return { baseUrl: target.llmBaseUrl, apiKey: target.llmApiKey, verifyTls: target.verifyTls };
  }
  if (service === "air-rag-service") {
    return { baseUrl: target.ragBaseUrl, apiKey: target.ragApiKey, verifyTls: target.verifyTls };
  }
  if (service === "air-tools-gateway") {
    // The scope comes from the route being called (`toolsScopeFor`), never
    // from a client header: execute gets the execute key, everything else
    // the read key, exactly as the gateway's two key scopes divide them.
    return {
      baseUrl: target.toolsBaseUrl,
      apiKey: toolsScope === "execute" ? target.toolsExecuteApiKey : target.toolsReadApiKey,
      verifyTls: target.verifyTls,
    };
  }
  return {
    baseUrl: target.orchestratorBaseUrl,
    apiKey: channel === "business" ? target.orchestratorBusinessKey : target.orchestratorCustomerKey,
    verifyTls: target.verifyTls,
  };
}

/** Strip a `Defaults` down to what's safe to ship to the browser: base
 * URLs stay (not secret — needed for "state the destination"), every key
 * becomes a boolean. */
export function toPublicDefaults(defaults: Defaults): PublicDefaults {
  const targets: Record<string, PublicTarget> = {};
  for (const [name, target] of Object.entries(defaults.targets)) {
    targets[name] = {
      name: target.name,
      label: target.label,
      classifierBaseUrl: target.classifierBaseUrl,
      classifierKeyed: target.classifierApiKey.trim().length > 0,
      orchestratorBaseUrl: target.orchestratorBaseUrl,
      orchestratorCustomerKeyed: target.orchestratorCustomerKey.trim().length > 0,
      orchestratorBusinessKeyed: target.orchestratorBusinessKey.trim().length > 0,
      llmBaseUrl: target.llmBaseUrl,
      llmKeyed: target.llmApiKey.trim().length > 0,
      ragBaseUrl: target.ragBaseUrl,
      ragKeyed: target.ragApiKey.trim().length > 0,
      toolsBaseUrl: target.toolsBaseUrl,
      toolsReadKeyed: target.toolsReadApiKey.trim().length > 0,
      toolsExecuteKeyed: target.toolsExecuteApiKey.trim().length > 0,
      orchestratorCustomerTokenConfigured: target.orchestratorCustomerToken !== null,
      orchestratorCustomerSubjects: target.orchestratorCustomerToken?.subjects ?? [],
      orchestratorCustomerTokenError: target.orchestratorCustomerTokenError,
      orchestratorCustomerTokenTestModes:
        target.orchestratorCustomerToken !== null && target.orchestratorCustomerTokenTestModes,
    };
  }
  return {
    targets,
    selected: defaults.selected,
    timeoutSeconds: defaults.timeoutSeconds,
    theme: defaults.theme,
    usdToInrRate: defaults.usdToInrRate,
  };
}

const TARGET_FIELDS = new Set([
  "LABEL",
  "CLASSIFIER_BASE_URL",
  "CLASSIFIER_API_KEY",
  "ORCHESTRATOR_BASE_URL",
  "ORCHESTRATOR_CUSTOMER_API_KEY",
  "ORCHESTRATOR_BUSINESS_API_KEY",
  "LLM_BASE_URL",
  "LLM_API_KEY",
  "RAG_BASE_URL",
  "RAG_API_KEY",
  "TOOLS_BASE_URL",
  "TOOLS_READ_API_KEY",
  "TOOLS_EXECUTE_API_KEY",
  "ORCHESTRATOR_CUSTOMER_TOKEN_PRIVATE_KEY",
  "ORCHESTRATOR_CUSTOMER_TOKEN_KID",
  "ORCHESTRATOR_CUSTOMER_TOKEN_ISSUER",
  "ORCHESTRATOR_CUSTOMER_TOKEN_TENANT",
  "ORCHESTRATOR_CUSTOMER_TOKEN_TTL_S",
  "ORCHESTRATOR_CUSTOMER_TOKEN_SUBJECTS",
  "VERIFY_TLS",
]);

function get(name: string, fallback = ""): string {
  const value = process.env[`${ENV_PREFIX}${name}`];
  return value && value.trim() ? value.trim() : fallback;
}

function getBool(name: string, fallback: boolean): boolean {
  const raw = process.env[`${ENV_PREFIX}${name}`];
  if (raw === undefined || !raw.trim()) return fallback;
  return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
}

function boolField(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || !raw.trim()) return fallback;
  return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
}

function getFloat(name: string, fallback: number): number {
  const raw = process.env[`${ENV_PREFIX}${name}`];
  if (raw === undefined || !raw.trim()) return fallback;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function collectDeclared(): Record<string, Record<string, string>> {
  const declared: Record<string, Record<string, string>> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith(TARGETS_PREFIX) || value === undefined) continue;
    const rest = key.slice(TARGETS_PREFIX.length);
    const separator = rest.indexOf("__");
    if (separator < 0) continue;
    const name = rest.slice(0, separator).toLowerCase();
    const field = rest.slice(separator + 2);
    if (!name || !TARGET_FIELDS.has(field)) continue;
    declared[name] ??= {};
    declared[name][field] = value.trim();
  }
  return declared;
}

/** Whether the dev-only SIT token modes (expired, wrong tenant, tampered)
 * may be applied on this target: never on a remote one, and only on a
 * development server, or where the deployment opts in (the Docker image runs
 * with NODE_ENV=production, so `docker-compose.yml` sets the flag). */
function testModesAllowed(orchestratorBaseUrl: string): boolean {
  const devServer = process.env.NODE_ENV !== "production" || getBool("CUSTOMER_TOKEN_TEST_MODES", false);
  return devServer && locationOf(orchestratorBaseUrl) === "local";
}

/** A target's customer-token settings, resolved from its six fields. A
 * half-configured target is reported once and offers no tokens. */
function customerTokenFor(
  name: string,
  fields: Record<string, string>,
  orchestratorBaseUrl: string,
): Pick<Target, "orchestratorCustomerToken" | "orchestratorCustomerTokenError" | "orchestratorCustomerTokenTestModes"> {
  const raw: CustomerTokenFields = {
    privateKey: fields.ORCHESTRATOR_CUSTOMER_TOKEN_PRIVATE_KEY,
    kid: fields.ORCHESTRATOR_CUSTOMER_TOKEN_KID,
    issuer: fields.ORCHESTRATOR_CUSTOMER_TOKEN_ISSUER,
    tenant: fields.ORCHESTRATOR_CUSTOMER_TOKEN_TENANT,
    ttlSeconds: fields.ORCHESTRATOR_CUSTOMER_TOKEN_TTL_S,
    subjects: fields.ORCHESTRATOR_CUSTOMER_TOKEN_SUBJECTS,
  };
  const resolved = resolveCustomerToken(raw);
  if (resolved.kind === "error") reportConfigError(name, resolved.error);
  return {
    orchestratorCustomerToken: resolved.kind === "configured" ? resolved.config : null,
    orchestratorCustomerTokenError: resolved.kind === "error" ? resolved.error : null,
    orchestratorCustomerTokenTestModes: testModesAllowed(orchestratorBaseUrl),
  };
}

function buildLocal(fields: Record<string, string>, defaultVerifyTls: boolean): Target {
  const defaults = LOCAL_TARGET_DEV_DEFAULTS;
  const orchestratorBaseUrl =
    fields.ORCHESTRATOR_BASE_URL || get("ORCHESTRATOR_BASE_URL", defaults.orchestratorBaseUrl);
  return {
    name: LOCAL_TARGET_NAME,
    label: fields.LABEL || "Local — services on this machine",
    classifierBaseUrl: fields.CLASSIFIER_BASE_URL || get("CLASSIFIER_BASE_URL", defaults.classifierBaseUrl),
    classifierApiKey: fields.CLASSIFIER_API_KEY || get("CLASSIFIER_API_KEY", defaults.classifierApiKey),
    orchestratorBaseUrl,
    orchestratorCustomerKey:
      fields.ORCHESTRATOR_CUSTOMER_API_KEY ||
      get("ORCHESTRATOR_CUSTOMER_API_KEY", defaults.orchestratorCustomerKey),
    orchestratorBusinessKey:
      fields.ORCHESTRATOR_BUSINESS_API_KEY ||
      get("ORCHESTRATOR_BUSINESS_API_KEY", defaults.orchestratorBusinessKey),
    llmBaseUrl: fields.LLM_BASE_URL || get("LLM_BASE_URL", defaults.llmBaseUrl),
    llmApiKey: fields.LLM_API_KEY || get("LLM_API_KEY", defaults.llmApiKey),
    ragBaseUrl: fields.RAG_BASE_URL || get("RAG_BASE_URL", defaults.ragBaseUrl),
    ragApiKey: fields.RAG_API_KEY || get("RAG_API_KEY", defaults.ragApiKey),
    toolsBaseUrl: fields.TOOLS_BASE_URL || get("TOOLS_BASE_URL", defaults.toolsBaseUrl),
    toolsReadApiKey: fields.TOOLS_READ_API_KEY || get("TOOLS_READ_API_KEY", defaults.toolsReadApiKey),
    toolsExecuteApiKey: fields.TOOLS_EXECUTE_API_KEY || get("TOOLS_EXECUTE_API_KEY", defaults.toolsExecuteApiKey),
    ...customerTokenFor(LOCAL_TARGET_NAME, fields, orchestratorBaseUrl),
    verifyTls: boolField(fields.VERIFY_TLS, defaultVerifyTls),
  };
}

export function loadDefaults(): Defaults {
  const declared = collectDeclared();
  const localFields = declared[LOCAL_TARGET_NAME] ?? {};
  delete declared[LOCAL_TARGET_NAME];

  // A target's own VERIFY_TLS wins; otherwise it falls back to this
  // deployment-wide default — server-only either way, never a per-request
  // client choice.
  const defaultVerifyTls = getBool("VERIFY_TLS", true);

  const targets: Record<string, Target> = {
    [LOCAL_TARGET_NAME]: buildLocal(localFields, defaultVerifyTls),
  };

  for (const name of Object.keys(declared).sort()) {
    const fields = declared[name];
    targets[name] = {
      name,
      label: fields.LABEL || name.toUpperCase(),
      classifierBaseUrl: fields.CLASSIFIER_BASE_URL || "",
      classifierApiKey: fields.CLASSIFIER_API_KEY || "",
      orchestratorBaseUrl: fields.ORCHESTRATOR_BASE_URL || "",
      orchestratorCustomerKey: fields.ORCHESTRATOR_CUSTOMER_API_KEY || "",
      orchestratorBusinessKey: fields.ORCHESTRATOR_BUSINESS_API_KEY || "",
      llmBaseUrl: fields.LLM_BASE_URL || "",
      llmApiKey: fields.LLM_API_KEY || "",
      ragBaseUrl: fields.RAG_BASE_URL || "",
      ragApiKey: fields.RAG_API_KEY || "",
      toolsBaseUrl: fields.TOOLS_BASE_URL || "",
      toolsReadApiKey: fields.TOOLS_READ_API_KEY || "",
      toolsExecuteApiKey: fields.TOOLS_EXECUTE_API_KEY || "",
      ...customerTokenFor(name, fields, fields.ORCHESTRATOR_BASE_URL || ""),
      verifyTls: boolField(fields.VERIFY_TLS, defaultVerifyTls),
    };
  }

  let selected = get("TARGET", LOCAL_TARGET_NAME).toLowerCase();
  if (!(selected in targets)) {
    // A typo in AIR_WEB__TARGET must not silently connect you to something
    // else; falling back to local is the safe direction.
    selected = LOCAL_TARGET_NAME;
  }

  const theme = get("THEME", "auto").toLowerCase();

  return {
    targets,
    selected,
    timeoutSeconds: getFloat("TIMEOUT_SECONDS", 60),
    theme: theme === "light" || theme === "dark" ? theme : "auto",
    usdToInrRate: getFloat("USD_TO_INR_RATE", DEFAULT_USD_TO_INR_RATE),
  };
}

export { LOCAL_HOSTS };
