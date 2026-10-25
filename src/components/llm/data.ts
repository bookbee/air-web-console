/**
 * air-model-gateway's model choices and the tab's contract scenarios.
 *
 * Callers never name a model: `POST /v1/generate` takes a class (`local`,
 * `auto`, `cloud`) plus an optional `provider` preference, and
 * `POST /v1/embed` takes a published embedding name. What each choice means
 * for this console is the gateway's own answer on `GET /v1/capabilities`,
 * which the tab loads, so nothing here mirrors `deploy/routing.yaml` by
 * hand. The lists below are only the public vocabulary from
 * `docs/openapi.json`, and suggestions until capabilities arrive.
 */

import type { Exchange } from "@/lib/http/exchange";

import { responseBody } from "./stream";

export type Mode = "generate" | "embed";

export const MODEL_CLASSES = [
  { name: "auto", note: "the gateway's choice (default): local first today, cloud as fallback" },
  { name: "local", note: "our own model servers only; the prompt never leaves the network; free" },
  { name: "cloud", note: "cloud providers only (Gemini, Anthropic, OpenAI)" },
] as const;

export type ModelClass = (typeof MODEL_CLASSES)[number]["name"];

export const PROVIDERS = ["ollama", "llama.cpp", "gemini", "anthropic", "openai"] as const;

const LOCAL_PROVIDERS: readonly string[] = ["ollama", "llama.cpp"];
const CLOUD_PROVIDERS: readonly string[] = ["gemini", "anthropic", "openai"];

/** Which providers a class may offer (integration guide §3); a `provider`
 * outside this is a 422 whatever the chain holds. */
export const CLASS_PROVIDERS: Record<ModelClass, readonly string[]> = {
  local: LOCAL_PROVIDERS,
  cloud: CLOUD_PROVIDERS,
  auto: PROVIDERS,
};

/** Published embedding names, until `/v1/capabilities` says otherwise. */
export const FALLBACK_EMBED_MODELS = ["local-768-v1", "cloud-1536-v1"];

/** The part of `GET /v1/capabilities` this tab reads. */
export interface Capabilities {
  version?: string;
  /** The build (gateway fix for MG-010); absent on older builds. */
  revision?: string;
  environment?: string;
  providers?: Record<string, boolean>;
  /** `available` (gateway fix for MG-004): some provider behind the choice is
   * configured. Absent on older builds, so read it through `isAvailable`. */
  generate?: Record<string, { allowed: boolean; available?: boolean; chain: string[] }>;
  preferred_providers?: string[] | null;
  may_pin?: boolean;
  embed?: Record<string, { allowed: boolean; available?: boolean; provider: string; model: string; dimensions: number }>;
}

/** Whether the gateway can serve an embedding name at all: its own
 * `available` when it reports one, else whether its one provider is configured. */
export function isAvailable(capabilities: Capabilities, spec: { available?: boolean; provider: string }): boolean {
  return spec.available ?? capabilities.providers?.[spec.provider] !== false;
}

/** Every `provider:model` behind any class, in chain order: the useful
 * `pin` suggestions, since a pin outside them is a model nobody routes to. */
export function pinSuggestions(capabilities: Capabilities | null): string[] {
  const seen = new Set<string>();
  for (const entry of Object.values(capabilities?.generate ?? {})) {
    for (const rung of entry.chain) seen.add(rung);
  }
  return [...seen];
}

const HI = [{ role: "user", content: "Say hi in three words." }];
const SENTIMENT_SCHEMA = {
  type: "object",
  properties: { label: { type: "string", enum: ["positive", "negative", "neutral"] } },
  required: ["label"],
};
/** The schema shape a real consumer sends: closed object, one nullable field. */
const NULLABLE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    label: { type: "string", enum: ["positive", "negative", "neutral"] },
    reason: { type: ["string", "null"] },
  },
  required: ["label", "reason"],
};

/** What a scenario's response must show to pass. `shared` (staging/prod)
 * differs from `local` only where the gateway deliberately behaves
 * differently outside local: policy is strict there (no default-allow), and
 * this console's key is granted `generate`, `admin_read` and `pin`, but not
 * `embed`. */
