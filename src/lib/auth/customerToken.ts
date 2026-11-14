/**
 * The development customer token: a short-lived ES256 JWT this BFF mints,
 * server-side, for every customer-channel request to air-orchestrator-service
 * made "as" a configured customer (air-orchestrator-service spec 0014,
 * `REQ-CTK-002`/`003`). It travels in the `air-token` header beside the
 * channel's `X-API-Key`.
 *
 * The signing key is an upstream credential exactly like an API key: it is
 * read from server-side env, parsed here once per distinct PEM, and never
 * reaches the browser, a response or an `Exchange`. The client only *names* a
 * subject; this module mints only for a subject the target's own config lists.
 */
import "server-only";

import { createPrivateKey, randomBytes, type KeyObject } from "node:crypto";

import { decodeJwt, decodeProtectedHeader, SignJWT } from "jose";

import { CUSTOMER_TOKEN_MODES, type CustomerTokenClaims, type CustomerTokenMode } from "@/lib/customerTokenModes";
import type { CustomerTokenConfig } from "@/lib/types";

export { CUSTOMER_TOKEN_MODES, type CustomerTokenConfig, type CustomerTokenMode };

export const TOKEN_TYPE = "air-customer+jwt";
export const TOKEN_AUDIENCE = "air-orchestrator-service";
export const TOKEN_ALGORITHM = "ES256";
export const SUBJECT_PATTERN = /^[A-Za-z0-9_.:-]{1,128}$/;
export const TTL_MIN_S = 60;
export const TTL_MAX_S = 900;
export const TTL_DEFAULT_S = 600;
/** The tenant the `wrong tenant` test mode signs for. */
export const WRONG_TENANT = "othershop";

/** The six `AIR_WEB__TARGETS__<NAME>__ORCHESTRATOR_CUSTOMER_TOKEN_*` fields,
 * as read from env. */
export interface CustomerTokenFields {
  privateKey?: string;
  kid?: string;
  issuer?: string;
  tenant?: string;
  ttlSeconds?: string;
  subjects?: string;
}

export type CustomerTokenResolution =
  | { kind: "absent" }
  | { kind: "configured"; config: CustomerTokenConfig }
  | { kind: "error"; error: string };

const keys = new Map<string, KeyObject>();

/** `.env` files hold the PEM on one line with literal `\n`s; Docker's
 * `env_file` doesn't expand them, Next's dotenv does. Accept both. */
function normalisePem(raw: string): string {
  return raw.replace(/\\n/g, "\n").trim();
}

/** The P-256 private key for a PEM, parsed once and cached. Throws a message
 * that never contains key material. */
export function signingKey(privateKeyPem: string): KeyObject {
  const cached = keys.get(privateKeyPem);
  if (cached) return cached;
  let key: KeyObject;
  try {
    key = createPrivateKey({ key: normalisePem(privateKeyPem), format: "pem" });
  } catch {
    throw new Error("the private key isn't a PEM private key (PKCS#8 expected)");
  }
  if (key.asymmetricKeyType !== "ec" || key.asymmetricKeyDetails?.namedCurve !== "prime256v1") {
    throw new Error("the private key isn't an EC P-256 key (ES256 needs P-256)");
  }
  keys.set(privateKeyPem, key);
  return key;
}

export function clampTtl(raw: string | undefined): number {
  const parsed = raw && raw.trim() ? Number.parseInt(raw, 10) : TTL_DEFAULT_S;
  const value = Number.isFinite(parsed) ? parsed : TTL_DEFAULT_S;
  return Math.min(TTL_MAX_S, Math.max(TTL_MIN_S, value));
}

/** Resolve a target's fields. Nothing set: absent. Everything required set
 * and the key a P-256 private key: configured. Anything in between is an
 * error, never a silent default; the message names fields, never values. */
