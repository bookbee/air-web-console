/**
 * air-tools-gateway: the contract this tab reads, and its simulations.
 *
 * The gateway (`../air-tools-gateway/contract/openapi.yaml`, written by
 * air-orchestrator-service's spec 0012) runs declared capabilities:
 * lookups at `POST /v1/tools/{name}`, changes behind
 * `POST /v1/actions/{name}/propose` then `/execute`. Its only real caller is
 * the orchestrator, so in this tab the console plays the orchestrator: it
 * holds the tenant's two keys server-side (read, execute), and the request
 * body carries the `subject` the orchestrator would have verified.
 *
 * A *simulation* is one or more steps, each one request judged on its own.
 * Steps share a context, so a propose's `proposal_id` feeds the execute
 * after it, and a replay can be compared byte for byte with the first
 * answer. Every exchange, whatever the step is for, is also held to the
 * contract's standing rules: errors are problem+json from the closed `code`
 * set with a `detail` free of URLs and stack traces, `X-Request-ID` comes
 * back, and (in fixture mode) a result names only the subject's own orders,
 * with the amounts from its own tenant, and no customer ids at all.
 *
 * Fixture facts are not retyped: `fixtures/*.json` are byte-for-byte copies
 * of the gateway's `fixtures/<tenant>/orders.json`, and `make tools-check`
 * reports drift. Fixture checks run only where the gateway runs on them (a
 * local target); elsewhere those simulations are skipped, not failed.
 *
 * Pure (no React, no fetch): the runner takes a `send` function, so the
 * same simulations run in the browser, through the BFF, and headless.
 */

import type { Exchange } from "@/lib/http/exchange";

import brightcartOrders from "./fixtures/brightcart-orders.json";
import othershopOrders from "./fixtures/othershop-orders.json";

// ---- the contract --------------------------------------------------------

export const PROBLEM_TYPE_BASE = "https://air.local/problems/";

export const PROBLEM_CODES = [
  "invalid_arguments",
  "unauthorized",
  "forbidden",
  "unknown_capability",
  "not_found",
  "invalid_state",
  "not_permitted",
  "limit_exceeded",
  "proposal_expired",
  "already_executed",
  "rate_limited",
  "upstream_error",
  "upstream_timeout",
] as const;
export type ProblemCode = (typeof PROBLEM_CODES)[number];

export const CAPABILITY_NAME = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
export const IDEMPOTENCY_KEY = /^[A-Za-z0-9_.:-]{16,128}$/;
export const MAX_PROPOSAL_TTL_MS = 10 * 60_000;
/** Clock skew allowed between this machine and the gateway. */
const SKEW_MS = 60_000;

export const V1_CAPABILITIES = ["orders.list_recent", "orders.get", "orders.cancel"] as const;
export const CANCEL_REASONS = ["changed_mind", "ordered_by_mistake", "found_cheaper", "delivery_too_slow", "other"] as const;

export type Kind = "read" | "write";

export interface Capability {
  name: string;
  kind: Kind;
  version: number;
  description: string;
  input_schema: Record<string, unknown>;
  requires_subject: boolean;
  risk?: "low" | "medium" | "high";
}

export interface Inventory {
  service: string;
  version: string;
  capabilities: Capability[];
}

export const toolPath = (name: string) => `/v1/tools/${name}`;
export const proposePath = (name: string) => `/v1/actions/${name}/propose`;
export const executePath = (name: string) => `/v1/actions/${name}/execute`;

/** Which contract route a path is, and the capability it names. */
export function routeOf(path: string): { route: "health" | "ready" | "metrics" | "capabilities" | "tool" | "propose" | "execute" | "other"; name?: string } {
  const clean = path.split("?")[0];
  if (clean === "/v1/health") return { route: "health" };
  if (clean === "/v1/ready") return { route: "ready" };
  if (clean === "/metrics") return { route: "metrics" };
  if (clean === "/v1/capabilities") return { route: "capabilities" };
  let m = /^\/v1\/tools\/([^/]+)$/.exec(clean);
  if (m) return { route: "tool", name: decodeURIComponent(m[1]) };
  m = /^\/v1\/actions\/([^/]+)\/(propose|execute)$/.exec(clean);
  if (m) return { route: m[2] as "propose" | "execute", name: decodeURIComponent(m[1]) };
  return { route: "other" };
}

// ---- the fixtures --------------------------------------------------------

export interface FixtureOrder {
  order_id: string;
  customer_id: string;
  status: string;
  total: { amount: string; currency: string };
}

export type Tenant = "brightcart" | "othershop";

export const FIXTURES: Record<Tenant, readonly FixtureOrder[]> = {
  brightcart: (brightcartOrders as { orders: FixtureOrder[] }).orders,
  othershop: (othershopOrders as { orders: FixtureOrder[] }).orders,
};

/** Fixture subjects (brightcart, the console's local dev keys). */
export const CUSTOMER = "cust_1001";
export const OTHER_CUSTOMER = "cust_1002";
export const OTHERSHOP_CUSTOMER = "cust_2001";
/** Never in any fixture: "missing" for the not-yours comparison. */
export const MISSING_ORDER = "99999";

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const str = (value: unknown): string => (typeof value === "string" ? value : value == null ? "" : String(value));
const all = (...checks: (string | null)[]): string | null => checks.find((c) => c !== null) ?? null;
const expect = (ok: boolean, failure: string): string | null => (ok ? null : failure);

/** Every object carrying an `order_id`, anywhere in a body. */
export function ordersIn(value: unknown): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      const r = v as Record<string, unknown>;
      if (typeof r.order_id === "string") found.push(r);
      Object.values(r).forEach(walk);
    }
  };
  walk(value);
  return found;
}

function hasKey(value: unknown, key: string): boolean {
  if (Array.isArray(value)) return value.some((v) => hasKey(v, key));
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).some(([k, v]) => k === key || hasKey(v, key));
  }
  return false;
}

/** Rule 4 and 9 against the fixtures: every order in a result is the
 * subject's own, its amount is its own tenant's (othershop's 55120 has a
 * different total, so a cross-tenant read shows up as a wrong amount, not a
 * 404), and no customer id rides back. The failure, or null. */
