import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { Exchange } from "@/lib/http/exchange";

import {
  capabilityFailure,
  detailFailure,
  FIXTURES,
  idemKey,
  IDEMPOTENCY_KEY,
  inventoryFailure,
  judge,
  leakFailure,
  newContext,
  routeOf,
  runSimulation,
  sampleArguments,
  SIMULATIONS,
  tally,
  type Send,
  type Simulation,
  type StepRequest,
} from "../data";

const NOW = Date.UTC(2026, 10, 15, 10, 0, 0);

function exchange(status: number | null, body: unknown, overrides: Partial<Exchange> = {}): Exchange {
  const problem = status !== null && status >= 400;
  return {
    method: "POST",
    url: "http://127.0.0.1:8084/v1/tools/orders.get",
    requestHeaders: { "X-Request-ID": "web_1" },
    requestBody: null,
    statusCode: status,
    reason: "",
    responseHeaders: { "x-request-id": "web_1", "content-type": problem ? "application/problem+json; charset=utf-8" : "application/json" },
    responseJson: body,
    responseText: JSON.stringify(body),
    elapsedMs: 1,
    error: null,
    isStream: false,
    events: [],
    ...overrides,
  };
}

const problem = (code: string, status: number, detail = "No such order.") => ({ type: `https://air.local/problems/${code}`, title: "t", status, code, detail });
const GET_55120: StepRequest = { method: "POST", path: "/v1/tools/orders.get", body: { arguments: { order_id: "55120" }, subject: "cust_1001" } };
const ctx = (fixture = true) => newContext(fixture, () => NOW);

describe("the mirrored fixtures", () => {
  it("are byte-for-byte the gateway's, when the sibling checkout is here", () => {
    for (const tenant of ["brightcart", "othershop"]) {
      let sibling: string;
      try {
        sibling = readFileSync(`../air-tools-gateway/fixtures/${tenant}/orders.json`, "utf8");
      } catch {
        continue; // CI has no sibling checkout; make tools-check reports drift there.
      }
      expect(readFileSync(`src/components/tools/fixtures/${tenant}-orders.json`, "utf8"), tenant).toBe(sibling);
    }
  });

  it("hold the collision the cross-tenant check relies on", () => {
    const bc = FIXTURES.brightcart.find((o) => o.order_id === "55120");
    const os = FIXTURES.othershop.find((o) => o.order_id === "55120");
    expect(bc?.total.amount).toBe("1240.00");
    expect(os?.total.amount).toBe("799.00");
  });
});

