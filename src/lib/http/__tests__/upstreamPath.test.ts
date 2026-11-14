import { describe, expect, it } from "vitest";

import { upstreamPath } from "../upstreamPath";

describe("upstreamPath", () => {
  it("joins ordinary AIR route segments unchanged", () => {
    expect(upstreamPath(["v1", "classify", "batch"])).toBe("/v1/classify/batch");
    expect(upstreamPath(["v1", "sessions", "sess_6f8c4889d64f"])).toBe("/v1/sessions/sess_6f8c4889d64f");
  });

  it.each([
    [["..", "admin"]],
    [["v1", "."]],
    [["../../admin"]], // what Next hands over for `..%2F..%2Fadmin`
    [["v1", "a\\..\\b"]],
    [["%2e%2e", "admin"]], // double-encoded dot-segment
    [["v1", "x%252Fy"]],
    [["v1", "a\r\nX-API-Key: x"]],
    [["v1", ""]],
  ])("refuses %j", (segments) => {
    expect(upstreamPath(segments)).toBeNull();
  });

  it("percent-encodes characters that would change the URL's meaning", () => {
    expect(upstreamPath(["v1", "a?b#c"])).toBe("/v1/a%3Fb%23c");
  });
});