export function leakFailure(body: unknown, tenant: Tenant, subject: string | null): string | null {
  if (hasKey(body, "customer_id")) return "rule 9: a customer_id is in the result";
  const fixture = FIXTURES[tenant];
  for (const order of ordersIn(record(body).data ?? body)) {
    const id = str(order.order_id);
    const own = fixture.find((o) => o.order_id === id);
    if (!own) return `order ${id} isn't in ${tenant}'s fixtures`;
    if (subject !== null && own.customer_id !== subject) return `isolation: order ${id} belongs to another customer, not ${subject}`;
    const total = record(order.total);
    if (total.amount !== undefined && str(total.amount) !== own.total.amount) {
      return `isolation: order ${id} total ${str(total.amount)} isn't ${tenant}'s ${own.total.amount}`;
    }
  }
  return null;
}

// ---- shapes --------------------------------------------------------------

/** One inventory entry against the contract's rules (2, and the Capability
 * schema): the failure, or null. The orchestrator silently drops a bad entry,
 * so this is where such a mistake shows. */
export function capabilityFailure(c: Record<string, unknown>): string | null {
  const name = str(c.name);
  const schema = record(c.input_schema);
  const properties = record(schema.properties);
  const allowed = ["name", "kind", "version", "description", "input_schema", "requires_subject", "risk"];
  const extra = Object.keys(c).filter((k) => !allowed.includes(k));
  return all(
    expect(CAPABILITY_NAME.test(name) && name.length <= 64, `${name || "?"}: name doesn't match the contract pattern`),
    expect(extra.length === 0, `${name}: unexpected field ${extra.join(", ")}`),
    expect(c.kind === "read" || c.kind === "write", `${name}: kind ${str(c.kind)}`),
    expect(Number.isInteger(c.version) && (c.version as number) >= 1, `${name}: version isn't an integer ≥ 1`),
    expect(typeof c.description === "string" && c.description.length > 0 && c.description.length <= 1000, `${name}: description missing or over 1000 chars`),
    expect(typeof c.requires_subject === "boolean", `${name}: requires_subject isn't a boolean`),
    expect(schema.type === "object" && schema.additionalProperties === false, `${name}: input_schema isn't a closed object`),
    expect(!("subject" in properties) && !("tenant" in properties), `${name}: input_schema declares subject or tenant`),
    expect(!("patternProperties" in schema), `${name}: input_schema has patternProperties`),
    c.kind === "write"
      ? expect(["low", "medium", "high"].includes(str(c.risk)), `${name}: a write with no valid risk`)
      : expect(c.risk === undefined, `${name}: a read with a risk`),
  );
}

export function inventoryFailure(body: Record<string, unknown>): string | null {
  const capabilities = Array.isArray(body.capabilities) ? (body.capabilities as Record<string, unknown>[]) : null;
  if (!capabilities) return "no capabilities array";
  const names = capabilities.map((c) => str(c.name));
  return all(
    expect(body.service === "air-tools-gateway", `service ${str(body.service)}`),
    expect(typeof body.version === "string", "no version"),
    expect(capabilities.length <= 64, "more than 64 capabilities"),
    expect(new Set(names).size === names.length, "a duplicate capability name"),
    ...capabilities.map(capabilityFailure),
  );
}

const DATE_TIME = (value: unknown) => typeof value === "string" && !Number.isNaN(Date.parse(value)) && value.includes("T");

export function toolResultFailure(body: Record<string, unknown>, name: string): string | null {
  return all(
    expect(body.capability === name, `capability ${str(body.capability)}, not ${name}`),
    expect(body.data !== null && typeof body.data === "object", "data isn't an object or array"),
    expect(typeof body.truncated === "boolean", "truncated isn't a boolean"),
    expect(DATE_TIME(body.as_of), "as_of isn't a date-time"),
  );
}

export function proposalFailure(body: Record<string, unknown>, name: string, now: number): string | null {
  const expires = Date.parse(str(body.expires_at));
  const summary = str(body.summary);
  return all(
    expect(typeof body.proposal_id === "string" && body.proposal_id.length > 0 && body.proposal_id.length <= 128, "no proposal_id"),
    expect(body.capability === name, `capability ${str(body.capability)}, not ${name}`),
    expect(["low", "medium", "high"].includes(str(body.risk)), `risk ${str(body.risk)}`),
    expect(summary.length > 0 && summary.length <= 500, "summary empty or over 500 chars"),
    expect(DATE_TIME(body.expires_at), "expires_at isn't a date-time"),
    expect(expires > now - SKEW_MS, "expires_at is already past"),
    expect(expires <= now + MAX_PROPOSAL_TTL_MS + SKEW_MS, "rule 6: expires more than 10 minutes out"),
  );
}

export function executeFailure(body: Record<string, unknown>, name: string): string | null {
  const status = str(body.status);
  return all(
    expect(["done", "pending_approval", "rejected"].includes(status), `status ${status || "missing"}`),
    expect(typeof body.execution_id === "string" && body.execution_id.length > 0, "no execution_id"),
    expect(body.capability === name, `capability ${str(body.capability)}, not ${name}`),
    status === "rejected" ? expect(PROBLEM_CODES.includes(body.code as ProblemCode), "rejected with no closed-set code") : null,
    status === "done" ? expect(body.result !== null && typeof body.result === "object", "done with no result") : null,
  );
}

/** Rule 10: `detail` never carries a URL, a stack trace or a raw backend
 * message. A cheap screen, not proof. */
