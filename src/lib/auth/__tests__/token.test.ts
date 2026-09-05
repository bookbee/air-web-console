import { describe, expect, it } from "vitest";

import { parseBearerToken, tokensMatch } from "../token";

describe("parseBearerToken", () => {
  it("extracts the token from a well-formed Bearer header", () => {
    expect(parseBearerToken("Bearer abc123")).toBe("abc123");
  });

  it("is case-insensitive on the scheme", () => {
    expect(parseBearerToken("bearer abc123")).toBe("abc123");
    expect(parseBearerToken("BEARER abc123")).toBe("abc123");
  });

  it("returns null for a missing header", () => {
    expect(parseBearerToken(null)).toBeNull();
  });

  it("returns null for the wrong scheme", () => {
    expect(parseBearerToken("Basic abc123")).toBeNull();
  });

  it("returns null when there is no token after the scheme", () => {
    expect(parseBearerToken("Bearer")).toBeNull();
    expect(parseBearerToken("Bearer ")).toBeNull();
  });
});

describe("tokensMatch", () => {
  it("is true for identical tokens", () => {
    expect(tokensMatch("same-token", "same-token")).toBe(true);
  });

  it("is false for different tokens of the same length", () => {
    expect(tokensMatch("aaaaaaaa", "bbbbbbbb")).toBe(false);
  });

  it("is false for tokens of different lengths, without throwing", () => {
    expect(tokensMatch("short", "a-much-longer-token")).toBe(false);
  });

  it("is false against an empty string", () => {
    expect(tokensMatch("", "non-empty")).toBe(false);
  });
});