export interface Expectation {
  status: number;
  code?: string;
  /** Extra check on the body (a stream's events folded into one); returns a
   * failure reason, or null. Runs for any status that matched. */
  check?: (body: Record<string, unknown>, exchange: Exchange) => string | null;
}

export interface Scenario {
  id: string;
  group: "happy path" | "streaming" | "contract edges" | "rejections" | "known gaps";
  label: string;
  method: "GET" | "POST";
  path: string;
  body?: Record<string, unknown>;
  /** Sent over the SSE transport (`Accept: text/event-stream`). */
  stream?: boolean;
  /** Sent twice; the second response is the one judged (cache hits). */
  repeat?: boolean;
  local: Expectation;
  shared?: Expectation;
  /** Shown beside the result: what the scenario is for, or what it needs. */
  note: string;
  /** The report under bugs/model-gateway/ this row came from: open while the
   * row is in known gaps, then kept on the row that guards the fix. */
  bug?: string;
}

const isJson = (value: unknown): boolean => {
  if (typeof value !== "string") return false;
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
};

const all = (...checks: (string | null)[]): string | null => checks.find((c) => c !== null) ?? null;
const expect = (ok: boolean, failure: string): string | null => (ok ? null : failure);
const detailNames = (field: string) => (b: Record<string, unknown>) =>
  expect(String(b.detail ?? "").includes(field), `detail doesn't name ${field}`);

const EMBED_DENIED: Expectation = { status: 403, code: "policy_denied" };

function header(headers: Record<string, string>, name: string): string | undefined {
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name);
  return key ? headers[key] : undefined;
}

