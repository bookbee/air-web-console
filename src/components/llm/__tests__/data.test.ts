import { describe, expect, it } from "vitest";

import type { Exchange } from "@/lib/http/exchange";

import { expectationFor, judge, pinSuggestions, rungFailures, SCENARIOS, tally } from "../data";

describe("rungFailures", () => {
  it("splits a 502 detail into one line per rung", () => {
    const detail =
      "all providers failed: ollama: Client error '404 Not Found' for url 'http://x/api/chat'; " +
      "llama.cpp:llama-3.2-3b-gguf: circuit open; openai: no OPENAI api key configured";
    expect(rungFailures(detail)).toEqual([
      "ollama: Client error '404 Not Found' for url 'http://x/api/chat'",
      "llama.cpp:llama-3.2-3b-gguf: circuit open",
      "openai: no OPENAI api key configured",
    ]);
  });

  it("keeps a '; ' inside one rung's own message on that rung", () => {
    const detail = "all providers failed: gemini: 400 bad; see docs; anthropic: 400 nope";
    expect(rungFailures(detail)).toEqual(["gemini: 400 bad; see docs", "anthropic: 400 nope"]);
  });

  it("returns nothing for any other detail", () => {
    expect(rungFailures("missing or invalid X-API-Key")).toEqual([]);
    expect(rungFailures(undefined)).toEqual([]);
  });
});

describe("expectationFor", () => {
  const embed = SCENARIOS.find((s) => s.id === "embed-local")!;
  const unknownField = SCENARIOS.find((s) => s.id === "unknown-field")!;

  it("uses the shared expectation outside local", () => {
    expect(expectationFor(embed, "staging")).toEqual({ status: 403, code: "policy_denied" });
    expect(expectationFor(embed, "local").status).toBe(200);
  });

  it("falls back to local when a scenario behaves the same everywhere", () => {
    expect(expectationFor(unknownField, "prod")).toEqual(unknownField.local);
  });

  it("treats an unknown environment as local", () => {
    expect(expectationFor(embed, null).status).toBe(200);
  });
});

describe("judge", () => {
  const unknownField = SCENARIOS.find((s) => s.id === "unknown-field")!;
  const exchange = (statusCode: number, responseJson: unknown): Exchange => ({
    method: "POST",
    url: "http://gw/v1/generate",
    requestHeaders: {},
    requestBody: null,
    statusCode,
    reason: "",
    responseHeaders: {},
    responseJson,
    responseText: "",
    elapsedMs: 0,
    error: null,
    isStream: false,
    events: [],
  });

  it("passes a 422 that names the field", () => {
    const body = { code: "validation_error", detail: "stream_options: Extra inputs are not permitted" };
    expect(judge(exchange(422, body), unknownField.local)).toBeNull();
  });

  it("fails a 422 whose detail names something else", () => {
    const body = { code: "validation_error", detail: "messages: Field required" };
    expect(judge(exchange(422, body), unknownField.local)).toBe("detail doesn't name stream_options");
  });

  it("reports the status and code it got instead", () => {
    expect(judge(exchange(502, { code: "provider_unavailable" }), unknownField.local)).toBe("got 502 provider_unavailable");
  });
});

describe("SCENARIOS", () => {
  it("has unique ids", () => {
    const ids = SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("never targets the removed /v1/inference outside the scenarios that prove it is gone", () => {
    const old = SCENARIOS.filter((s) => s.path === "/v1/inference").map((s) => s.id);
    expect(old.sort()).toEqual(["404-problem", "inference-removed"]);
  });

  it("streams exactly the scenarios whose body asks for it", () => {
    for (const s of SCENARIOS) expect(Boolean(s.stream)).toBe(s.body?.stream === true);
  });
});

describe("pinSuggestions", () => {
  it("lists every rung once, in chain order", () => {
    const caps = {
      generate: {
        local: { allowed: true, chain: ["ollama:llama3.2:3b", "llama.cpp:gguf"] },
        auto: { allowed: true, chain: ["ollama:llama3.2:3b", "gemini:gemini-2.5-flash"] },
      },
    };
    expect(pinSuggestions(caps)).toEqual(["ollama:llama3.2:3b", "llama.cpp:gguf", "gemini:gemini-2.5-flash"]);
    expect(pinSuggestions(null)).toEqual([]);
  });
});

describe("tally", () => {
  it("keeps open known gaps out of the contract count", () => {
    const results = SCENARIOS.map((scenario) => ({ scenario, failure: scenario.group === "known gaps" ? "open" : null }));
    const counts = tally(results);
    expect(counts.contractPassed).toBe(counts.contractTotal);
    expect(counts.gapsOpen).toBe(SCENARIOS.filter((s) => s.group === "known gaps").length);
    expect(counts.gapsFixed).toEqual([]);
  });

  it("names a known gap that now passes by its bug id, once", () => {
    const contract = SCENARIOS.filter((s) => s.group !== "known gaps");
    const gap = { ...contract[0], group: "known gaps" as const, bug: "MG-999" };
    const counts = tally([gap, gap, ...contract].map((scenario) => ({ scenario, failure: null })));
    expect(counts.gapsFixed).toEqual(["MG-999"]);
    expect(counts.contractTotal).toBe(contract.length);
  });

  it("gives every known gap a report under bugs/model-gateway/", () => {
    for (const s of SCENARIOS.filter((s) => s.group === "known gaps")) expect(s.bug).toMatch(/^MG-\d{3}$/);
  });
});
