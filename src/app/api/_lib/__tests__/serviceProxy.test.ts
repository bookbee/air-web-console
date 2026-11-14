// @vitest-environment node
import { generateKeyPairSync } from "node:crypto";

import { decodeJwt, jwtVerify } from "jose";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadDefaults, toPublicDefaults } from "@/lib/config";
import { toCurl, type Exchange } from "@/lib/http/exchange";

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock("undici", () => ({ fetch: fetchMock, Agent: class {} }));

import { handleServiceProxy } from "../serviceProxy";

const pair = generateKeyPairSync("ec", { namedCurve: "P-256" });
const PEM_ONE_LINE = String(pair.privateKey.export({ type: "pkcs8", format: "pem" })).trim().replace(/\n/g, "\\n");
const GATEWAY = "test-gateway-token";
const T = "AIR_WEB__TARGETS__LOCAL__";

function configureLocal(overrides: Record<string, string> = {}) {
  const fields: Record<string, string> = {
    ORCHESTRATOR_CUSTOMER_TOKEN_PRIVATE_KEY: PEM_ONE_LINE,
    ORCHESTRATOR_CUSTOMER_TOKEN_KID: "brightcart-dev-1",
    ORCHESTRATOR_CUSTOMER_TOKEN_ISSUER: "air-web-console-dev",
    ORCHESTRATOR_CUSTOMER_TOKEN_TENANT: "brightcart",
    ORCHESTRATOR_CUSTOMER_TOKEN_TTL_S: "600",
    ORCHESTRATOR_CUSTOMER_TOKEN_SUBJECTS: "cust_1001,cust_1002",
    ...overrides,
  };
  for (const [field, value] of Object.entries(fields)) vi.stubEnv(`${T}${field}`, value);
}

beforeEach(() => {
  vi.stubEnv("AIR_WEB__GATEWAY_TOKEN", GATEWAY);
  vi.stubEnv("NODE_ENV", "development");
  // A second, remote target with no customer-token config.
  vi.stubEnv("AIR_WEB__TARGETS__QA__ORCHESTRATOR_BASE_URL", "https://orchestrator.qa.example.internal");
  vi.stubEnv("AIR_WEB__TARGETS__QA__ORCHESTRATOR_CUSTOMER_API_KEY", "qa-customer-key");
  configureLocal();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => new Response(JSON.stringify({ status: "ok", answer: "hi" }), { status: 200, headers: { "content-type": "application/json" } }));
});
afterEach(() => vi.unstubAllEnvs());

type Call = { service?: "air-orchestrator-service" | "air-classifier-service" | "air-model-gateway" | "air-rag-service"; target?: string; channel?: string; customer?: string; mode?: string; stream?: "collected" | "live" };

