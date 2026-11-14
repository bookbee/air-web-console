import { describe, expect, it } from "vitest";

import { describeCustomer, parseMode, type CustomerTokenClaims } from "../customerTokenModes";

const NOW = Date.UTC(2026, 10, 14, 18, 0, 0);
const claims = (overrides: Partial<CustomerTokenClaims> = {}): CustomerTokenClaims => ({
  sub: "cust_1001",
  tenant: "brightcart",
  issuer: "air-web-console-dev",
  kid: "brightcart-dev-1",
  expiresAt: new Date(NOW + 10 * 60_000).toISOString(),
  mode: "valid",
  ...overrides,
});

describe("describeCustomer", () => {
  it("says anonymous when no token was sent", () => {
    expect(describeCustomer(undefined, NOW)).toBe("as an anonymous customer");
  });

  it("names the customer and the expiry, never the token", () => {
    expect(describeCustomer(claims(), NOW)).toBe("as customer cust_1001 (token minted by the console, expires in 10 min)");
  });

  it("states a test mode and an already-expired token", () => {
    expect(describeCustomer(claims({ mode: "expired", expiresAt: new Date(NOW - 10 * 60_000).toISOString() }), NOW)).toBe(
      "as customer cust_1001 (token minted by the console, expired 10 min ago, test mode: expired)",
    );
    expect(describeCustomer(claims({ mode: "wrong-tenant" }), NOW)).toMatch(/test mode: wrong tenant\)$/);
  });
});

describe("parseMode", () => {
  it("accepts only the fixed modes; anything else is valid", () => {
    expect(["expired", "wrong-tenant", "tampered", "valid"].map(parseMode)).toEqual(["expired", "wrong-tenant", "tampered", "valid"]);
    expect([null, undefined, "", "admin", "EXPIRED"].map(parseMode)).toEqual(["valid", "valid", "valid", "valid", "valid"]);
  });
});
