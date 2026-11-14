/**
 * air-rag-service: the retrieval contract this tab reads, and its contract
 * scenarios.
 *
 * The service has one business route, `POST /v1/retrieve` (`{query, top_k?,
 * user_id?}` in, `{query, citations[]}` out), and is read-only. The tenant is
 * the key's, never the request's: a body that names one is a 422. So every
 * successful retrieve is also checked for isolation (every citation is the
 * key's tenant, `status: active`, and from no document seeding must have
 * skipped), not only the rows written to test it.
 *
 * The SIT retrieval cases are not retyped here: `sit-queries.json` is a
 * byte-for-byte copy of `../air-rag-service/sit/queries.json`, judged the way
 * that repo's `scripts/sit_check.py` judges it. `make rag-check` reads the
 * sibling file when it's present and reports drift from this copy.
 *
 * Pure (no React, no fetch), so it is unit-tested alongside.
 */

import type { Exchange } from "@/lib/http/exchange";

import sitQueries from "./sit-queries.json";

export const PROBLEM_TYPE_BASE = "https://air.dev/problems/air-rag-service/";
/** The local dev key's tenant; `GET /v1/capabilities` names the real one. */
export const DEFAULT_TENANT = "brightcart";
/** Documents in sit/corpus that must never be cited: another tenant's, and
 * one with no tenant that seeding skips. */
export const NEVER_RETURNED: readonly string[] = ["acme-returns", "draft-no-tenant"];
export const EMPTY_INDEX = "index empty: start rag with make run-sit";

export const QUERY_MAX_CHARS = 4000;
export const TOP_K_MIN = 1;
export const TOP_K_MAX = 50;
export const TOP_K_DEFAULT = 5;

export interface Citation {
  source_id: string;
  snippet: string;
  score: number;
  metadata?: Record<string, unknown>;
}

/** `GET /v1/capabilities`. `document_count` counts every tenant's chunks. */
export interface RagCapabilities {
  service?: string;
  version?: string;
  env?: string;
  vector_store_backend?: string;
  document_count?: number;
  tenant?: string;
}

/** `GET /v1/ready`: 503 when the gateway can't serve the embed model. An
 * empty index is still ready, with a warning. */