describe("judge", () => {
  it("passes a contract-shaped tool result for the subject's own order", () => {
    const body = { capability: "orders.get", data: { order_id: "55120", total: { amount: "1240.00", currency: "INR" } }, truncated: false, as_of: "2026-11-15T10:00:00Z" };
    expect(judge(exchange(200, body), { status: 200 }, ctx(), GET_55120)).toBeNull();
  });

  it("reports a status mismatch with the code and detail", () => {
    expect(judge(exchange(404, problem("not_found", 404, "No such endpoint.")), { status: 200 }, ctx(), GET_55120)).toBe('got 404 not_found "No such endpoint."');
  });

  it("holds every error to problem+json with a matching closed-set code", () => {
    const expected = { status: 404, code: "not_found" as const };
    expect(judge(exchange(404, problem("not_found", 404)), expected, ctx(), GET_55120)).toBeNull();
    expect(judge(exchange(404, problem("not_found", 404), { responseHeaders: { "x-request-id": "web_1", "content-type": "application/json" } }), expected, ctx(), GET_55120)).toMatch(/not problem\+json/);
    expect(judge(exchange(404, problem("missing", 404)), expected, ctx(), GET_55120)).toMatch(/closed set/);
    expect(judge(exchange(404, { ...problem("not_found", 404), type: "about:blank" }), expected, ctx(), GET_55120)).toMatch(/problem type/);
    expect(judge(exchange(404, problem("unknown_capability", 404)), expected, ctx(), GET_55120)).toMatch(/not not_found/);
    expect(judge(exchange(404, problem("not_found", 404, "connect ECONNREFUSED http://10.0.0.5:5432")), expected, ctx(), GET_55120)).toMatch(/rule 10/);
  });

  it("requires X-Request-ID to come back", () => {
    const x = exchange(404, problem("not_found", 404), { responseHeaders: { "content-type": "application/problem+json" } });
    expect(judge(x, { status: 404 }, ctx(), GET_55120)).toMatch(/X-Request-ID/);
  });

  it("catches another customer's order, another tenant's amount, and customer ids", () => {
    const wrap = (data: unknown) => ({ capability: "orders.get", data, truncated: false, as_of: "2026-11-15T10:00:00Z" });
    const theirs = judge(exchange(200, wrap({ order_id: "70011" })), { status: 200 }, ctx(), GET_55120);
    expect(theirs).toMatch(/belongs to another customer/);
    const othershop = judge(exchange(200, wrap({ order_id: "55120", total: { amount: "799.00" } })), { status: 200 }, ctx(), GET_55120);
    expect(othershop).toMatch(/isn't brightcart's 1240.00/);
    expect(leakFailure(wrap({ order_id: "55120", customer_id: "cust_1001" }), "brightcart", "cust_1001")).toMatch(/rule 9/);
    // Off the fixtures (a remote target), there is nothing to compare with.
    expect(judge(exchange(200, wrap({ order_id: "70011" })), { status: 200 }, ctx(false), GET_55120)).toBeNull();
  });

  it("checks a proposal's expiry is at most 10 minutes out", () => {
    const req: StepRequest = { method: "POST", path: "/v1/actions/orders.cancel/propose", body: { arguments: {}, subject: "cust_1001" } };
    const proposal = (minutes: number) => ({ proposal_id: "gp_1", capability: "orders.cancel", risk: "low", summary: "Cancel 55120.", expires_at: new Date(NOW + minutes * 60_000).toISOString() });
    expect(judge(exchange(200, proposal(10)), { status: 200 }, ctx(), req)).toBeNull();
    expect(judge(exchange(200, proposal(30)), { status: 200 }, ctx(), req)).toMatch(/rule 6/);
  });
});

describe("the inventory rules", () => {
  const ok = { name: "orders.get", kind: "read", version: 1, description: "One order.", requires_subject: true, input_schema: { type: "object", additionalProperties: false, properties: {} } };

  it("accepts a well-formed entry", () => {
    expect(capabilityFailure(ok)).toBeNull();
    expect(inventoryFailure({ service: "air-tools-gateway", version: "0.1.0", capabilities: [ok] })).toBeNull();
  });

  it.each([
    ["an open schema", { input_schema: { type: "object", properties: {} } }, /closed object/],
    ["a subject argument", { input_schema: { type: "object", additionalProperties: false, properties: { subject: {} } } }, /subject or tenant/],
    ["a bad name", { name: "Orders" }, /pattern/],
    ["a read with a risk", { risk: "low" }, /a read with a risk/],
    ["a write with no risk", { kind: "write" }, /no valid risk/],
    ["an extra field", { url: "http://x" }, /unexpected field url/],
  ])("rejects %s", (_name, override, message) => {
    expect(capabilityFailure({ ...ok, ...override })).toMatch(message);
  });

  it("rejects duplicates", () => {
    expect(inventoryFailure({ service: "air-tools-gateway", version: "1", capabilities: [ok, ok] })).toMatch(/duplicate/);
  });
});

