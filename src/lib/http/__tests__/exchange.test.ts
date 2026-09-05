import { describe, expect, it } from "vitest";

import {
  displayHeaders,
  exchangeOk,
  exchangeRequestId,
  exchangeServerLatencyMs,
  joinUrl,
  toCurl,
  type Exchange,
} from "../exchange";

function baseExchange(overrides: Partial<Exchange> = {}): Exchange {
  return {
    method: "POST",
    url: "http://127.0.0.1:8082/v1/classify",
    requestHeaders: { "Content-Type": "application/json", "X-API-Key": "airc_local_dev_key" },
    requestBody: { text: "hello" },
    statusCode: 200,
    reason: "OK",
    responseHeaders: {},
    responseJson: { ok: true },
    responseText: "",
    elapsedMs: 12,
    error: null,
    isStream: false,
    events: [],
    ...overrides,
  };
}

describe("joinUrl", () => {
  it("joins a base URL and a path regardless of slashes on either side", () => {
    expect(joinUrl("http://127.0.0.1:8082", "/v1/health")).toBe("http://127.0.0.1:8082/v1/health");
    expect(joinUrl("http://127.0.0.1:8082/", "v1/health")).toBe("http://127.0.0.1:8082/v1/health");
    expect(joinUrl("http://127.0.0.1:8082//", "//v1/health")).toBe("http://127.0.0.1:8082/v1/health");
  });
});

describe("exchangeOk", () => {
  it("is true only for a 2xx/3xx response with no transport error", () => {
    expect(exchangeOk(baseExchange({ statusCode: 200 }))).toBe(true);
    expect(exchangeOk(baseExchange({ statusCode: 404 }))).toBe(false);
    expect(exchangeOk(baseExchange({ error: "boom", statusCode: null }))).toBe(false);
  });
});

describe("exchangeRequestId / exchangeServerLatencyMs", () => {
  it("prefers the body's own request_id, falling back to the header", () => {
    expect(exchangeRequestId(baseExchange({ responseJson: { request_id: "abc" } }))).toBe("abc");
    expect(
      exchangeRequestId(
        baseExchange({ responseJson: null, responseHeaders: { "x-request-id": "hdr-1" } }),
      ),
    ).toBe("hdr-1");
    expect(exchangeRequestId(baseExchange({ responseJson: null, responseHeaders: {} }))).toBeNull();
  });

  it("reads the service-reported latency_ms from the body", () => {
    expect(exchangeServerLatencyMs(baseExchange({ responseJson: { latency_ms: 42 } }))).toBe(42);
    expect(exchangeServerLatencyMs(baseExchange({ responseJson: {} }))).toBeNull();
  });
});

describe("displayHeaders", () => {
  it("masks secret headers by default", () => {
    const masked = displayHeaders({ "X-API-Key": "secret", "Content-Type": "application/json" });
    expect(masked["X-API-Key"]).toBe("••••••••");
    expect(masked["Content-Type"]).toBe("application/json");
  });

  it("reveals secrets when asked", () => {
    const revealed = displayHeaders({ "X-API-Key": "secret" }, true);
    expect(revealed["X-API-Key"]).toBe("secret");
  });

  it("never masks an already-empty header value", () => {
    expect(displayHeaders({ "X-API-Key": "" })["X-API-Key"]).toBe("");
  });
});

describe("toCurl", () => {
  it("masks the API key by default and single-quotes every argument", () => {
    const curl = toCurl(baseExchange());
    expect(curl).toContain("curl -X POST");
    expect(curl).toContain("'http://127.0.0.1:8082/v1/classify'");
    expect(curl).toContain("X-API-Key: ••••••••");
    expect(curl).not.toContain("airc_local_dev_key");
  });

  it("reveals the real key when asked", () => {
    expect(toCurl(baseExchange(), true)).toContain("airc_local_dev_key");
  });

  it("adds -N for a streamed exchange", () => {
    expect(toCurl(baseExchange({ isStream: true }))).toContain("curl -X POST \\\n  -N");
  });

  it("safely quotes a body containing a single quote", () => {
    const curl = toCurl(baseExchange({ requestBody: { text: "it's broken" } }));
    expect(curl).toContain(`it'\\''s broken`);
  });
});