function request({ target = "local", channel = "customer", customer, mode, stream }: Call): NextRequest {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${GATEWAY}`,
    "Content-Type": "application/json",
    Accept: stream ? "text/event-stream" : "application/json",
    "X-Target-Name": target,
  };
  if (channel) headers["X-Target-Channel"] = channel;
  if (customer) headers["X-Target-Customer"] = customer;
  if (mode) headers["X-Target-Customer-Token-Mode"] = mode;
  if (stream === "live") headers["X-Stream-Mode"] = "live";
  return new NextRequest("http://console.test/api/orchestrator/v1/chat", { method: "POST", headers, body: JSON.stringify({ message: "where is my order?" }) });
}

async function send(call: Call): Promise<{ exchange: Exchange; raw: string }> {
  const response = await handleServiceProxy(request(call), ["v1", "chat"], call.service ?? "air-orchestrator-service");
  const raw = await response.text();
  if (call.stream === "live") {
    const lines = raw.trim().split("\n").map((line) => JSON.parse(line) as { exchange?: Exchange });
    return { exchange: lines.at(-1)!.exchange!, raw };
  }
  return { exchange: JSON.parse(raw) as Exchange, raw };
}

/** The headers the stubbed upstream received on its last call. */
function upstreamHeaders(): Record<string, string> {
  const [, init] = fetchMock.mock.calls.at(-1)!;
  return init.headers as Record<string, string>;
}

const verify = (token: string) =>
  jwtVerify(token, pair.publicKey, { algorithms: ["ES256"], audience: "air-orchestrator-service", issuer: "air-web-console-dev" });

describe("public config", () => {
  it("exposes only the configured flag and the subjects: no PEM, kid, issuer or tenant", () => {
    const json = JSON.stringify(toPublicDefaults(loadDefaults()));
    const local = toPublicDefaults(loadDefaults()).targets.local;
    expect(local.orchestratorCustomerTokenConfigured).toBe(true);
    expect(local.orchestratorCustomerSubjects).toEqual(["cust_1001", "cust_1002"]);
    expect(local.orchestratorCustomerTokenTestModes).toBe(true);
    expect(json).not.toContain("BEGIN");
    expect(json).not.toContain("PRIVATE");
    expect(json).not.toContain(PEM_ONE_LINE.split("\\n")[1]);
    for (const secret of ["brightcart-dev-1", "air-web-console-dev", "brightcart"]) expect(json).not.toContain(secret);
    expect(toPublicDefaults(loadDefaults()).targets.qa).toMatchObject({ orchestratorCustomerTokenConfigured: false, orchestratorCustomerSubjects: [] });
  });

  it("reports a half-configured target and offers no tokens", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    configureLocal({ ORCHESTRATOR_CUSTOMER_TOKEN_SUBJECTS: "" });
    const local = toPublicDefaults(loadDefaults()).targets.local;
    expect(local.orchestratorCustomerTokenConfigured).toBe(false);
    expect(local.orchestratorCustomerTokenError).toMatch(/SUBJECTS/);
  });

  it("allows test modes only on a local target, on a dev server or with the opt-in flag", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(toPublicDefaults(loadDefaults()).targets.local.orchestratorCustomerTokenTestModes).toBe(false);
    vi.stubEnv("AIR_WEB__CUSTOMER_TOKEN_TEST_MODES", "true");
    expect(toPublicDefaults(loadDefaults()).targets.local.orchestratorCustomerTokenTestModes).toBe(true);
    vi.stubEnv(`${T}ORCHESTRATOR_BASE_URL`, "https://orchestrator.staging.example.internal");
    expect(toPublicDefaults(loadDefaults()).targets.local.orchestratorCustomerTokenTestModes).toBe(false);
  });
});

describe("the proxy", () => {
  it("sends air-token beside X-API-Key for a picked customer on the customer channel", async () => {
    const { exchange } = await send({ customer: "cust_1001" });
    const headers = upstreamHeaders();
    expect(headers["X-API-Key"]).toBe("airo_local_customer_key");
    const { payload } = await verify(headers["air-token"]);
    expect(payload).toMatchObject({ sub: "cust_1001", air_tenant: "brightcart" });
    expect(exchange.customerToken).toMatchObject({ sub: "cust_1001", tenant: "brightcart", issuer: "air-web-console-dev", kid: "brightcart-dev-1", mode: "valid" });
  });

  it("mints a new token for every request", async () => {
    await send({ customer: "cust_1001" });
    const first = decodeJwt(upstreamHeaders()["air-token"]).jti;
    await send({ customer: "cust_1001" });
    expect(decodeJwt(upstreamHeaders()["air-token"]).jti).not.toBe(first);
  });

  it.each<[string, Call]>([
    ["anonymous", {}],
    ["the business channel", { channel: "business", customer: "cust_1001" }],
    ["the classifier", { service: "air-classifier-service", channel: "", customer: "cust_1001" }],
    ["the model gateway", { service: "air-model-gateway", channel: "", customer: "cust_1001" }],
    ["air-rag-service", { service: "air-rag-service", channel: "", customer: "cust_1001" }],
  ])("sends no token for %s", async (_name, call) => {
    const { exchange } = await send(call);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(upstreamHeaders()["air-token"]).toBeUndefined();
    expect(exchange.customerToken).toBeUndefined();
  });

  it.each<[string, Call, RegExp]>([
    ["a customer the target doesn't list", { customer: "cust_9999" }, /customer not configured for this target/],
    ["a target with no token config", { target: "qa", customer: "cust_1001" }, /no customer token configured/],
  ])("refuses %s without calling upstream", async (_name, call, message) => {
    const { exchange } = await send(call);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(exchange.error).toMatch(message);
    expect(exchange.statusCode).toBeNull();
  });

  it.each<["collected" | "live"]>([["collected"], ["live"]])("masks the token in the %s Exchange and its cURL", async (stream) => {
    fetchMock.mockImplementation(
      async () =>
        new Response('event: answer\ndata: {"answer":"hi"}\n\nevent: turn.end\ndata: {}\n\n', {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }),
    );
    const { exchange, raw } = await send({ customer: "cust_1001", stream });
    const token = upstreamHeaders()["air-token"];
    expect(token.split(".")).toHaveLength(3);
    expect(exchange.requestHeaders["air-token"]).toBe("••••••••");
    expect(exchange.requestHeaders["X-API-Key"]).toBe("••••••••");
    const curl = toCurl(exchange);
    for (const segment of token.split(".")) {
      expect(raw).not.toContain(segment);
      expect(curl).not.toContain(segment);
    }
    expect(exchange.customerToken?.sub).toBe("cust_1001");
  });

  it("applies test modes where allowed, and ignores them (and unknown values) elsewhere", async () => {
    await send({ customer: "cust_1001", mode: "wrong-tenant" });
    expect(decodeJwt(upstreamHeaders()["air-token"]).air_tenant).toBe("othershop");
    await send({ customer: "cust_1001", mode: "something-else" });
    expect((await verify(upstreamHeaders()["air-token"])).payload.air_tenant).toBe("brightcart");

    vi.stubEnv("NODE_ENV", "production");
    const { exchange } = await send({ customer: "cust_1001", mode: "expired" });
    await expect(verify(upstreamHeaders()["air-token"])).resolves.toBeTruthy();
    expect(exchange.customerToken?.mode).toBe("valid");
  });
});
