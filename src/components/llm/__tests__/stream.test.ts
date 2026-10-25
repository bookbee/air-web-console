import { describe, expect, it } from "vitest";

import type { Exchange } from "@/lib/http/exchange";

import { foldStream, responseBody } from "../stream";

const exchange = (overrides: Partial<Exchange>): Exchange => ({
  method: "POST",
  url: "http://gw/v1/generate",
  requestHeaders: {},
  requestBody: null,
  statusCode: 200,
  reason: "OK",
  responseHeaders: {},
  responseJson: null,
  responseText: "",
  elapsedMs: 0,
  error: null,
  isStream: true,
  events: [],
  ...overrides,
});

describe("foldStream", () => {
  it("rebuilds a GenerateOutput from start, deltas and done", () => {
    const folded = foldStream([
      { event: "start", id: "a", model: "llama3.2:3b", provider: "ollama", cached: false, received_ms: 120 },
      { event: "delta", content: "Hel", received_ms: 150 },
      { event: "delta", content: "lo", received_ms: 170 },
      { event: "done", id: "a", model_class: "local", finish_reason: "stop", cost_usd: 0, received_ms: 180 },
    ]);
    expect(folded.content).toBe("Hello");
    expect(folded.model_class).toBe("local");
    expect(folded.finish_reason).toBe("stop");
    expect(folded).not.toHaveProperty("received_ms");
    expect(folded.stream).toEqual({
      started: true,
      cachedStart: false,
      deltas: 2,
      done: true,
      error: null,
      firstDeltaMs: 150,
      lastEventMs: 180,
    });
  });

  it("reports an error event as an interrupted answer", () => {
    const folded = foldStream([
      { event: "start", id: "a", model: "m", provider: "gemini", cached: false },
      { event: "delta", content: "partial" },
      { event: "error", code: "provider_unavailable", detail: "stream went silent for 30s", status: 502 },
    ]);
    expect(folded.stream.done).toBe(false);
    expect(folded.stream.error).toBe("provider_unavailable: stream went silent for 30s");
    expect(folded.content).toBe("partial");
  });

  it("marks a replayed cache hit", () => {
    const folded = foldStream([
      { event: "start", id: "a", model: "m", provider: "ollama", cached: true },
      { event: "delta", content: "whole answer" },
      { event: "done", id: "a", cached: true },
    ]);
    expect(folded.stream.cachedStart).toBe(true);
    expect(folded.stream.deltas).toBe(1);
  });
});

describe("responseBody", () => {
  it("uses the problem body of a stream rejected before it started", () => {
    const body = responseBody(exchange({ statusCode: 422, responseJson: { code: "invalid_model_choice" } }));
    expect(body.code).toBe("invalid_model_choice");
  });

  it("folds the events of a stream that started", () => {
    const body = responseBody(exchange({ events: [{ event: "delta", content: "x" }] }));
    expect(body.content).toBe("x");
  });

  it("is empty for a non-object body", () => {
    expect(responseBody(exchange({ isStream: false, responseJson: [1, 2] }))).toEqual({});
  });
});
