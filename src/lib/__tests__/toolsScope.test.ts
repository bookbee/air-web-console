import { describe, expect, it } from "vitest";

import { forwardedIdempotencyKey, toolsScopeFor } from "../toolsScope";

describe("toolsScopeFor", () => {
  it("is execute only for /v1/actions/{name}/execute", () => {
    expect(toolsScopeFor(["v1", "actions", "orders.cancel", "execute"])).toBe("execute");
  });

  it.each([
    [["v1", "actions", "orders.cancel", "propose"]],
    [["v1", "tools", "orders.get"]],
    [["v1", "capabilities"]],
    [["v1", "health"]],
    [["metrics"]],
    [["v1", "actions", "execute"]],
    [["v1", "actions", "orders.cancel", "execute", "extra"]],
    [["v2", "actions", "orders.cancel", "execute"]],
  ])("is read for %j", (segments) => {
    expect(toolsScopeFor(segments)).toBe("read");
  });
});

describe("forwardedIdempotencyKey", () => {
  it("forwards nothing when the client sent nothing", () => {
    expect(forwardedIdempotencyKey(null)).toEqual({});
  });

  it("forwards values the gateway itself must judge, valid or not", () => {
    for (const value of ["console-abc-0123456789", "short", "has/slash-but-visible", ""]) {
      expect(forwardedIdempotencyKey(value)).toEqual({ value });
    }
  });

  it("refuses what could never be a header value it should write", () => {
    expect(forwardedIdempotencyKey("x".repeat(257)).error).toMatch(/over 256/);
    expect(forwardedIdempotencyKey("with space").error).toMatch(/space/);
    expect(forwardedIdempotencyKey("line\r\nX-API-Key: other").error).toMatch(/control/);
    expect(forwardedIdempotencyKey("ключ-ключ-ключ-ключ").error).toMatch(/non-ASCII/);
  });
});