export function detailFailure(detail: unknown): string | null {
  const text = str(detail);
  if (/[a-z]+:\/\//i.test(text)) return "rule 10: detail holds a URL";
  if (/\n\s+at |\bat .+\(.+:\d+:\d+\)/.test(text)) return "rule 10: detail holds a stack trace";
  if (/ECONNREFUSED|ETIMEDOUT|ENOTFOUND|SQLSTATE|Traceback/i.test(text)) return "rule 10: detail holds a raw backend error";
  return null;
}

// ---- judging -------------------------------------------------------------

/** How a step authenticates. Absent: through the BFF, which picks the read
 * or execute key from the route. Any value here goes around the BFF, so only
 * `make tools-check` sends it (the browser can't choose a credential). */
export type DirectAuth = "none" | "invalid" | "read" | "execute" | "othershop-read" | "othershop-execute";

export interface StepRequest {
  method: "GET" | "POST";
  path: string;
  body?: unknown;
  idempotencyKey?: string;
  auth?: DirectAuth;
  /** Sent verbatim (malformed JSON); direct only. */
  rawBody?: string;
}

export interface Expectation {
  status: number | readonly number[];
  code?: ProblemCode;
  /** Error statuses that are reports, not problems (`/v1/ready`'s 503). */
  problem?: false;
  check?: (body: Record<string, unknown>, exchange: Exchange, context: SimContext) => string | null;
}

export interface SimContext {
  /** The gateway serves the fixtures mirrored here (a local target). */
  fixture: boolean;
  /** Unique per run; idempotency keys are derived from it. */
  runId: string;
  now: () => number;
  /** Values saved by earlier steps (`order_id`, `proposal_id`). */
  vars: Record<string, string>;
  /** Earlier steps' exchanges, by step id. */
  seen: Record<string, Exchange>;
}

export function newContext(fixture: boolean, now: () => number = Date.now): SimContext {
  const runId = `${now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return { fixture, runId, now, vars: {}, seen: {} };
}

/** An idempotency key for this run, unique per simulation and slot. */
export const idemKey = (ctx: SimContext, simulation: string, slot: string): string =>
  `console-${ctx.runId}-${simulation}-${slot}`.replace(/[^A-Za-z0-9_.:-]/g, "-").slice(0, 128);

function header(headers: Record<string, string>, name: string): string | undefined {
  const lower = name.toLowerCase();
  return Object.entries(headers).find(([key]) => key.toLowerCase() === lower)?.[1];
}

export function statusMatches(expected: Expectation, status: number | null): boolean {
  if (status === null) return false;
  return typeof expected.status === "number" ? status === expected.status : expected.status.includes(status);
}

export function expectedLabel(expected: Expectation): string {
  const status = typeof expected.status === "number" ? String(expected.status) : expected.status.join(" or ");
  return expected.code ? `${status} ${expected.code}` : status;
}

const tenantOf = (request: StepRequest): Tenant => (request.auth?.startsWith("othershop") ? "othershop" : "brightcart");
const subjectOf = (request: StepRequest): string | null => {
  const subject = record(request.body).subject;
  return typeof subject === "string" ? subject : null;
};

/** Judge one exchange against its step's expectation and the standing
 * rules: the failure reason, or null. */
export function judge(exchange: Exchange, expected: Expectation, context: SimContext, request: StepRequest): string | null {
  if (exchange.error) return exchange.error;
  const body = record(exchange.responseJson);
  const status = exchange.statusCode;
  if (!statusMatches(expected, status)) {
    const code = str(body.code);
    const detail = str(body.detail);
    return `got ${status}${code ? ` ${code}` : ""}${detail ? ` "${detail}"` : ""}`;
  }

  const sent = header(exchange.requestHeaders, "x-request-id");
  if (sent && header(exchange.responseHeaders, "x-request-id") !== sent) return `rule 11: X-Request-ID not echoed (sent ${sent})`;

  if (status !== null && status >= 400 && expected.problem !== false) {
    const contentType = header(exchange.responseHeaders, "content-type") ?? "";
    if (!contentType.includes("application/problem+json")) return `rule 10: content-type ${contentType || "missing"}, not problem+json`;
    const code = str(body.code);
    if (!PROBLEM_CODES.includes(code as ProblemCode)) return `rule 10: code ${code || "missing"} isn't in the closed set`;
    if (body.type !== `${PROBLEM_TYPE_BASE}${code}`) return `problem type ${str(body.type) || "missing"} doesn't match code ${code}`;
    if (body.status !== status) return `problem status ${str(body.status)} ≠ HTTP ${status}`;
    if (expected.code && code !== expected.code) return `code ${code}, not ${expected.code}`;
    const leak = detailFailure(body.detail);
    if (leak) return leak;
  }

  if (status === 200) {
    const { route, name = "" } = routeOf(request.path);
    const shape =
      route === "health"
        ? expect(body.status === "ok", `status ${str(body.status)}`)
        : route === "capabilities"
          ? inventoryFailure(body)
          : route === "tool"
            ? toolResultFailure(body, name)
            : route === "propose"
              ? proposalFailure(body, name, context.now())
              : route === "execute"
                ? executeFailure(body, name)
                : null;
    if (shape) return shape;
    if (context.fixture && (route === "tool" || route === "execute")) {
      const leak = leakFailure(body, tenantOf(request), subjectOf(request));
      if (leak) return leak;
    }
  }
  return expected.check ? expected.check(body, exchange, context) : null;
}

// ---- simulations ---------------------------------------------------------

export type Group =
  | "system"
  | "capabilities"
  | "reads"
  | "ownership & isolation"
  | "rejections"
  | "execute"
  | "conversations"
  | "headless"
  | "known gaps";

export interface Skip {
  skip: string;
}

export interface Step {
  id: string;
  label: string;
  /** One request; or use `requests`. */
  request?: (ctx: SimContext) => StepRequest | Skip;
  /** Several requests sent at once (a concurrency check). Each is judged
   * with `expected`; `checkAll` then judges them together. */
  requests?: (ctx: SimContext) => StepRequest[];
  checkAll?: (exchanges: Exchange[], ctx: SimContext) => string | null;
  expected: Expectation;
  /** Before judging: a reason this simulation can't go on here (an order a
   * previous run already cancelled), which skips rather than fails it. */
  skipWhen?: (body: Record<string, unknown>, exchange: Exchange, ctx: SimContext) => string | null;
  /** After a pass: save what later steps need. */
  save?: (body: Record<string, unknown>, ctx: SimContext) => void;
}

export interface Simulation {
  id: string;
  group: Group;
  label: string;
  note: string;
  steps: Step[];
  /** Needs the gateway's fixture backend: skipped on other targets. */
  fixture?: boolean;
  /** Executes a real change. On a remote target the UI asks first, and
   * "Run all" leaves it out. */
  mutates?: boolean;
  /** Some step goes around the BFF: `make tools-check` only. */
  direct?: boolean;
  /** Its report under bugs/tools-gateway/. */
  bug?: string;
}

const isSkip = (value: StepRequest | Skip): value is Skip => "skip" in value;

