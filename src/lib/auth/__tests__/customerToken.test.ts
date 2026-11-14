// @vitest-environment node
import { generateKeyPairSync } from "node:crypto";

import { decodeJwt, decodeProtectedHeader, errors, jwtVerify } from "jose";
import { describe, expect, it } from "vitest";

import {
  clampTtl,
  decodeClaimsForDisplay,
  mintCustomerToken,
  resolveCustomerToken,
  TOKEN_AUDIENCE,
  type CustomerTokenConfig,
  type CustomerTokenFields,
} from "../customerToken";

const pair = generateKeyPairSync("ec", { namedCurve: "P-256" });
const PEM = String(pair.privateKey.export({ type: "pkcs8", format: "pem" }));
/** As it sits in .env: one line, literal \n. */
const PEM_ONE_LINE = PEM.trim().replace(/\n/g, "\\n");

const FIELDS: CustomerTokenFields = {
  privateKey: PEM_ONE_LINE,
  kid: "brightcart-dev-1",
  issuer: "air-web-console-dev",
  tenant: "brightcart",
  ttlSeconds: "600",
  subjects: "cust_1001, cust_1002",
};

function config(overrides: CustomerTokenFields = {}): CustomerTokenConfig {
  const resolved = resolveCustomerToken({ ...FIELDS, ...overrides });
  if (resolved.kind !== "configured") throw new Error(`not configured: ${JSON.stringify(resolved)}`);
  return resolved.config;
}

const verify = (token: string) =>
  jwtVerify(token, pair.publicKey, { algorithms: ["ES256"], audience: TOKEN_AUDIENCE, issuer: "air-web-console-dev" });

describe("minting", () => {
  it("verifies with the matching public key, with exactly the spec 0014 header and claims", async () => {
    const now = Date.UTC(2026, 10, 14, 10, 0, 0);
    const token = await mintCustomerToken(config(), "cust_1001", now);
    expect(token.split(".")).toHaveLength(3);
    expect(decodeProtectedHeader(token)).toEqual({ alg: "ES256", typ: "air-customer+jwt", kid: "brightcart-dev-1" });

    const claims = decodeJwt(token);
    expect(Object.keys(claims).sort()).toEqual(["air_tenant", "aud", "exp", "iat", "iss", "jti", "sub"]);
    expect(claims).toMatchObject({
      iss: "air-web-console-dev",
      aud: "air-orchestrator-service",
      sub: "cust_1001",
      air_tenant: "brightcart",
      iat: now / 1000,
    });
    expect(claims.exp! - claims.iat!).toBe(600);
    expect(claims.jti).toMatch(/^[0-9a-f]{32}$/);

    const { payload } = await verify(await mintCustomerToken(config(), "cust_1001"));
    expect(payload.sub).toBe("cust_1001");
  });

  it("gives every token a fresh jti", async () => {
    const [a, b] = await Promise.all([mintCustomerToken(config(), "cust_1001"), mintCustomerToken(config(), "cust_1001")]);
    expect(decodeJwt(a).jti).not.toBe(decodeJwt(b).jti);
  });

  it("refuses a subject the target doesn't list", async () => {
    await expect(mintCustomerToken(config(), "cust_9999")).rejects.toThrow(/not configured/);
  });

  it("decodes only display claims", async () => {
    const token = await mintCustomerToken(config(), "cust_1002");
    expect(decodeClaimsForDisplay(token)).toMatchObject({ sub: "cust_1002", air_tenant: "brightcart", iss: "air-web-console-dev", kid: "brightcart-dev-1" });
  });
});

describe("TTL", () => {
  it("is clamped to [60, 900] and defaults to 600", async () => {
    expect([clampTtl("5"), clampTtl("60"), clampTtl("900"), clampTtl("3600"), clampTtl(undefined), clampTtl("x")]).toEqual([60, 60, 900, 900, 600, 600]);
    const claims = decodeJwt(await mintCustomerToken(config({ ttlSeconds: "86400" }), "cust_1001"));
    expect(claims.exp! - claims.iat!).toBe(900);
  });
});

describe("a half-configured target", () => {
  it("is absent when nothing is set", () => {
    expect(resolveCustomerToken({})).toEqual({ kind: "absent" });
    expect(resolveCustomerToken({ kid: "  " })).toEqual({ kind: "absent" });
  });

  it("is an error, naming fields and never values, when anything required is missing", () => {
    const noSubjects = resolveCustomerToken({ ...FIELDS, subjects: "" });
    expect(noSubjects).toMatchObject({ kind: "error" });
    expect(noSubjects.kind === "error" && noSubjects.error).toMatch(/SUBJECTS/);
    const onlyKey = resolveCustomerToken({ privateKey: PEM_ONE_LINE });
    expect(onlyKey.kind === "error" && onlyKey.error).toMatch(/KID.*ISSUER.*TENANT.*SUBJECTS/);
    expect(JSON.stringify(onlyKey)).not.toContain("BEGIN");
  });

  it("rejects a key that isn't P-256, a public key, junk, and a bad subject", () => {
    const p384 = String(generateKeyPairSync("ec", { namedCurve: "P-384" }).privateKey.export({ type: "pkcs8", format: "pem" }));
    const rsa = String(generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }));
    const publicPem = String(pair.publicKey.export({ type: "spki", format: "pem" }));
    for (const privateKey of [p384, rsa, publicPem, "not a key"]) {
      const resolved = resolveCustomerToken({ ...FIELDS, privateKey });
      expect(resolved.kind, privateKey.slice(0, 30)).toBe("error");
      expect(JSON.stringify(resolved)).not.toContain("BEGIN");
    }
    expect(resolveCustomerToken({ ...FIELDS, subjects: "cust_1001,bad subject!" })).toMatchObject({ kind: "error" });
  });
});

describe("SIT test modes", () => {
  it("expired fails verification with an expiry error", async () => {
    const token = await mintCustomerToken(config(), "cust_1001", Date.now(), "expired");
    const claims = decodeJwt(token);
    expect(claims.exp! - claims.iat!).toBe(600);
    await expect(verify(token)).rejects.toBeInstanceOf(errors.JWTExpired);
  });

  it("wrong tenant signs for othershop", async () => {
    const { payload } = await verify(await mintCustomerToken(config(), "cust_1001", Date.now(), "wrong-tenant"));
    expect(payload.air_tenant).toBe("othershop");
  });

  it("tampered keeps a well-formed payload but fails the signature", async () => {
    const token = await mintCustomerToken(config(), "cust_1001", Date.now(), "tampered");
    expect(decodeJwt(token).sub).toBe("cust_1001");
    await expect(verify(token)).rejects.toBeInstanceOf(errors.JWSSignatureVerificationFailed);
  });
});