export function resolveCustomerToken(fields: CustomerTokenFields): CustomerTokenResolution {
  const present = Object.values(fields).some((v) => v !== undefined && v.trim() !== "");
  if (!present) return { kind: "absent" };

  const subjects = (fields.subjects ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const missing = [
    !fields.privateKey?.trim() && "PRIVATE_KEY",
    !fields.kid?.trim() && "KID",
    !fields.issuer?.trim() && "ISSUER",
    !fields.tenant?.trim() && "TENANT",
    subjects.length === 0 && "SUBJECTS",
  ].filter(Boolean);
  if (missing.length) {
    return { kind: "error", error: `customer token half-configured: missing ORCHESTRATOR_CUSTOMER_TOKEN_${missing.join(", _")}` };
  }
  const bad = subjects.filter((s) => !SUBJECT_PATTERN.test(s));
  if (bad.length) {
    return { kind: "error", error: `customer token SUBJECTS must match ${SUBJECT_PATTERN.source}: ${bad.join(", ")}` };
  }
  try {
    signingKey(fields.privateKey!);
  } catch (error) {
    return { kind: "error", error: `customer token PRIVATE_KEY rejected: ${(error as Error).message}` };
  }
  return {
    kind: "configured",
    config: {
      privateKeyPem: fields.privateKey!,
      kid: fields.kid!.trim(),
      issuer: fields.issuer!.trim(),
      tenant: fields.tenant!.trim(),
      ttlSeconds: clampTtl(fields.ttlSeconds),
      subjects: [...new Set(subjects)],
    },
  };
}

const reported = new Set<string>();

/** Log a target's config error once per process, server-side. */
export function reportConfigError(target: string, error: string): void {
  const line = `[air-web-console] target ${target}: ${error}`;
  if (reported.has(line)) return;
  reported.add(line);
  console.error(line);
}

/** A fresh `jti`: 16 random bytes, hex. */
const freshJti = () => randomBytes(16).toString("hex");

function tamper(token: string): string {
  // Change one payload character after signing: decode, alter the last jti
  // character, re-encode. The JSON stays well-formed, so only the signature
  // check can catch it.
  const [header, payload, signature] = token.split(".");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
  const jti = String(claims.jti);
  claims.jti = `${jti.slice(0, -1)}${jti.endsWith("0") ? "1" : "0"}`;
  return `${header}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.${signature}`;
}

/** Mint one token for `subject`, which the caller has already checked is in
 * `config.subjects`. Never cached or reused: one per proxied request.
 * `mode` is a SIT test mode, applied only where the caller allows them. */
export async function mintCustomerToken(
  config: CustomerTokenConfig,
  subject: string,
  now: number = Date.now(),
  mode: CustomerTokenMode = "valid",
): Promise<string> {
  if (!config.subjects.includes(subject) || !SUBJECT_PATTERN.test(subject)) {
    throw new Error("customer not configured for this target");
  }
  const nowS = Math.floor(now / 1000);
  const iat = mode === "expired" ? nowS - 1200 : nowS;
  const exp = mode === "expired" ? nowS - 600 : nowS + config.ttlSeconds;
  const token = await new SignJWT({ air_tenant: mode === "wrong-tenant" ? WRONG_TENANT : config.tenant })
    .setProtectedHeader({ alg: TOKEN_ALGORITHM, typ: TOKEN_TYPE, kid: config.kid })
    .setIssuer(config.issuer)
    .setAudience(TOKEN_AUDIENCE)
    .setSubject(subject)
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .setJti(freshJti())
    .sign(signingKey(config.privateKeyPem));
  return mode === "tampered" ? tamper(token) : token;
}

/** The token's non-secret claims, for the response pane. Server-side only: it
 * is attached to the `Exchange` instead of the token itself. */
export function decodeClaimsForDisplay(token: string): { sub: string; air_tenant: string; iss: string; kid: string; iat: number; exp: number } {
  const claims = decodeJwt(token);
  const header = decodeProtectedHeader(token);
  return {
    sub: String(claims.sub ?? ""),
    air_tenant: String(claims.air_tenant ?? ""),
    iss: String(claims.iss ?? ""),
    kid: String(header.kid ?? ""),
    iat: Number(claims.iat ?? 0),
    exp: Number(claims.exp ?? 0),
  };
}

/** The display summary the BFF attaches to an `Exchange`. */
export function displayClaims(token: string, mode: CustomerTokenMode): CustomerTokenClaims {
  const c = decodeClaimsForDisplay(token);
  return { sub: c.sub, tenant: c.air_tenant, issuer: c.iss, kid: c.kid, expiresAt: new Date(c.exp * 1000).toISOString(), mode };
}