const tool = (name: string, args: Record<string, unknown>, subject: string | null = CUSTOMER, auth?: DirectAuth): StepRequest => ({
  method: "POST",
  path: toolPath(name),
  body: { arguments: args, subject },
  ...(auth ? { auth } : {}),
});
const propose = (args: Record<string, unknown>, subject: string | null = CUSTOMER, auth?: DirectAuth): StepRequest => ({
  method: "POST",
  path: proposePath("orders.cancel"),
  body: { arguments: args, subject },
  ...(auth ? { auth } : {}),
});
const execute = (proposalId: string, subject: string | null, idempotencyKey: string | undefined, auth?: DirectAuth): StepRequest => ({
  method: "POST",
  path: executePath("orders.cancel"),
  body: { proposal_id: proposalId, subject },
  ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
  ...(auth ? { auth } : {}),
});

const orders = (body: Record<string, unknown>): Record<string, unknown>[] => {
  const list = record(body.data).orders;
  return Array.isArray(list) ? (list as Record<string, unknown>[]) : [];
};
const sameBytes = (stepId: string, what: string) => (_b: Record<string, unknown>, exchange: Exchange, ctx: SimContext) =>
  expect(exchange.responseText === ctx.seen[stepId]?.responseText, `${what}: the body differs from step "${stepId}"`);
const order = (body: Record<string, unknown>) => record(body.data);
const isCode = (code: ProblemCode) => (body: Record<string, unknown>) => body.code === code;

const RESET = "restart the gateway to reset its fixtures";
const alreadyCancelled = (id: string) => (body: Record<string, unknown>) =>
  isCode("invalid_state")(body) ? `order ${id} is already cancelled by an earlier run: ${RESET}` : null;

/** A positive control for any simulation that expects a 404 from execute.
 * A route the gateway doesn't serve also answers 404 not_found, so a "same
 * 404 as a missing proposal" check would pass against a gateway with no
 * execute at all. Only the real route can answer a missing Idempotency-Key
 * with 400, so this step proves the 404 that follows came from it. */
const EXECUTE_SERVED = (auth?: DirectAuth): Step => ({
  id: "served",
  label: "the execute route is served (no Idempotency-Key is a 400)",
  request: () => execute("gp_000000000000", CUSTOMER, undefined, auth),
  expected: { status: 400, code: "invalid_arguments" },
});

const ONE_STEP = (id: string, label: string, request: StepRequest, expected: Expectation): Step[] => [
  { id, label, request: () => request, expected },
];

