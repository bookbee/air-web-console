import { describe, expect, it } from "vitest";

import { parseJsonArray, parseJsonObject } from "../validators";

describe("parseJsonObject", () => {
  it("treats a blank string as omitted, not an error", () => {
    expect(parseJsonObject("", "context")).toEqual({ value: null, error: null });
    expect(parseJsonObject("   ", "context")).toEqual({ value: null, error: null });
  });

  it("parses a valid JSON object", () => {
    expect(parseJsonObject('{"locale":"en-GB"}', "context")).toEqual({
      value: { locale: "en-GB" },
      error: null,
    });
  });

  it("rejects invalid JSON with a labeled message", () => {
    const result = parseJsonObject("{not json", "context");
    expect(result.value).toBeNull();
    expect(result.error).toContain("context is not valid JSON");
  });

  it("rejects a JSON array or scalar — must be an object", () => {
    expect(parseJsonObject("[1,2,3]", "context").error).toContain("must be a JSON object");
    expect(parseJsonObject("42", "context").error).toContain("must be a JSON object");
    expect(parseJsonObject("null", "context").error).toContain("must be a JSON object");
  });
});

describe("parseJsonArray", () => {
  it("treats a blank string as omitted", () => {
    expect(parseJsonArray("", "items")).toEqual({ value: null, error: null });
  });

  it("parses a valid JSON array", () => {
    expect(parseJsonArray('[{"text":"hi"}]', "items")).toEqual({
      value: [{ text: "hi" }],
      error: null,
    });
  });

  it("rejects a non-array value", () => {
    expect(parseJsonArray("{}", "items").error).toContain("must be a JSON array");
  });
});