export const SCENARIOS: readonly Scenario[] = [
  // ---- happy path ----------------------------------------------------------
  {
    id: "health",
    group: "happy path",
    label: "Liveness",
    method: "GET",
    path: "/v1/health",
    local: { status: 200, check: (b) => expect(b.status === "ok", `status ${String(b.status)}`) },
    note: "Ungated; never consults a provider.",
  },
  {
    id: "ready",
    group: "happy path",
    label: "Readiness",
    method: "GET",
    path: "/v1/ready",
    local: { status: 200, check: (b) => expect(b.status === "ready", `status ${String(b.status)}`) },
    note: "503 only when no provider answers at all; Redis never gates it.",
  },
  {
    id: "request-id",
    group: "happy path",
    label: "X-Request-ID echoed",
    method: "GET",
    path: "/v1/health",
    local: {
      status: 200,
      check: (_b, exchange) => {
        const sent = header(exchange.requestHeaders, "x-request-id");
        const echoed = header(exchange.responseHeaders, "x-request-id");
        return expect(Boolean(sent) && sent === echoed, `sent ${String(sent)}, got back ${String(echoed)}`);
      },
    },
    note: "A well-formed caller id is kept and echoed, so one id follows the call.",
  },
  {
    id: "capabilities",
    group: "happy path",
    label: "Capabilities",
    method: "GET",
    path: "/v1/capabilities",
    local: {
      status: 200,
      check: (b) => {
        const caps = b as Capabilities;
        const missing = MODEL_CLASSES.map((c) => c.name).filter((name) => !caps.generate?.[name]?.chain?.length);
        return all(
          expect(missing.length === 0, `no chain for ${missing.join(", ")}`),
          expect(Boolean(caps.embed?.["local-768-v1"]), "local-768-v1 not published"),
          expect(typeof caps.may_pin === "boolean", "no may_pin"),
        );
      },
    },
    note: "Every class has a chain for this console; the embedding names are listed.",
  },
  {
    id: "policy",
    group: "happy path",
    label: "Admin policy dump",
    method: "GET",
    path: "/v1/admin/policy",
    local: { status: 200 },
    note: "air-web-console holds admin_read in every environment.",
  },
  {
    id: "generate-default",
    group: "happy path",
    label: "Generate, no class named",
    method: "POST",
    path: "/v1/generate",
    body: { messages: HI, max_tokens: 30, cache: false },
    local: {
      status: 200,
      check: (b) => all(expect(b.model_class === "auto", `model_class ${String(b.model_class)}`), expect(Boolean(b.content), "empty content")),
    },
    note: "Omitted model means auto.",
  },
  {
    id: "generate-local",
    group: "happy path",
    label: "Class local",
    method: "POST",
    path: "/v1/generate",
    body: { model: "local", messages: HI, max_tokens: 30, cache: false },
    local: {
      status: 200,
      check: (b) =>
        all(
          expect(LOCAL_PROVIDERS.includes(String(b.provider)), `answered by ${String(b.provider)}`),
          expect(b.cost_usd === 0, `local call priced at ${String(b.cost_usd)}`),
        ),
    },
    note: "Must stay on a local provider and cost 0.",
  },
  {
    id: "generate-cloud",
    group: "happy path",
    label: "Class cloud",
    method: "POST",
    path: "/v1/generate",
    body: { model: "cloud", messages: HI, max_tokens: 300, cache: false },
    local: {
      status: 200,
      check: (b) =>
        all(
          expect(CLOUD_PROVIDERS.includes(String(b.provider)), `answered by ${String(b.provider)}`),
          expect(typeof b.cost_usd === "number" && b.cost_usd > 0, "cloud call priced at 0"),
        ),
    },
    note: "Needs a cloud key (small cost). Never served locally.",
  },
  {
    id: "cloud-prefer-anthropic",
    group: "happy path",
    label: "cloud + provider: anthropic",
    method: "POST",
    path: "/v1/generate",
    body: { model: "cloud", provider: "anthropic", messages: HI, max_tokens: 30, cache: false },
    local: { status: 200, check: (b) => expect(b.provider === "anthropic", `answered by ${String(b.provider)}`) },
    note: "A preference moves that provider's rungs first. Needs an Anthropic key.",
  },
  {
    id: "pin-local",
    group: "happy path",
    label: "pin ollama:llama3.2:3b",
    method: "POST",
    path: "/v1/generate",
    body: { pin: "ollama:llama3.2:3b", messages: HI, max_tokens: 20, cache: false },
    local: {
      status: 200,
      check: (b) =>
        all(
          expect(b.model_class === null, `model_class ${String(b.model_class)}, expected null`),
          expect(b.model === "llama3.2:3b", `model ${String(b.model)}`),
        ),
    },
    note: "Exact model, no fallback; model_class is null when pinned.",
  },
  {
    id: "cache-hit",
    group: "happy path",
    label: "Identical call twice → cache hit",
    method: "POST",
    path: "/v1/generate",
    body: { model: "local", messages: [{ role: "user", content: "Name one colour." }], max_tokens: 10 },
    repeat: true,
    local: {
      status: 200,
      check: (b) => expect(b.cached === true && b.cost_usd === 0, `cached=${String(b.cached)}, cost=${String(b.cost_usd)}`),
    },
    note: "Second call must be cached: true at cost 0.",
  },
  {
    id: "cache-off",
    group: "happy path",
    label: "cache: false twice → never cached",
    method: "POST",
    path: "/v1/generate",
    body: { model: "local", messages: [{ role: "user", content: "Name one colour." }], max_tokens: 10, cache: false },
    repeat: true,
    local: { status: 200, check: (b) => expect(b.cached === false, "served from cache despite cache: false") },
    note: "Skips both the lookup and the store.",
  },
  {
    id: "structured-local",
    group: "happy path",
    label: "Structured output, local",
    method: "POST",
    path: "/v1/generate",
    body: {
      model: "local",
      messages: [{ role: "user", content: "Classify the sentiment: I love this product!" }],
      json_schema: SENTIMENT_SCHEMA,
      schema_name: "sentiment",
      max_tokens: 60,
      cache: false,
    },
    local: { status: 200, check: (b) => expect(isJson(b.content), "content is not JSON") },
    note: "The gateway forwards the schema, never checks it; this does.",
  },
  {
    id: "embed-local",
    group: "happy path",
    label: "Embed local-768-v1",
    method: "POST",
    path: "/v1/embed",
    body: { model: "local-768-v1", input: ["hello", "world"] },
    local: {
      status: 200,
      check: (b) => {
        const vectors = Array.isArray(b.embeddings) ? (b.embeddings as unknown[][]) : [];
        return all(
          expect(vectors.length === 2, `${vectors.length} vectors for 2 inputs`),
          expect(b.dimensions === 768 && vectors.every((v) => v.length === 768), "not 768 dimensions"),
          expect(b.embedding_model === "local-768-v1", `embedding_model ${String(b.embedding_model)}`),
        );
      },
    },
    shared: EMBED_DENIED,
    note: "Outside local, this console's key has no embed grant (policy.*.yaml).",
  },

  // ---- streaming -----------------------------------------------------------
  {
    id: "stream-local",
    group: "streaming",
    label: "Stream, class local",
    method: "POST",
    path: "/v1/generate",
    body: { model: "local", stream: true, cache: false, max_tokens: 60, messages: [{ role: "user", content: "Count from one to ten in words." }] },
    stream: true,
    local: {
      status: 200,
      check: (b) => {
        const s = b.stream as Record<string, unknown>;
        return all(
          expect(s.started === true, "no start event"),
          expect(s.done === true, s.error ? `error event: ${String(s.error)}` : "no done event"),
          expect(Number(s.deltas) > 1, `${String(s.deltas)} delta(s)`),
          expect(Boolean(b.content), "deltas concatenate to nothing"),
        );
      },
    },
    note: "start, several deltas, then done with usage and finish_reason.",
  },
  {
    id: "stream-cache-hit",
    group: "streaming",
    label: "Stream a cached answer",
    method: "POST",
    path: "/v1/generate",
    body: { model: "local", stream: true, max_tokens: 10, messages: [{ role: "user", content: "Name one fruit." }] },
    stream: true,
    repeat: true,
    local: {
      status: 200,
      check: (b) => {
        const s = b.stream as Record<string, unknown>;
        return all(
          expect(s.cachedStart === true, "start not cached: true"),
          expect(s.deltas === 1, `${String(s.deltas)} deltas, expected the whole answer in one`),
          expect(s.done === true, "no done event"),
        );
      },
    },
    note: "A hit replays as start (cached: true), one delta, done.",
  },
  {
    id: "stream-error-before-start",
    group: "streaming",
    label: "Stream rejected before it starts",
    method: "POST",
    path: "/v1/generate",
    body: { model: "local", provider: "gemini", stream: true, messages: HI },
    stream: true,
    local: { status: 422, code: "invalid_model_choice" },
    note: "Errors before the first token are ordinary problem+json, not SSE.",
  },

  // ---- contract edges --------------------------------------------------------
  {
    id: "truncated",
    group: "contract edges",
    label: "Cut off at max_tokens (twice)",
    method: "POST",
    path: "/v1/generate",
    body: { model: "local", messages: [{ role: "user", content: "List ten fruits." }], max_tokens: 3 },
    repeat: true,
    local: {
      status: 200,
      check: (b) =>
        all(
          expect(b.finish_reason === "length", `finish_reason ${String(b.finish_reason)}`),
          expect(b.cached === false, "a cut-off answer was cached"),
        ),
    },
    note: "finish_reason: length, and never cached.",
  },
  {
    id: "anthropic-temperature",
    group: "contract edges",
    label: "temperature on an Anthropic rung",
    method: "POST",
    path: "/v1/generate",
    body: { model: "cloud", provider: "anthropic", messages: HI, max_tokens: 20, temperature: 0.3, cache: false },
    local: { status: 200, check: (b) => expect(b.provider === "anthropic", `fell over to ${String(b.provider)}`) },
    note: "Anthropic's API dropped sampling parameters; the gateway must not forward it and fail the rung.",
  },

  // ---- rejections ------------------------------------------------------------
  {
    id: "unknown-field",
    group: "rejections",
    label: "Unknown field stream_options",
    method: "POST",
    path: "/v1/generate",
    body: { messages: HI, stream_options: { include_usage: true } },
    local: { status: 422, code: "validation_error", check: detailNames("stream_options") },
    note: "Unsupported options are a 422 naming the field, never ignored.",
  },
  {
    id: "legacy-task",
    group: "rejections",
    label: "Leftover task field",
    method: "POST",
    path: "/v1/generate",
    body: { task: "chat", messages: HI },
    local: { status: 422, code: "validation_error", check: detailNames("task") },
    note: "The most likely migration leftover from /v1/inference.",
  },
  {
    id: "legacy-alias",
    group: "rejections",
    label: "Old alias as model",
    method: "POST",
    path: "/v1/generate",
    body: { model: "classify-default", messages: HI },
    local: { status: 422, code: "validation_error", check: detailNames("model") },
    note: "Nothing maps the old aliases any more.",
  },
  {
    id: "local-anthropic",
    group: "rejections",
    label: "local + provider: anthropic",
    method: "POST",
    path: "/v1/generate",
    body: { model: "local", provider: "anthropic", messages: HI },
    local: { status: 422, code: "invalid_model_choice" },
    note: "A provider the class doesn't offer.",
  },
  {
    id: "pin-with-model",
    group: "rejections",
    label: "pin together with model",
    method: "POST",
    path: "/v1/generate",
    body: { model: "auto", pin: "ollama:llama3.2:3b", messages: HI },
    local: { status: 422, code: "validation_error" },
    note: "A pin stands alone, even beside the default class sent explicitly.",
  },
  {
    id: "malformed-pin",
    group: "rejections",
    label: "pin with an unknown provider",
    method: "POST",
    path: "/v1/generate",
    body: { pin: "bogus:model", messages: HI },
    local: { status: 422, code: "validation_error" },
    note: "provider:model, provider one of the five.",
  },
  {
    id: "max-tokens-zero",
    group: "rejections",
    label: "max_tokens: 0",
    method: "POST",
    path: "/v1/generate",
    body: { messages: HI, max_tokens: 0 },
    local: { status: 422, code: "validation_error" },
    note: "Ollama reads ≤ 0 as no cap at all.",
  },
  {
    id: "temperature-range",
    group: "rejections",
    label: "temperature: 5",
    method: "POST",
    path: "/v1/generate",
    body: { messages: HI, temperature: 5 },
    local: { status: 422, code: "validation_error" },
    note: "Range 0–2.",
  },
  {
    id: "bad-role",
    group: "rejections",
    label: "Unknown message role",
    method: "POST",
    path: "/v1/generate",
    body: { messages: [{ role: "tool", content: "hi" }] },
    local: { status: 422, code: "validation_error" },
    note: "Only system, user and assistant.",
  },
  {
    id: "message-name",
    group: "rejections",
    label: "Extra message field name",
    method: "POST",
    path: "/v1/generate",
    body: { messages: [{ role: "user", content: "hi", name: "alex" }] },
    local: { status: 422, code: "validation_error", check: detailNames("name") },
    note: "Fields from other APIs' message shapes are rejected.",
  },
  {
    id: "no-messages",
    group: "rejections",
    label: "Empty messages",
    method: "POST",
    path: "/v1/generate",
    body: { messages: [] },
    local: { status: 422, code: "validation_error" },
    note: "At least one message.",
  },
  {
    id: "unpublished-embed",
    group: "rejections",
    label: "Unpublished embedding name",
    method: "POST",
    path: "/v1/embed",
    body: { model: "local-1024-v1", input: ["hello"] },
    local: { status: 422, code: "invalid_model_choice" },
    shared: EMBED_DENIED,
    note: "Well-formed but not published. Outside local the missing embed grant answers first.",
  },
  {
    id: "legacy-embed-alias",
    group: "rejections",
    label: "Embed with old alias rag-embed",
    method: "POST",
    path: "/v1/embed",
    body: { model: "rag-embed", input: ["hello"] },
    local: { status: 422, code: "validation_error" },
    note: "Validated before policy, so 422 in every environment.",
  },
  {
    id: "embed-no-input",
    group: "rejections",
    label: "Embed without input",
    method: "POST",
    path: "/v1/embed",
    body: { model: "local-768-v1", input: [] },
    local: { status: 422, code: "validation_error" },
    note: "At least one text.",
  },
  {
    id: "inference-removed",
    group: "rejections",
    label: "Removed /v1/inference",
    method: "POST",
    path: "/v1/inference",
    body: { task: "chat", messages: HI },
    local: { status: 404 },
    note: "The old route is gone.",
  },

  // ---- fixed gateway bugs: each row guards its fix against a regression ---------
  {
    id: "gemini-nullable-schema",
    group: "happy path",
    bug: "MG-001",
    label: "Gemini structured output, nullable field",
    method: "POST",
    path: "/v1/generate",
    body: {
      pin: "gemini:gemini-2.5-flash",
      messages: [{ role: "user", content: "Classify the sentiment: I love this product!" }],
      json_schema: NULLABLE_SCHEMA,
      schema_name: "sentiment",
      max_tokens: 400,
      cache: false,
    },
    local: { status: 200, check: (b) => expect(isJson(b.content), "content is not JSON") },
    note: "A union type used to crash the Gemini adapter, and under cloud traffic silently failed over to a pricier rung. Needs a Gemini key.",
  },
  {
    id: "unpriced-pin",
    group: "rejections",
    bug: "MG-002",
    label: "Pin to an unpriced paid model is refused",
    method: "POST",
    path: "/v1/generate",
    body: { pin: "anthropic:claude-sonnet-4-5", messages: HI, max_tokens: 5, cache: false },
    local: { status: 422, code: "invalid_model_choice" },
    note: "A pin to a model missing from pricing.yaml would bill at the provider and count $0 against daily_budget_usd. Refused before any paid call.",
  },
  {
    id: "404-problem",
    group: "contract edges",
    bug: "MG-003",
    label: "404 is problem+json",
    method: "POST",
    path: "/v1/inference",
    body: { task: "chat", messages: HI },
    local: {
      status: 404,
      check: (b) => all(expect(typeof b.code === "string", "no code in body"), expect(typeof b.request_id === "string", "no request_id in body")),
    },
    note: "\"Every error body is application/problem+json\", routing errors included (they used to be FastAPI's plain {detail}).",
  },
  {
    id: "capabilities-usable",
    group: "contract edges",
    bug: "MG-004",
    label: "Capabilities offers only usable choices",
    method: "GET",
    path: "/v1/capabilities",
    local: {
      status: 200,
      check: (b) => {
        const caps = b as Capabilities;
        // Fixed when every embed name whose provider is unconfigured says so itself.
        const silent = Object.entries(caps.embed ?? {})
          .filter(([, spec]) => caps.providers?.[spec.provider] === false && spec.available !== false)
          .map(([name, spec]) => `${name} (${spec.provider} unconfigured)`);
        return expect(silent.length === 0, `no available:false on: ${silent.join(", ")}`);
      },
    },
    note: "An allowed embedding name whose one provider isn't configured can never answer, so capabilities says so (available: false).",
  },
  {
    id: "405-problem",
    group: "contract edges",
    bug: "MG-003",
    label: "405 is problem+json",
    method: "GET",
    path: "/v1/generate",
    local: {
      status: 405,
      check: (b) => all(expect(b.code === "method_not_allowed", "no method_not_allowed code"), expect(typeof b.request_id === "string", "no request_id in body")),
    },
    note: "A wrong method is an error like any other.",
  },
  {
    id: "pin-unknown-model",
    group: "rejections",
    bug: "MG-005",
    label: "Pin to a model the provider lacks is the caller's 422",
    method: "POST",
    path: "/v1/generate",
    body: { pin: "ollama:no-such-model", messages: HI, max_tokens: 5 },
    local: {
      status: 422,
      code: "invalid_model_choice",
      // MG-006: the provider's own reason reaches the detail.
      check: (b) => expect(String(b.detail ?? "").includes("not found"), "Ollama's reason (model not found) missing from detail"),
    },
    note: "Retrying can't help, so it must not be a 502. Also checks MG-006 (the provider's reason is kept).",
  },
  {
    id: "embed-too-many",
    group: "rejections",
    bug: "MG-005",
    label: "Oversized embed batch is refused up front",
    method: "POST",
    path: "/v1/embed",
    body: { model: "local-768-v1", input: Array.from({ length: 2049 }, (_, i) => `text ${i}`) },
    local: { status: 422, code: "validation_error" },
    shared: { status: 422, code: "validation_error" },
    note: "More than 2,048 texts: an immediate 422, not a provider tied up before a 502.",
  },
  {
    id: "too-many-messages",
    group: "rejections",
    bug: "MG-005",
    label: "Oversized conversation is refused up front",
    method: "POST",
    path: "/v1/generate",
    body: { messages: Array.from({ length: 501 }, () => ({ role: "user", content: "hi" })) },
    local: { status: 422, code: "validation_error" },
    shared: { status: 422, code: "validation_error" },
    note: "More than 500 messages: 422 before any provider is called.",
  },

  // ---- known gaps: one row per open bug with a live repro (bugs/README.md). It
  // asserts what the contract promises, so it fails until the gateway fix lands.
  {
    id: "gap-gemini-thinking-cap",
    group: "known gaps",
    bug: "MG-011",
    label: "Gemini finishes within max_tokens 300",
    method: "POST",
    path: "/v1/generate",
    body: {
      pin: "gemini:gemini-2.5-flash",
      messages: [{ role: "user", content: "In one sentence, why might a customer's parcel arrive late?" }],
      max_tokens: 300,
      cache: false,
    },
    local: { status: 200, check: (b) => expect(b.finish_reason === "stop", `finish_reason ${String(b.finish_reason)}: thinking used up the cap`) },
    note: "The integration guide says 300 is enough; Gemini's thinking spends it all and the answer is cut off. Needs a Gemini key; under a cent.",
  },
];