export const SIMULATIONS: readonly Simulation[] = [
  // ---- system
  {
    id: "health",
    group: "system",
    label: "Health answers, with no key",
    note: "Liveness: depends on nothing.",
    steps: ONE_STEP("health", "GET /v1/health", { method: "GET", path: "/v1/health" }, { status: 200 }),
  },
  {
    id: "ready",
    group: "system",
    label: "Ready, and checks the orders backend",
    note: "503 with the same body means a backend is unreachable; it must never crash the service.",
    steps: ONE_STEP("ready", "GET /v1/ready", { method: "GET", path: "/v1/ready" }, {
      status: 200,
      check: (b) => {
        const checks = Array.isArray(b.checks) ? (b.checks as Record<string, unknown>[]) : [];
        return all(
          expect(b.status === "ready", `status ${str(b.status)}`),
          expect(checks.some((c) => c.name === "orders_backend" && c.ok === true), "no passing orders_backend check"),
          ...checks.map((c) => detailFailure(c.detail)),
        );
      },
    }),
  },
  {
    id: "metrics",
    group: "system",
    label: "Prometheus metrics, with no key",
    note: "Rule 11: air_tools_gateway_requests_total and a latency histogram.",
    steps: ONE_STEP("metrics", "GET /metrics", { method: "GET", path: "/metrics" }, {
      status: 200,
      check: (_b, x) =>
        all(
          expect(x.responseText.includes("air_tools_gateway_requests_total"), "no air_tools_gateway_requests_total"),
          expect(/air_tools_gateway_request_duration_seconds/.test(x.responseText), "no air_tools_gateway_request_duration_seconds"),
        ),
    }),
  },

  // ---- capabilities
  {
    id: "inventory",
    group: "capabilities",
    label: "The inventory keeps every contract rule",
    note: "Closed input schemas, no subject/tenant, names and descriptions in bounds, risk on writes only. v1 serves exactly the three order capabilities.",
    steps: ONE_STEP("inventory", "GET /v1/capabilities", { method: "GET", path: "/v1/capabilities" }, {
      status: 200,
      check: (b) => {
        const caps = (b.capabilities as Capability[]) ?? [];
        const byName = Object.fromEntries(caps.map((c) => [c.name, c]));
        return all(
          ...V1_CAPABILITIES.map((n) => expect(n in byName, `${n} isn't advertised`)),
          expect(byName["orders.list_recent"]?.kind === "read", "orders.list_recent isn't a read"),
          expect(byName["orders.get"]?.kind === "read", "orders.get isn't a read"),
          expect(byName["orders.cancel"]?.kind === "write" && byName["orders.cancel"]?.risk === "low", "orders.cancel isn't a low-risk write"),
          expect(caps.every((c) => c.requires_subject === true), "an order capability doesn't require a subject"),
        );
      },
    }),
  },

  // ---- reads: what an orchestrator turn asks
  {
    id: "recent-orders",
    group: "reads",
    label: '"Where are my recent orders?"',
    note: "orders.list_recent, limit 5, as cust_1001: their three orders, newest first, each with status, total, delivery date and whether it can be cancelled.",
    fixture: true,
    steps: ONE_STEP("list", "orders.list_recent", tool("orders.list_recent", { limit: 5 }), {
      status: 200,
      check: (b) => {
        const list = orders(b);
        const dates = list.map((o) => str(o.placed_at));
        return all(
          expect(list.length === 3, `${list.length} orders, not cust_1001's 3`),
          expect(dates.every((d, i) => i === 0 || dates[i - 1] >= d), "not newest first"),
          expect(list.every((o) => typeof o.cancellable === "boolean" && o.status && o.total), "an order without status, total or cancellable"),
        );
      },
    }),
  },
  {
    id: "recent-limit",
    group: "reads",
    label: "limit 1 is the newest order only",
    note: "How the orchestrator finds which order \"my last order\" means.",
    fixture: true,
    steps: ONE_STEP("list", "orders.list_recent limit 1", tool("orders.list_recent", { limit: 1 }), {
      status: 200,
      check: (b) => all(expect(orders(b).length === 1, `${orders(b).length} orders`), expect(orders(b)[0]?.order_id === "55120", `newest is ${str(orders(b)[0]?.order_id)}, not 55120`)),
    }),
  },
  {
    id: "order-detail",
    group: "reads",
    label: '"What\'s in order 48213?"',
    note: "orders.get: items, tracking, and whether it can still be cancelled or returned. 48213 is in transit, so not cancellable.",
    fixture: true,
    steps: ONE_STEP("get", "orders.get 48213", tool("orders.get", { order_id: "48213" }), {
      status: 200,
      check: (b) =>
        all(
          expect(order(b).order_id === "48213", "wrong order"),
          expect(Array.isArray(order(b).items) && (order(b).items as unknown[]).length > 0, "no items"),
          expect(order(b).tracking !== undefined, "no tracking field"),
          expect(order(b).cancellable === false, "an in-transit order is cancellable"),
          expect(typeof order(b).returnable === "boolean", "no returnable"),
        ),
    }),
  },

  // ---- ownership & isolation
  {
    id: "not-yours-get",
    group: "ownership & isolation",
    label: "Another customer's order is the same 404 as a missing one",
    note: "Rule 4: cust_1001 asking for cust_1002's 70011 must be byte-identical to asking for 99999, so the answer says nothing about whether it exists.",
    fixture: true,
    steps: [
      { id: "theirs", label: "orders.get 70011 (cust_1002's)", request: () => tool("orders.get", { order_id: "70011" }), expected: { status: 404, code: "not_found" } },
      {
        id: "missing",
        label: "orders.get 99999 (no such order)",
        request: () => tool("orders.get", { order_id: MISSING_ORDER }),
        expected: { status: 404, code: "not_found", check: sameBytes("theirs", "rule 4") },
      },
    ],
  },
  {
    id: "not-yours-propose",
    group: "ownership & isolation",
    label: "Proposing to cancel another customer's order is that same 404",
    note: "Propose checks ownership before anything is stored.",
    fixture: true,
    steps: [
      { id: "theirs", label: "propose cancel 70011 as cust_1001", request: () => propose({ order_id: "70011" }), expected: { status: 404, code: "not_found" } },
      {
        id: "missing",
        label: "propose cancel 99999",
        request: () => propose({ order_id: MISSING_ORDER }),
        expected: { status: 404, code: "not_found", check: sameBytes("theirs", "rule 4") },
      },
    ],
  },

  // ---- rejections (through the BFF)
  {
    id: "wrong-kind",
    group: "rejections",
    label: "A write called as a tool is unknown_capability",
    note: "Lookup is by name and route kind: orders.cancel isn't served at /v1/tools.",
    steps: ONE_STEP("x", "POST /v1/tools/orders.cancel", tool("orders.cancel", { order_id: "55120" }), { status: 404, code: "unknown_capability" }),
  },
  {
    id: "read-proposed",
    group: "rejections",
    label: "A read proposed as an action is unknown_capability",
    note: "orders.get isn't served at /v1/actions.",
    steps: ONE_STEP("x", "POST /v1/actions/orders.get/propose", { method: "POST", path: proposePath("orders.get"), body: { arguments: { order_id: "55120" }, subject: CUSTOMER } }, { status: 404, code: "unknown_capability" }),
  },
  {
    id: "unknown-capability",
    group: "rejections",
    label: "An undeclared capability is unknown_capability",
    note: "Rule 1: no generic passthrough.",
    steps: ONE_STEP("x", "POST /v1/tools/orders.refund_everything", tool("orders.refund_everything", {}), { status: 404, code: "unknown_capability" }),
  },
  {
    id: "bad-arguments",
    group: "rejections",
    label: "Bad arguments name field paths, never values",
    note: "An unknown argument and a pattern miss: 400 invalid_arguments whose detail names both paths and not the value sent.",
    steps: ONE_STEP("x", "orders.get with a bad order_id and an extra field", tool("orders.get", { order_id: "abc-secret-value", extra: 1 }), {
      status: 400,
      code: "invalid_arguments",
      check: (b) =>
        all(
          expect(!str(b.detail).includes("abc-secret-value"), "detail echoes the value sent"),
          expect(/order_id/.test(str(b.detail)) && /extra/.test(str(b.detail)), "detail doesn't name both fields"),
        ),
    }),
  },
  {
    id: "limit-range",
    group: "rejections",
    label: "limit outside 1..10 is invalid_arguments",
    note: "The capability's own input_schema, enforced.",
    steps: ONE_STEP("x", "orders.list_recent limit 11", tool("orders.list_recent", { limit: 11 }), { status: 400, code: "invalid_arguments" }),
  },
  {
    id: "null-subject",
    group: "rejections",
    label: "A null subject is refused where one is required",
    note: "Every v1 capability requires a subject.",
    steps: ONE_STEP("x", "orders.list_recent with subject null", tool("orders.list_recent", {}, null), { status: 400, code: "invalid_arguments" }),
  },
  {
    id: "tenant-in-envelope",
    group: "rejections",
    label: "A request can't name a tenant",
    note: "Rule 3: the envelope is closed, and the tenant comes from the key.",
    steps: ONE_STEP("x", 'orders.list_recent with "tenant": "othershop"', { method: "POST", path: toolPath("orders.list_recent"), body: { arguments: {}, subject: CUSTOMER, tenant: "othershop" } }, { status: 400, code: "invalid_arguments" }),
  },
  {
    id: "subject-in-arguments",
    group: "rejections",
    label: "Identity can't ride in the arguments",
    note: "Rule 2: subject travels in the envelope; in arguments it's an unknown field.",
    steps: ONE_STEP("x", 'orders.list_recent with arguments.subject', tool("orders.list_recent", { subject: OTHER_CUSTOMER }), { status: 400, code: "invalid_arguments" }),
  },
  {
    id: "shipped",
    group: "rejections",
    label: "An order that has shipped can't be cancelled: 422, nothing stored",
    note: "48213 is in transit and 61007 delivered. A change that isn't possible now is a 422, not a proposal.",
    fixture: true,
    steps: [
      { id: "in-transit", label: "propose cancel 48213", request: () => propose({ order_id: "48213" }), expected: { status: 422, code: "invalid_state" } },
      { id: "delivered", label: "propose cancel 61007", request: () => propose({ order_id: "61007" }), expected: { status: 422, code: "invalid_state" } },
    ],
  },

  // ---- execute: guards that change nothing
  {
    id: "execute-no-key",
    group: "execute",
    label: "Execute with no Idempotency-Key is a 400",
    note: "Rule 8: the key is required, before anything else is looked at.",
    steps: ONE_STEP("x", "execute, no Idempotency-Key", execute("gp_000000000000", CUSTOMER, undefined), { status: 400, code: "invalid_arguments" }),
  },
  {
    id: "execute-short-key",
    group: "execute",
    label: "An Idempotency-Key under 16 characters is a 400",
    note: "16–128 characters of [A-Za-z0-9_.:-].",
    steps: ONE_STEP("x", "execute, 15-character key", execute("gp_000000000000", CUSTOMER, "short-key-15chr"), { status: 400, code: "invalid_arguments" }),
  },
  {
    id: "execute-unknown",
    group: "execute",
    label: "Executing an unknown proposal is not_found",
    note: "A missing proposal, a different subject and a different capability all get the same 404.",
    steps: [
      EXECUTE_SERVED(),
      { id: "x", label: "execute gp_000000000000", request: (ctx) => execute("gp_000000000000", CUSTOMER, idemKey(ctx, "execute-unknown", "a")), expected: { status: 404, code: "not_found" } },
    ],
  },
  {
    id: "execute-wrong-subject",
    group: "execute",
    label: "A confirm from another customer is refused and changes nothing",
    note: "cust_1002 proposes cancelling 70011; executing it as cust_1001 must be the same 404 as a missing proposal, and 70011 must still be cancellable.",
    fixture: true,
    steps: [
      EXECUTE_SERVED(),
      {
        id: "propose",
        label: "propose cancel 70011 as cust_1002",
        request: () => propose({ order_id: "70011", reason: "changed_mind" }, OTHER_CUSTOMER),
        skipWhen: alreadyCancelled("70011"),
        expected: { status: 200 },
        save: (b, ctx) => {
          ctx.vars.proposal = str(b.proposal_id);
        },
      },
      {
        id: "execute",
        label: "execute it as cust_1001",
        request: (ctx) => execute(ctx.vars.proposal, CUSTOMER, idemKey(ctx, "execute-wrong-subject", "a")),
        expected: { status: 404, code: "not_found" },
      },
      {
        id: "unchanged",
        label: "orders.get 70011 as cust_1002: still cancellable",
        request: () => tool("orders.get", { order_id: "70011" }, OTHER_CUSTOMER),
        expected: { status: 200, check: (b) => expect(order(b).cancellable === true, `70011 is now ${str(order(b).status)}`) },
      },
    ],
  },

  // ---- headless: around the BFF (a chosen key, or no key, or not JSON)
  {
    id: "no-key",
    group: "headless",
    label: "No key is 401",
    note: "Rule 3. The BFF always attaches a key, so this goes straight to the service.",
    direct: true,
    steps: ONE_STEP("x", "orders.list_recent, no X-API-Key", tool("orders.list_recent", {}, CUSTOMER, "none"), { status: 401, code: "unauthorized" }),
  },
  {
    id: "bad-key",
    group: "headless",
    label: "An unknown key is 401",
    note: "Keys are compared as salted digests.",
    direct: true,
    steps: ONE_STEP("x", "orders.list_recent, a made-up key", tool("orders.list_recent", {}, CUSTOMER, "invalid"), { status: 401, code: "unauthorized" }),
  },
  {
    id: "execute-key-reads",
    group: "headless",
    label: "The execute key can't read, list or propose",
    note: "Rule 5: the execute key may call execute and nothing else.",
    direct: true,
    steps: [
      { id: "tool", label: "orders.list_recent with the execute key", request: () => tool("orders.list_recent", {}, CUSTOMER, "execute"), expected: { status: 403, code: "forbidden" } },
      { id: "caps", label: "GET /v1/capabilities with the execute key", request: () => ({ method: "GET", path: "/v1/capabilities", auth: "execute" }), expected: { status: 403, code: "forbidden" } },
      { id: "propose", label: "propose with the execute key", request: () => propose({ order_id: "55120" }, CUSTOMER, "execute"), expected: { status: 403, code: "forbidden" } },
    ],
  },
  {
    id: "read-key-executes",
    group: "headless",
    label: "The read key can't execute",
    note: "Rule 5, the other way round.",
    direct: true,
    steps: [{ id: "x", label: "execute with the read key", request: (ctx) => execute("gp_000000000000", CUSTOMER, idemKey(ctx, "read-key-executes", "a"), "read"), expected: { status: 403, code: "forbidden" } }],
  },
  {
    id: "malformed-json",
    group: "headless",
    label: "A body that isn't JSON is 400 problem+json",
    note: "The BFF only sends JSON, so this goes direct.",
    direct: true,
    steps: ONE_STEP("x", "orders.list_recent with a broken body", { method: "POST", path: toolPath("orders.list_recent"), auth: "read", rawBody: '{"arguments": {"limit": 5}, "subject": ' }, { status: 400, code: "invalid_arguments" }),
  },
  {
    id: "cross-tenant",
    group: "headless",
    label: "Another tenant's key sees only its own data",
    note:
      "othershop's 55120 collides with brightcart's and belongs to cust_2001 at ₹799, so a leak shows as the wrong amount, not a 404. " +
      "With othershop's read key: cust_2001 gets ₹799; cust_1001 asking for 55120 gets 404; cust_1001's list is only 90001.",
    fixture: true,
    direct: true,
    steps: [
      { id: "theirs", label: "othershop · orders.get 55120 as cust_2001", request: () => tool("orders.get", { order_id: "55120" }, OTHERSHOP_CUSTOMER, "othershop-read"), expected: { status: 200, check: (b) => expect(record(order(b).total).amount === "799.00", `total ${str(record(order(b).total).amount)}`) } },
      { id: "brightcart-id", label: "othershop · orders.get 55120 as cust_1001", request: () => tool("orders.get", { order_id: "55120" }, CUSTOMER, "othershop-read"), expected: { status: 404, code: "not_found" } },
      {
        id: "list",
        label: "othershop · orders.list_recent as cust_1001",
        request: () => tool("orders.list_recent", { limit: 10 }, CUSTOMER, "othershop-read"),
        expected: { status: 200, check: (b) => expect(orders(b).map((o) => o.order_id).join(",") === "90001", `orders ${orders(b).map((o) => str(o.order_id)).join(",") || "none"}`) },
      },
    ],
  },
  {
    id: "cross-tenant-proposal",
    group: "headless",
    label: "Another tenant's execute key can't see a proposal",
    note: "A brightcart proposal executed with othershop's execute key is the same 404 as a missing one; nothing changes.",
    fixture: true,
    direct: true,
    steps: [
      EXECUTE_SERVED("othershop-execute"),
      {
        id: "propose",
        label: "brightcart · propose cancel 55120 as cust_1001",
        request: () => propose({ order_id: "55120" }, CUSTOMER, "read"),
        skipWhen: alreadyCancelled("55120"),
        expected: { status: 200 },
        save: (b, ctx) => {
          ctx.vars.proposal = str(b.proposal_id);
        },
      },
      {
        id: "execute",
        label: "othershop · execute it",
        request: (ctx) => execute(ctx.vars.proposal, CUSTOMER, idemKey(ctx, "cross-tenant-proposal", "a"), "othershop-execute"),
        expected: { status: 404, code: "not_found" },
      },
    ],
  },
  // ---- conversations: orchestrator turns end to end
  {
    id: "cancel-last-order",
    group: "conversations",
    label: '"Cancel my last order": propose, confirm, replay',
    note:
      "Turn 1 lists cust_1001's orders and proposes cancelling the newest cancellable one; nothing changes until the confirm. " +
      "Turn 2 executes with an Idempotency-Key: done, with the refund. The same key replays the first answer byte for byte; " +
      "a different key is 409 already_executed; proposing again is 422. Uses up 55120 until the gateway restarts.",
    fixture: true,
    mutates: true,
    steps: [
      {
        id: "list",
        label: "turn 1 · orders.list_recent",
        request: () => tool("orders.list_recent", { limit: 5 }),
        expected: { status: 200 },
        skipWhen: (b) => (orders(b).some((o) => o.cancellable === true) ? null : `cust_1001 has no cancellable order left: ${RESET}`),
        save: (b, ctx) => {
          const pick = orders(b).find((o) => o.cancellable === true)!;
          ctx.vars.order = str(pick.order_id);
          ctx.vars.amount = str(record(pick.total).amount);
        },
      },
      {
        id: "propose",
        label: "turn 1 · propose cancel",
        request: (ctx) => propose({ order_id: ctx.vars.order, reason: "changed_mind" }),
        expected: {
          status: 200,
          check: (b, _x, ctx) =>
            all(
              expect(record(b.preview).order_id === undefined || record(b.preview).order_id === ctx.vars.order, "preview names another order"),
              expect(str(b.summary).includes(ctx.vars.order), "summary doesn't name the order"),
              expect(record(record(b.preview).refund).amount === undefined || record(record(b.preview).refund).amount === ctx.vars.amount, "preview refund isn't the order total"),
            ),
        },
        save: (b, ctx) => {
          ctx.vars.proposal = str(b.proposal_id);
        },
      },
      {
        id: "unchanged",
        label: "nothing changed yet",
        request: (ctx) => tool("orders.get", { order_id: ctx.vars.order }),
        expected: { status: 200, check: (b) => expect(order(b).cancellable === true, `rule 6: propose changed the order (${str(order(b).status)})`) },
      },
      {
        id: "execute",
        label: "turn 2 · confirm: execute",
        request: (ctx) => execute(ctx.vars.proposal, CUSTOMER, idemKey(ctx, "cancel-last-order", "a")),
        expected: {
          status: 200,
          check: (b, _x, ctx) =>
            all(
              expect(b.status === "done", `status ${str(b.status)}${b.code ? ` (${str(b.code)})` : ""}`),
              expect(record(b.result).order_id === ctx.vars.order, "result names another order"),
              expect(record(record(b.result).refund).amount === ctx.vars.amount, "refund isn't the order total"),
            ),
        },
      },
      {
        id: "replay",
        label: "the same Idempotency-Key replays the first answer",
        request: (ctx) => execute(ctx.vars.proposal, CUSTOMER, idemKey(ctx, "cancel-last-order", "a")),
        expected: { status: 200, check: sameBytes("execute", "rule 8") },
      },
      {
        id: "again",
        label: "a different Idempotency-Key is already_executed",
        request: (ctx) => execute(ctx.vars.proposal, CUSTOMER, idemKey(ctx, "cancel-last-order", "b")),
        expected: { status: 409, code: "already_executed" },
      },
      {
        id: "cancelled",
        label: "the order is cancelled, once",
        request: (ctx) => tool("orders.get", { order_id: ctx.vars.order }),
        expected: { status: 200, check: (b) => all(expect(order(b).status === "cancelled", `status ${str(order(b).status)}`), expect(order(b).cancellable === false, "still cancellable")) },
      },
      {
        id: "repropose",
        label: "proposing again is invalid_state",
        request: (ctx) => propose({ order_id: ctx.vars.order }),
        expected: { status: 422, code: "invalid_state" },
      },
    ],
  },
  {
    id: "double-confirm",
    group: "conversations",
    label: "Two confirms at once act once",
    note:
      "The customer double-taps Confirm: two executes of one proposal, different keys, sent together. Exactly one is done and one is 409, " +
      "and the order changes once. Uses up cust_1002's 70011 until the gateway restarts.",
    fixture: true,
    mutates: true,
    steps: [
      {
        id: "propose",
        label: "propose cancel 70011 as cust_1002",
        request: () => propose({ order_id: "70011", reason: "ordered_by_mistake" }, OTHER_CUSTOMER),
        skipWhen: alreadyCancelled("70011"),
        expected: { status: 200 },
        save: (b, ctx) => {
          ctx.vars.proposal = str(b.proposal_id);
        },
      },
      {
        id: "both",
        label: "two executes, sent together",
        requests: (ctx) => [
          execute(ctx.vars.proposal, OTHER_CUSTOMER, idemKey(ctx, "double-confirm", "a")),
          execute(ctx.vars.proposal, OTHER_CUSTOMER, idemKey(ctx, "double-confirm", "b")),
        ],
        expected: { status: [200, 409] },
        checkAll: (exchanges) => {
          const done = exchanges.filter((x) => x.statusCode === 200 && record(x.responseJson).status === "done").length;
          const conflict = exchanges.filter((x) => x.statusCode === 409 && record(x.responseJson).code === "already_executed").length;
          return expect(done === 1 && conflict === 1, `${done} done and ${conflict} already_executed, not one of each`);
        },
      },
      {
        id: "cancelled",
        label: "70011 is cancelled",
        request: () => tool("orders.get", { order_id: "70011" }, OTHER_CUSTOMER),
        expected: { status: 200, check: (b) => expect(order(b).status === "cancelled", `status ${str(order(b).status)}`) },
      },
    ],
  },

];