describe("runSimulation", () => {
  const sim = (steps: Simulation["steps"], extra: Partial<Simulation> = {}): Simulation => ({ id: "t", group: "conversations", label: "t", note: "", steps, ...extra });
  const ok200 = { capability: "orders.cancel", proposal_id: "gp_abc", risk: "low", summary: "Cancel 55120.", expires_at: new Date(NOW + 600_000).toISOString() };
  const proposeReq: StepRequest = { method: "POST", path: "/v1/actions/orders.cancel/propose", body: { arguments: {}, subject: "cust_1001" } };

  it("passes values forward and compares replays byte for byte", async () => {
    const sent: StepRequest[] = [];
    const send: Send = async (request) => {
      sent.push(request);
      return exchange(200, ok200, { url: `http://g${request.path}` });
    };
    const outcome = await runSimulation(
      sim([
        { id: "a", label: "a", request: () => proposeReq, expected: { status: 200 }, save: (b, c) => void (c.vars.p = String(b.proposal_id)) },
        { id: "b", label: "b", request: (c) => ({ ...proposeReq, body: { arguments: { p: c.vars.p }, subject: "cust_1001" } }), expected: { status: 200, check: (_b, x, c) => (x.responseText === c.seen.a.responseText ? null : "differs") } },
      ]),
      send,
      ctx(),
    );
    expect(outcome.failure).toBeNull();
    expect((sent[1].body as { arguments: { p: string } }).arguments.p).toBe("gp_abc");
  });

  it("stops at the first failure and names the step", async () => {
    const send: Send = async () => exchange(404, problem("not_found", 404, "No such endpoint."));
    const outcome = await runSimulation(sim([{ id: "a", label: "execute it", request: () => proposeReq, expected: { status: 200 } }, { id: "b", label: "never", request: () => proposeReq, expected: { status: 200 } }]), send, ctx());
    expect(outcome.failure).toBe('step 1 · execute it: got 404 not_found "No such endpoint."');
    expect(outcome.steps).toHaveLength(1);
  });

  it("skips, rather than fails, when an earlier run used the order up", async () => {
    const send: Send = async () => exchange(422, problem("invalid_state", 422, "The order is cancelled."));
    const outcome = await runSimulation(
      sim([{ id: "a", label: "propose", request: () => proposeReq, expected: { status: 200 }, skipWhen: (b) => (b.code === "invalid_state" ? "already cancelled" : null) }]),
      send,
      ctx(),
    );
    expect(outcome).toMatchObject({ failure: null, skipped: "already cancelled" });
    expect(tally([outcome])).toMatchObject({ passed: 0, total: 0, skipped: 1 });
  });

  it("skips fixture-bound simulations off the fixtures", async () => {
    const send: Send = async () => {
      throw new Error("must not be called");
    };
    expect((await runSimulation(sim([], { fixture: true }), send, ctx(false))).skipped).toMatch(/fixture/);
  });

  it("sends parallel requests together and judges them as a set", async () => {
    let inFlight = 0;
    let peak = 0;
    let n = 0;
    const send: Send = async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return n++ === 0 ? exchange(200, { status: "done", execution_id: "gx", capability: "orders.cancel", result: {} }) : exchange(409, problem("already_executed", 409, "Already executed."));
    };
    const req: StepRequest = { method: "POST", path: "/v1/actions/orders.cancel/execute", body: { proposal_id: "gp", subject: "cust_1001" } };
    const outcome = await runSimulation(
      sim([{ id: "both", label: "both", requests: () => [req, req], expected: { status: [200, 409] }, checkAll: (xs) => (xs.length === 2 ? null : "not two") }]),
      send,
      newContext(false, () => NOW),
    );
    expect(outcome.failure).toBeNull();
    expect(peak).toBe(2);
  });

  it("turns a thrown send into that step's failure", async () => {
    const send: Send = async () => {
      throw new Error("socket hang up");
    };
    expect((await runSimulation(sim([{ id: "a", label: "a", request: () => proposeReq, expected: { status: 200 } }]), send, ctx())).failure).toBe("step 1 · a: socket hang up");
  });
});