export function expectationFor(scenario: Scenario, environment: string | null): Expectation {
  return environment && environment !== "local" && scenario.shared ? scenario.shared : scenario.local;
}

/** Judge one exchange against an expectation: the failure reason, or null. */
export function judge(exchange: Exchange, expected: Expectation): string | null {
  if (exchange.error) return exchange.error;
  const body = responseBody(exchange);
  if (exchange.statusCode !== expected.status) {
    const code = typeof body.code === "string" ? ` ${body.code}` : "";
    return `got ${exchange.statusCode}${code}`;
  }
  if (expected.code && body.code !== expected.code) return `code ${String(body.code)}`;
  return expected.check ? expected.check(body, exchange) : null;
}

/** Splits a 502's `all providers failed: a; b; c` detail into one line per rung. */
export function rungFailures(detail: unknown): string[] {
  if (typeof detail !== "string") return [];
  const prefix = "all providers failed: ";
  if (!detail.startsWith(prefix)) return [];
  return detail
    .slice(prefix.length)
    // Split only where the next rung starts with a provider name, so a "; "
    // inside an upstream error message stays on its own rung's line.
    .split(/; (?=(?:ollama|anthropic|openai|gemini|llama\.cpp):)/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Run-all tally, split so an open known gap never reads as a regression:
 * contract rows must all pass; a known gap that passes means its fix landed. */
export function tally(results: readonly { scenario: Scenario; failure: string | null }[]) {
  const contract = results.filter((r) => r.scenario.group !== "known gaps");
  const gaps = results.filter((r) => r.scenario.group === "known gaps");
  return {
    contractPassed: contract.filter((r) => r.failure === null).length,
    contractTotal: contract.length,
    gapsOpen: gaps.filter((r) => r.failure !== null).length,
    gapsFixed: [...new Set(gaps.filter((r) => r.failure === null).map((r) => r.scenario.bug ?? r.scenario.id))],
  };
}