// ---- running -------------------------------------------------------------

export type Send = (request: StepRequest) => Promise<Exchange>;

export interface StepOutcome {
  step: Step;
  exchanges: Exchange[];
  failure: string | null;
}

export interface SimOutcome {
  simulation: Simulation;
  steps: StepOutcome[];
  /** "step 2 · …: why", or null when every step passed. */
  failure: string | null;
  /** Why it didn't run (or stopped early) here; not a failure. */
  skipped: string | null;
}

/** Run one simulation's steps in order, stopping at the first failure or
 * skip, since later steps build on earlier ones. Never throws: a thrown
 * `send` becomes that step's failure. */
export async function runSimulation(simulation: Simulation, send: Send, ctx: SimContext): Promise<SimOutcome> {
  const outcome: SimOutcome = { simulation, steps: [], failure: null, skipped: null };
  if (simulation.fixture && !ctx.fixture) {
    outcome.skipped = "needs the gateway's fixture data (a local target)";
    return outcome;
  }
  for (const [index, step] of simulation.steps.entries()) {
    const fail = (why: string) => `step ${index + 1} · ${step.label}: ${why}`;
    try {
      const requests = step.requests ? step.requests(ctx) : step.request ? [step.request(ctx)] : [];
      const skip = requests.find(isSkip);
      if (skip) {
        outcome.skipped = skip.skip;
        return outcome;
      }
      const sent = requests as StepRequest[];
      const exchanges = await Promise.all(sent.map((request) => send(request)));
      const result: StepOutcome = { step, exchanges, failure: null };
      outcome.steps.push(result);
      const first = exchanges[0];
      const body = record(first?.responseJson);
      const skipped = step.skipWhen && first && !first.error ? step.skipWhen(body, first, ctx) : null;
      if (skipped) {
        outcome.skipped = skipped;
        return outcome;
      }
      const failure =
        exchanges.map((exchange, i) => judge(exchange, step.expected, ctx, sent[i])).find((f) => f !== null) ??
        (step.checkAll ? step.checkAll(exchanges, ctx) : null);
      ctx.seen[step.id] = first;
      if (failure) {
        result.failure = failure;
        outcome.failure = fail(failure);
        return outcome;
      }
      step.save?.(body, ctx);
    } catch (error) {
      outcome.failure = fail(error instanceof Error ? error.message : String(error));
      return outcome;
    }
  }
  return outcome;
}