describe("the simulation set", () => {
  it("has unique ids, and only headless rows choose a key", () => {
    const ids = SIMULATIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    const c = newContext(true, () => NOW);
    c.vars = { proposal: "gp_x", order: "55120", amount: "1240.00" };
    for (const simulation of SIMULATIONS) {
      for (const step of simulation.steps) {
        const requests = step.requests ? step.requests(c) : step.request ? [step.request(c)] : [];
        for (const request of requests) {
          if ("skip" in request) continue;
          if (request.auth || request.rawBody) expect(simulation.direct, `${simulation.id} chooses a key but isn't headless`).toBe(true);
          if (request.idempotencyKey && simulation.id !== "execute-short-key") expect(request.idempotencyKey).toMatch(IDEMPOTENCY_KEY);
        }
      }
    }
  });

  it("marks every execute that can succeed as a write", () => {
    for (const id of ["cancel-last-order", "double-confirm"]) expect(SIMULATIONS.find((s) => s.id === id)?.mutates).toBe(true);
  });

  it("derives idempotency keys per run and slot", () => {
    const a = newContext(true);
    expect(idemKey(a, "x", "a")).not.toBe(idemKey(a, "x", "b"));
    expect(idemKey(a, "x", "a")).toMatch(IDEMPOTENCY_KEY);
  });
});

describe("helpers", () => {
  it("routes paths", () => {
    expect(routeOf("/v1/actions/orders.cancel/execute")).toEqual({ route: "execute", name: "orders.cancel" });
    expect(routeOf("/v1/tools/orders.get")).toEqual({ route: "tool", name: "orders.get" });
    expect(routeOf("/v1/nope").route).toBe("other");
  });

  it("samples only required arguments", () => {
    const cancel = { name: "orders.cancel", input_schema: { type: "object", required: ["order_id"], properties: { order_id: { type: "string" }, reason: { enum: ["changed_mind"] } } } };
    expect(sampleArguments(cancel)).toEqual({ order_id: "55120" });
    expect(sampleArguments({ name: "orders.list_recent", input_schema: { type: "object", properties: { limit: {} } } })).toEqual({});
  });

  it("screens detail for URLs and stacks", () => {
    expect(detailFailure("No such order.")).toBeNull();
    expect(detailFailure("at Object.<anonymous> (/app/src/x.ts:1:2)")).toMatch(/stack/);
  });
});

describe("a gateway with no execute route", () => {
  it("fails every execute simulation, including the ones that expect a 404", async () => {
    const order = { order_id: "55120", placed_at: "2026-11-12", status: "confirmed", total: { amount: "1240.00", currency: "INR" }, cancellable: true };
    // Reads and propose work; execute answers what the gateway answers today
    // for a route it doesn't serve.
    const send: Send = async (request) => {
      const { route, name } = routeOf(request.path);
      if (route === "execute") return exchange(404, problem("not_found", 404, "No such endpoint."));
      if (route === "propose") {
        return exchange(200, { proposal_id: "gp_1", capability: name, risk: "low", summary: "Cancel order 55120.", expires_at: new Date(NOW + 60_000).toISOString(), preview: { order_id: "55120", refund: order.total } });
      }
      const data = name === "orders.list_recent" ? { orders: [order] } : order;
      return exchange(200, { capability: name, data, truncated: false, as_of: "2026-11-15T10:00:00Z" });
    };
    const c = newContext(false, () => NOW);
    c.vars = { proposal: "gp_1", order: "55120" };
    const touchesExecute = (simulation: Simulation) =>
      simulation.steps.some((step) =>
        (step.requests ? step.requests(c) : step.request ? [step.request(c)] : []).some((r) => !("skip" in r) && routeOf(r.path).route === "execute"),
      );
    const executing = SIMULATIONS.filter(touchesExecute);
    expect(executing.length).toBeGreaterThanOrEqual(8);
    for (const simulation of executing) {
      const outcome = await runSimulation(simulation, send, newContext(true, () => NOW));
      expect(outcome.skipped, simulation.id).toBeNull();
      expect(outcome.failure, simulation.id).not.toBeNull();
    }
  });
});
