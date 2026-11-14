#!/usr/bin/env node
/**
 * Generate an ES256 (ECDSA P-256) key pair for a target's development
 * customer token (air-orchestrator-service spec 0014).
 *
 *   make customer-token-key                 # kid brightcart-dev-1
 *   KID=othershop-dev-1 make customer-token-key
 *
 * Prints three things:
 *   1. the PRIVATE key, PKCS#8 PEM escaped onto one line, for this console's
 *      .env.local as AIR_WEB__TARGETS__<NAME>__ORCHESTRATOR_CUSTOMER_TOKEN_PRIVATE_KEY;
 *   2. the PUBLIC key as SPKI PEM, and
 *   3. the PUBLIC key as a JWK (kid, alg ES256, use sig),
 * either of which air-orchestrator-service is configured with to verify.
 *
 * The private key never leaves this console's server-side env.
 */
import { generateKeyPairSync } from "node:crypto";

const kid = process.env.KID || process.argv[2] || "brightcart-dev-1";
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });

const privatePem = privateKey.export({ type: "pkcs8", format: "pem" });
const publicPem = publicKey.export({ type: "spki", format: "pem" });
const jwk = { ...publicKey.export({ format: "jwk" }), kid, alg: "ES256", use: "sig" };

process.stdout.write(
  [
    `# kid ${kid}`,
    "",
    "# 1. PRIVATE key: this console's server-side env only (.env.local). Never share it.",
    `ORCHESTRATOR_CUSTOMER_TOKEN_PRIVATE_KEY="${String(privatePem).trim().replace(/\n/g, "\\n")}"`,
    "",
    "# 2. PUBLIC key, SPKI PEM: for air-orchestrator-service",
    String(publicPem).trim(),
    "",
    "# 3. PUBLIC key, JWK: for air-orchestrator-service",
    JSON.stringify(jwk),
    "",
  ].join("\n"),
);