/** Contract simulations must pass; skips are reported apart; a known gap
 * that passes means its fix landed. */
export function tally(outcomes: readonly SimOutcome[]) {
  const ran = outcomes.filter((o) => o.skipped === null);
  const contract = ran.filter((o) => o.simulation.group !== "known gaps");
  const gaps = ran.filter((o) => o.simulation.group === "known gaps");
  return {
    passed: contract.filter((o) => o.failure === null).length,
    total: contract.length,
    skipped: outcomes.length - ran.length,
    gapsOpen: gaps.filter((o) => o.failure !== null).length,
    gapsFixed: [...new Set(gaps.filter((o) => o.failure === null).map((o) => o.simulation.bug ?? o.simulation.id))],
  };
}

// ---- the form ------------------------------------------------------------

/** Sample arguments for a capability's input schema: required fields get a
 * fixture value, optional ones are left out (tick-to-omit: the form adds
 * them only when asked). */
export function sampleArguments(capability: Pick<Capability, "name" | "input_schema"> | undefined): Record<string, unknown> {
  if (!capability) return {};
  const schema = record(capability.input_schema);
  const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
  const properties = record(schema.properties);
  const sample: Record<string, unknown> = {};
  for (const field of required) {
    const property = record(properties[field]);
    if (field === "order_id") sample[field] = "55120";
    else if (Array.isArray(property.enum)) sample[field] = property.enum[0];
    else if (property.type === "integer" || property.type === "number") sample[field] = property.minimum ?? 1;
    else if (property.type === "boolean") sample[field] = false;
    else sample[field] = "";
  }
  return sample;
}