export interface RagReadiness {
  ready?: boolean;
  service?: string;
  version?: string;
  checked_at?: string;
  dependencies?: { service: string; configured: boolean; reachable: boolean; latency_ms: number | null; detail: string | null }[];
  document_count?: number;
  warnings?: string[];
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

/** The citations in a retrieve body, or [] for anything else. */
export function citationsOf(body: unknown): Citation[] {
  const citations = record(body).citations;
  return Array.isArray(citations) ? (citations.filter((c) => c && typeof c === "object") as Citation[]) : [];
}

/** The document a citation came from: `metadata.source_id` when present,
 * else `source_id` before its `#` (as `sit_check.py` reads it). */
export function sourceOf(citation: Citation): string {
  const fromMetadata = citation.metadata?.source_id;
  if (typeof fromMetadata === "string" && fromMetadata) return fromMetadata;
  return String(citation.source_id ?? "").split("#")[0];
}

/** The chunk part of `source_id` (`<doc>#<chunk>`), or null when there is none. */
export function chunkOf(citation: Citation): string | null {
  const id = String(citation.source_id ?? "");
  const at = id.indexOf("#");
  return at >= 0 && at < id.length - 1 ? id.slice(at + 1) : null;
}

export interface CitationRow {
  rank: number;
  source: string;
  chunk: string | null;
  score: number;
  title: string;
  uri: string;
  tenant: string;
  status: string;
  snippet: string;
  /** Why this citation shouldn't be here, for the key's tenant; null if fine. */
  leak: string | null;
}

const str = (value: unknown): string => (typeof value === "string" ? value : value == null ? "" : String(value));

/** Why one citation breaks isolation for `tenant`, or null. */
export function leakOf(citation: Citation, tenant: string): string | null {
  const metadata = citation.metadata ?? {};
  if (metadata.tenant !== tenant) return `tenant ${str(metadata.tenant) || "missing"}`;
  if (metadata.status !== "active") return `status ${str(metadata.status) || "missing"}`;
  if (NEVER_RETURNED.includes(sourceOf(citation))) return `${sourceOf(citation)} must never be cited`;
  return null;
}

export function citationRows(body: unknown, tenant: string): CitationRow[] {
  return citationsOf(body).map((citation, index) => {
    const metadata = citation.metadata ?? {};
    return {
      rank: index + 1,
      source: sourceOf(citation),
      chunk: chunkOf(citation),
      score: typeof citation.score === "number" ? citation.score : Number.NaN,
      title: str(metadata.title),
      uri: str(metadata.uri),
      tenant: str(metadata.tenant),
      status: str(metadata.status),
      snippet: str(citation.snippet),
      leak: leakOf(citation, tenant),
    };
  });
}

/** Isolation, checked on every successful retrieve: the failure, or null. */
export function isolationFailure(body: unknown, tenant: string): string | null {
  const leaks = citationsOf(body)
    .map((citation) => [citation.source_id, leakOf(citation, tenant)] as const)
    .filter(([, leak]) => leak !== null);
  return leaks.length ? `isolation leak: ${leaks.map(([id, leak]) => `${id} (${leak})`).join(", ")}` : null;
}

/** The shape every citation must have: the failure, or null. */
export function shapeFailure(body: unknown): string | null {
  const citations = citationsOf(body);
  if (!Array.isArray(record(body).citations)) return "no citations array";
  for (const [index, c] of citations.entries()) {
    if (typeof c.source_id !== "string" || !c.source_id.includes("#")) return `citation ${index + 1}: source_id isn't <doc>#<chunk>`;
    if (typeof c.score !== "number" || c.score < 0 || c.score > 1) return `citation ${index + 1}: score outside 0..1`;
    if (typeof c.snippet !== "string" || !c.snippet.trim()) return `citation ${index + 1}: empty snippet`;
    if (index > 0 && c.score > citations[index - 1].score) return `citation ${index + 1} outranks a higher score`;
  }
  return null;
}

/** Before any SIT row: the index must hold something, or every case fails
 * for a reason that has nothing to do with retrieval. */
export function preflightFailure(capabilities: unknown): string | null {
  const count = record(capabilities).document_count;
  return typeof count === "number" && count > 0 ? null : EMPTY_INDEX;
}

// ---- the SIT query set -------------------------------------------------

export interface SitCase {
  query: string;
  expect: string;
  within?: number;
  forbid_top?: string;
  known_gap?: boolean;
  _note?: string;
}

export const SIT_CASES: readonly SitCase[] = (sitQueries as { cases: SitCase[] }).cases;

/** The `top_k` a case is sent with (as `sit_check.py` sends it). */
export const sitTopK = (c: SitCase): number => Math.max(c.within ?? 3, 5);

/** One SIT case against a retrieve body: the failure, or null. */
export function judgeSitCase(c: SitCase, body: unknown): string | null {
  const within = c.within ?? 3;
  const ranked = citationsOf(body).map(sourceOf);
  if (c.forbid_top && ranked[0] === c.forbid_top) return `${c.forbid_top} ranked #1`;
  const rank = ranked.slice(0, within).indexOf(c.expect);
  if (rank >= 0) return null;
  const anywhere = ranked.indexOf(c.expect);
  return anywhere >= 0
    ? `${c.expect} at #${anywhere + 1}, not within ${within}`
    : `${c.expect} not cited (top: ${ranked[0] ?? "none"})`;
}

// ---- scenarios ---------------------------------------------------------

export interface RunContext {
  /** The key's tenant, from `GET /v1/capabilities`. */
  tenant: string;
}

export interface Expectation {
  /** Several when the contract allows either (recorded in the report). */
  status: number | readonly number[];
  /** The problem `type` slug, for an error. */
  slug?: string;
  /** False when an error status carries a report, not a problem: `/v1/ready`'s
   * 503 is its readiness body (`ready: false`) by design. */
  problem?: false;
  check?: (body: Record<string, unknown>, exchange: Exchange, context: RunContext) => string | null;
}

/** Sent around the BFF, by `make rag-check` only: the BFF always attaches
 * the target's key and its own request id, and sends a body as JSON. */
export interface Direct {
  auth: "key" | "none" | "invalid" | "scoped";
  /** Sent verbatim, unparsed. */
  rawBody?: string;
  requestId?: string;
}

export type Group =
  | "health"
  | "contract edges"
  | "rejections"
  | "retrieval (SIT)"
  | "headless"
  | "operator"
  | "known gaps";

export interface Scenario {
  id: string;
  group: Group;
  label: string;
  method: "GET" | "POST";
  path: string;
  body?: unknown;
  direct?: Direct;
  /** Needs the index seeded from sit/corpus (preflight first). */
  sit?: boolean;
  /** An operator step that must happen first; never part of "Run all". */
  operator?: string;
  expected: Expectation;
  note: string;
  /** Its report under bugs/rag/. */
  bug?: string;
}

const all = (...checks: (string | null)[]): string | null => checks.find((c) => c !== null) ?? null;
const expect = (ok: boolean, failure: string): string | null => (ok ? null : failure);

function header(headers: Record<string, string>, name: string): string | undefined {
  const lower = name.toLowerCase();
  return Object.entries(headers).find(([key]) => key.toLowerCase() === lower)?.[1];
}

/** The request id the console sent, and whether it came back in the header
 * and in the problem body. */
export function requestIdEchoFailure(body: Record<string, unknown>, exchange: Exchange): string | null {
  const sent = header(exchange.requestHeaders, "x-request-id");
  if (!sent) return "no X-Request-ID was sent";
  return all(
    expect(header(exchange.responseHeaders, "x-request-id") === sent, `X-Request-ID header not echoed (sent ${sent})`),
    exchange.statusCode !== null && exchange.statusCode >= 400
      ? expect(body.request_id === sent, `problem request_id ${str(body.request_id)} ≠ ${sent}`)
      : null,
  );
}

const fieldErrors = (field: string) => (b: Record<string, unknown>) => {
  const errors = Array.isArray(b.errors) ? (b.errors as { field?: unknown }[]) : [];
  if (errors.length === 0) return "no errors[]";
  return expect(errors.some((e) => str(e.field) === field || str(e.field).endsWith(`.${field}`)), `errors[] doesn't name ${field}`);
};

const HEALTHY = (b: Record<string, unknown>) =>
  all(expect(b.status === "ok", `status ${str(b.status)}`), expect(b.service === "air-rag-service", `service ${str(b.service)}`));

const VALIDATION = (field: string): Expectation => ({ status: 422, slug: "validation-error", check: fieldErrors(field) });

const RETRIEVE = "/v1/retrieve";

function sitScenario(c: SitCase, index: number): Scenario {
  const n = String(index + 1).padStart(2, "0");
  return {
    id: `sit-${n}`,
    group: c.known_gap ? "known gaps" : "retrieval (SIT)",
    label: c.query,
    method: "POST",
    path: RETRIEVE,
    body: { query: c.query, top_k: sitTopK(c) },
    sit: true,
    expected: { status: 200, check: (b) => judgeSitCase(c, b) },
    note:
      `${c.expect} within the top ${c.within ?? 3}` +
      (c.forbid_top ? `; ${c.forbid_top} must not be #1` : "") +
      (c._note ? `. ${c._note}` : ""),
  };
}

export const SCENARIOS: readonly Scenario[] = [
  // ---- health and status
  {
    id: "health",
    group: "health",
    label: "Health answers",
    method: "GET",
    path: "/v1/health",
    expected: { status: 200, check: HEALTHY },
    note: "Liveness: depends on nothing.",
  },
  {
    id: "ready",
    group: "health",
    label: "Ready, and names the gateway it embeds through",
    method: "GET",
    path: "/v1/ready",
    expected: {
      status: 200,
      check: (b) => {
        const ready = b as RagReadiness;
        return all(
          expect(ready.ready === true, "ready isn't true"),
          expect(ready.dependencies?.[0]?.service === "air-model-gateway", "dependencies[0] isn't air-model-gateway"),
          expect(ready.document_count !== 0 || (ready.warnings ?? []).length > 0, "empty index with no warning"),
        );
      },
    },
    note: "503 means the gateway can't serve the embed model. An empty index is still ready but must warn.",
  },
  {
    id: "capabilities",
    group: "health",
    label: "Capabilities names the key's tenant",
    method: "GET",
    path: "/v1/capabilities",
    expected: {
      status: 200,
      check: (b) => {
        const caps = b as RagCapabilities;
        return all(
          expect(typeof caps.tenant === "string" && caps.tenant.length > 0, "no tenant"),
          expect(typeof caps.document_count === "number", "no document_count"),
          expect(typeof caps.vector_store_backend === "string", "no vector_store_backend"),
        );
      },
    },
    note: "Needs admin:read. document_count is across all tenants.",
  },

  // ---- contract edges
  {
    id: "request-id-echo",
    group: "contract edges",
    label: "X-Request-ID comes back in the header and the problem",
    method: "POST",
    path: RETRIEVE,
    body: { query: "" },
    expected: { status: 422, slug: "validation-error", check: requestIdEchoFailure },
    note: "The BFF sends its own web_… id; the service must echo that exact value.",
  },
  {
    id: "404-problem",
    group: "contract edges",
    label: "Unknown path is a problem+json 404",
    method: "GET",
    path: "/v1/no-such-route",
    expected: { status: 404, slug: "not-found" },
    note: "Routing errors use the same problem shape as every other error.",
  },
  {
    id: "405-problem",
    group: "contract edges",
    label: "GET /v1/retrieve is a problem+json 405",
    method: "GET",
    path: RETRIEVE,
    expected: { status: 405 },
    note: "A wrong method is an error like any other.",
  },
  {
    id: "retrieve-shape",
    group: "contract edges",
    label: "top_k is honoured and citations are well-formed",
    method: "POST",
    path: RETRIEVE,
    body: { query: "how do returns work", top_k: 2 },
    sit: true,
    expected: {
      status: 200,
      check: (b) => all(expect(citationsOf(b).length <= 2, `${citationsOf(b).length} citations for top_k 2`), shapeFailure(b)),
    },
    note: "At most top_k, best first, scores in 0..1, source_id <doc>#<chunk>, a snippet each.",
  },

  // ---- rejections (each through the BFF, so the 422 is the service's)
  {
    id: "tenant-in-body",
    group: "rejections",
    label: "A tenant in the body is refused, not ignored",
    method: "POST",
    path: RETRIEVE,
    body: { query: "return policy", tenant: "acme" },
    expected: VALIDATION("tenant"),
    note: "The tenant is the key's. Silently ignoring it would let a caller believe it searched acme.",
  },
  { id: "top-k-0", group: "rejections", label: "top_k 0", method: "POST", path: RETRIEVE, body: { query: "returns", top_k: 0 }, expected: VALIDATION("top_k"), note: "top_k is 1..50." },
  { id: "top-k-51", group: "rejections", label: "top_k 51", method: "POST", path: RETRIEVE, body: { query: "returns", top_k: 51 }, expected: VALIDATION("top_k"), note: "top_k is 1..50." },
  { id: "query-empty", group: "rejections", label: "Empty query", method: "POST", path: RETRIEVE, body: { query: "" }, expected: VALIDATION("query"), note: "query is 1..4000 characters." },
  {
    id: "query-4001",
    group: "rejections",
    label: "4,001-character query",
    method: "POST",
    path: RETRIEVE,
    body: { query: "a".repeat(QUERY_MAX_CHARS + 1) },
    expected: VALIDATION("query"),
    note: "One past the cap.",
  },
  { id: "query-missing", group: "rejections", label: "No query", method: "POST", path: RETRIEVE, body: { top_k: 3 }, expected: VALIDATION("query"), note: "query is required." },
  {
    id: "unknown-field",
    group: "rejections",
    label: "Unknown field",
    method: "POST",
    path: RETRIEVE,
    body: { query: "returns", filters: { kind: "policy" } },
    expected: VALIDATION("filters"),
    note: "The body is extra=\"forbid\".",
  },

  // ---- headless: around the BFF (make rag-check only)
  {
    id: "health-no-key",
    group: "headless",
    label: "Health answers with no key",
    method: "GET",
    path: "/v1/health",
    direct: { auth: "none" },
    expected: { status: 200, check: HEALTHY },
    note: "A liveness probe needs no credentials.",
  },
  {
    id: "no-key",
    group: "headless",
    label: "No key on /v1/retrieve",
    method: "POST",
    path: RETRIEVE,
    body: { query: "returns" },
    direct: { auth: "none" },
    expected: { status: 401, slug: "missing-api-key" },
    note: "The BFF always attaches the target's key, so only the headless run can leave it off.",
  },
  {
    id: "bad-key",
    group: "headless",
    label: "Invalid key on /v1/retrieve",
    method: "POST",
    path: RETRIEVE,
    body: { query: "returns" },
    direct: { auth: "invalid" },
    expected: { status: 401, slug: "missing-api-key" },
    note: "A wrong key is as unauthenticated as none.",
  },
  {
    id: "capabilities-no-key",
    group: "headless",
    label: "No key on /v1/capabilities",
    method: "GET",
    path: "/v1/capabilities",
    direct: { auth: "none" },
    expected: { status: 401, slug: "missing-api-key" },
    note: "Capabilities is admin:read.",
  },
  {
    id: "malformed-json",
    group: "headless",
    label: "Malformed JSON is a client error",
    method: "POST",
    path: RETRIEVE,
    direct: { auth: "key", rawBody: '{"query":' },
    expected: { status: [400, 422] },
    note: "Either is a client error; the report records which. The BFF would send it as a JSON string, so headless only.",
  },
  {
    id: "request-id-invalid",
    group: "headless",
    label: "An unsafe X-Request-ID is replaced, not echoed",
    method: "GET",
    path: "/v1/capabilities",
    direct: { auth: "key", requestId: "a b<script>" },
    expected: {
      status: 200,
      check: (_b, exchange) => {
        const echoed = header(exchange.responseHeaders, "x-request-id");
        return all(expect(Boolean(echoed), "no X-Request-ID in the response"), expect(echoed !== "a b<script>", "echoed the unsafe id"));
      },
    },
    note: "Ids outside [A-Za-z0-9._:-]{1,128} get a fresh req_… id rather than reaching logs and headers.",
  },
  {
    id: "scope-capabilities",
    group: "headless",
    label: "A key without admin:read gets 403 on capabilities",
    method: "GET",
    path: "/v1/capabilities",
    direct: { auth: "scoped" },
    expected: { status: 403, slug: "insufficient-scope" },
    note: "Needs RAG_SCOPED_KEY (a retrieval:read-only key); only one dev key ships, so it's skipped without one.",
  },

  // ---- operator: the gateway stopped first
  {
    id: "gateway-down-health",
    group: "operator",
    label: "Health stays 200 with the gateway down",
    method: "GET",
    path: "/v1/health",
    operator: "Stop air-model-gateway first (cd ../air-model-gateway && make down).",
    expected: { status: 200 },
    note: "Liveness depends on nothing.",
  },
  {
    id: "gateway-down-ready",
    group: "operator",
    label: "Ready is 503 ready:false with the gateway down",
    method: "GET",
    path: "/v1/ready",
    operator: "Stop air-model-gateway first (cd ../air-model-gateway && make down).",
    expected: {
      status: 503,
      problem: false,
      check: (b) => all(expect(b.ready === false, "ready isn't false"), expect((b as RagReadiness).dependencies?.[0]?.reachable === false, "gateway still reported reachable")),
    },
    note: "Readiness must follow the one dependency retrieval needs.",
  },
  {
    id: "gateway-down-retrieve",
    group: "operator",
    label: "Retrieve is 503 dependency-unavailable with the gateway down",
    method: "POST",
    path: RETRIEVE,
    body: { query: "how many days do I have to return something" },
    operator: "Stop air-model-gateway first (cd ../air-model-gateway && make down).",
    expected: { status: 503, slug: "dependency-unavailable" },
    note: "Not a 500, and not an empty citations list that reads as \"no match\".",
  },

  // ---- retrieval: the SIT query set, plus two of its edges spelled out
  ...SIT_CASES.map(sitScenario),
  {
    id: "archived-never-cited",
    group: "retrieval (SIT)",
    label: "The archived 2024 policy is never cited",
    method: "POST",
    path: RETRIEVE,
    body: { query: "current return window", top_k: 10 },
    sit: true,
    expected: {
      status: 200,
      check: (b) => expect(!citationsOf(b).some((c) => sourceOf(c) === "returns-refunds-2024"), "returns-refunds-2024 cited"),
    },
    note: "Stricter than the SIT row: status: archived documents are excluded, not just outranked.",
  },

  // ---- known gaps: one row per open bugs/rag report; they fail until it's fixed
  {
    id: "gap-malformed-400",
    group: "known gaps",
    bug: "RG-001",
    label: "Malformed JSON is 400 malformed-request",
    method: "POST",
    path: RETRIEVE,
    direct: { auth: "key", rawBody: '{"query":' },
    expected: { status: 400, slug: "malformed-request" },
    note: "The service defines malformed-request but never raises it: today it's a 422 naming field \"9\" (a byte offset).",
  },
  {
    id: "gap-malformed-before-auth",
    group: "known gaps",
    bug: "RG-001",
    label: "Malformed JSON with no key is 401",
    method: "POST",
    path: RETRIEVE,
    direct: { auth: "none", rawBody: '{"query":' },
    expected: { status: 401, slug: "missing-api-key" },
    note: "The body is parsed before the key is checked, so an anonymous caller probes the schema.",
  },
  {
    id: "gap-top-k-bool",
    group: "known gaps",
    bug: "RG-002",
    label: "top_k true is refused",
    method: "POST",
    path: RETRIEVE,
    body: { query: "returns", top_k: true },
    expected: VALIDATION("top_k"),
    note: "Lax coercion turns true into top_k 1 (and \"5\" into 5).",
  },
  {
    id: "gap-top-k-string",
    group: "known gaps",
    bug: "RG-002",
    label: "top_k \"5\" is refused",
    method: "POST",
    path: RETRIEVE,
    body: { query: "returns", top_k: "5" },
    expected: VALIDATION("top_k"),
    note: "The contract types it integer.",
  },
  {
    id: "gap-blank-query",
    group: "known gaps",
    bug: "RG-003",
    label: "A whitespace-only query is refused",
    method: "POST",
    path: RETRIEVE,
    body: { query: "    " },
    expected: VALIDATION("query"),
    note: "Passes min_length 1, so it's embedded (a gateway call) and answered.",
  },
  {
    id: "gap-user-id-bounded",
    group: "known gaps",
    bug: "RG-003",
    label: "A 10,000-character user_id is refused",
    method: "POST",
    path: RETRIEVE,
    body: { query: "returns", user_id: "u".repeat(10_000) },
    expected: VALIDATION("user_id"),
    note: "user_id has no max_length; query is capped at 4,000.",
  },
];

/** Rows the BFF can send: everything except headless ones. */
export const viaConsole = (scenario: Scenario): boolean => scenario.direct === undefined;

export function statusMatches(expected: Expectation, status: number | null): boolean {
  if (status === null) return false;
  return typeof expected.status === "number" ? status === expected.status : expected.status.includes(status);
}

export function expectedLabel(expected: Expectation): string {
  const status = typeof expected.status === "number" ? String(expected.status) : expected.status.join(" or ");
  return expected.slug ? `${status} ${expected.slug}` : status;
}

function bodyOf(exchange: Exchange): Record<string, unknown> {
  return record(exchange.responseJson);
}

/** Judge one exchange: the failure reason, or null. Every error must be
 * problem+json under this service's type base; every successful retrieve
 * must pass the isolation check, whatever the row is for. */
export function judge(exchange: Exchange, expected: Expectation, context: RunContext): string | null {
  if (exchange.error) return exchange.error;
  const body = bodyOf(exchange);
  const status = exchange.statusCode;
  if (!statusMatches(expected, status)) {
    const type = str(body.type);
    const slug = type.startsWith(PROBLEM_TYPE_BASE) ? ` ${type.slice(PROBLEM_TYPE_BASE.length)}` : "";
    return `got ${status}${slug}`;
  }
  if (status !== null && status >= 400 && expected.problem !== false) {
    const contentType = header(exchange.responseHeaders, "content-type") ?? "";
    if (!contentType.includes("application/problem+json")) return `content-type ${contentType || "missing"}, not problem+json`;
    const type = str(body.type);
    if (!type.startsWith(PROBLEM_TYPE_BASE)) return `problem type ${type || "missing"}`;
    if (expected.slug && type !== `${PROBLEM_TYPE_BASE}${expected.slug}`) return `type ${type.slice(PROBLEM_TYPE_BASE.length)}`;
  }
  if (status === 200 && exchange.url.split("?")[0].endsWith(RETRIEVE)) {
    const leak = isolationFailure(body, context.tenant);
    if (leak) return leak;
  }
  return expected.check ? expected.check(body, exchange, context) : null;
}

/** Contract rows must all pass; a known gap that passes means its fix landed. */
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
