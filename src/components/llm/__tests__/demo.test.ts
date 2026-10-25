import { describe, expect, it } from "vitest";

import type { Capabilities } from "../data";
import { chainOutcome, EMBED_PRESETS, GENERATE_PRESETS, presetBlocker, similarityMatrix } from "../demo";

const CAPS: Capabilities = {
  providers: { ollama: true, gemini: true, anthropic: true, openai: false, "llama.cpp": true },
  generate: {
    auto: { allowed: true, available: true, chain: ["ollama:llama3.2:3b", "gemini:gemini-2.5-flash", "anthropic:claude-haiku-4-5"] },
    cloud: { allowed: false, available: true, chain: ["gemini:gemini-2.5-flash", "anthropic:claude-haiku-4-5"] },
  },
  may_pin: false,
};

describe("chainOutcome", () => {
  it("marks the rung that answered, and the ones before it as failover", () => {
    const body = { model_class: "auto", provider: "gemini", model: "gemini-2.5-flash" };
    expect(chainOutcome(CAPS, {}, body)?.map((r) => r.state)).toEqual(["missed", "served", "unused"]);
  });

  it("puts a preferred provider's rungs first, as the gateway does", () => {
    const body = { model_class: "auto", provider: "anthropic", model: "claude-haiku-4-5" };
    const outcome = chainOutcome(CAPS, { provider: "anthropic" }, body);
    expect(outcome?.[0]).toEqual({ rung: "anthropic:claude-haiku-4-5", state: "served" });
  });

  it("shows nothing for a pin, an error, or an answer outside the chain", () => {
    expect(chainOutcome(CAPS, { pin: "x:y" }, { model_class: null, provider: "x", model: "y" })).toBeNull();
    expect(chainOutcome(CAPS, {}, { code: "provider_unavailable" })).toBeNull();
    expect(chainOutcome(CAPS, {}, { model_class: "auto", provider: "openai", model: "gpt-4o" })).toBeNull();
  });
});

describe("presetBlocker", () => {
  it("names why a preset can't work here, and never blocks without capabilities", () => {
    expect(presetBlocker(CAPS, { modelClass: "cloud" })).toMatch(/isn't granted/);
    expect(presetBlocker(CAPS, { pin: true })).toMatch(/may not pin/);
    expect(presetBlocker(CAPS, { provider: "openai" })).toMatch(/isn't configured/);
    expect(presetBlocker(CAPS, { modelClass: "auto" })).toBeNull();
    expect(presetBlocker(null, { pin: true })).toBeNull();
  });
});

describe("presets", () => {
  it("only send fields the gateway's /v1/generate accepts", () => {
    const accepted = new Set(["model", "provider", "pin", "max_tokens", "temperature", "json_schema", "schema_name", "cache", "cache_prefix", "stream"]);
    for (const preset of GENERATE_PRESETS) for (const field of Object.keys(preset.options)) expect(accepted).toContain(field);
  });

  it("never combine pin with model or provider (a 422)", () => {
    for (const { options } of GENERATE_PRESETS) if ("pin" in options) expect("model" in options || "provider" in options).toBe(false);
  });

  it("embed at least two texts, so there is a pair to compare", () => {
    for (const preset of EMBED_PRESETS) expect(preset.input.length).toBeGreaterThanOrEqual(2);
  });
});

describe("similarityMatrix", () => {
  it("is 1 on the diagonal, symmetric, and 0 for orthogonal vectors", () => {
    const m = similarityMatrix([[1, 0], [0, 2], [1, 1]]);
    expect(m[0][0]).toBeCloseTo(1);
    expect(m[0][1]).toBeCloseTo(0);
    expect(m[0][2]).toBeCloseTo(Math.SQRT1_2);
    expect(m[2][0]).toBeCloseTo(m[0][2]);
  });
});