/** A fresh Idempotency-Key, valid for the gateway (16–128 of [A-Za-z0-9_.:-]). */
export function freshIdempotencyKey(random: () => string = () => Math.random().toString(36).slice(2, 10)): string {
  return `console-${Date.now().toString(36)}-${random()}${random()}`.slice(0, 128);
}

/** The capabilities the form can offer for a route kind: the live inventory
 * when there is one, else the v1 names (so a gateway that won't list still
 * gets a form, and its own answer says why). */
export function capabilitiesFor(inventory: Inventory | null, kind: Kind): Capability[] {
  const live = (inventory?.capabilities ?? []).filter((c) => c.kind === kind);
  if (live.length) return live;
  const fallback: Capability[] = [
    { name: "orders.list_recent", kind: "read", version: 1, description: "", requires_subject: true, input_schema: { type: "object", additionalProperties: false, properties: { limit: { type: "integer", minimum: 1, maximum: 10, default: 5 } } } },
    { name: "orders.get", kind: "read", version: 1, description: "", requires_subject: true, input_schema: { type: "object", additionalProperties: false, required: ["order_id"], properties: { order_id: { type: "string", pattern: "^[0-9]{4,12}$" } } } },
    { name: "orders.cancel", kind: "write", version: 1, risk: "low", description: "", requires_subject: true, input_schema: { type: "object", additionalProperties: false, required: ["order_id"], properties: { order_id: { type: "string" }, reason: { type: "string", enum: [...CANCEL_REASONS] } } } },
  ];
  return fallback.filter((c) => c.kind === kind);
}
