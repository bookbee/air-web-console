/**
 * Gates every `/api/**` route behind the gateway's own bearer token — the
 * "independent web client authenticates to the API gateway" leg of the
 * integration this console simulates.
 *
 * This token is deliberately **not** the same kind of secret as an
 * upstream air-* API key. It's baked into the browser bundle at build time
 * (`NEXT_PUBLIC_AIR_WEB_GATEWAY_TOKEN`) — the realistic "client identifier
 * a public web app ships with" pattern (the same role a Stripe publishable
 * key plays): it gates this gateway's front door and demonstrates the auth
 * step, but it never grants access to an upstream credential directly, and
 * it is not expected to resist someone who has the app's own bundle.
 * Upstream air-classifier/air-platform/air-llm keys never leave the server
 * — see `resolveService()` in `config.ts`.
 *
 * The actual token parsing/comparison lives in `token.ts`, which has no
 * `server-only` guard and is unit-tested directly; this module is the thin,
 * `server-only` wrapper around `NextRequest`/`NextResponse`.
 */
import "server-only";

import { NextResponse, type NextRequest } from "next/server";

import { parseBearerToken, tokensMatch } from "./token";

const ENV_VAR = "AIR_WEB__GATEWAY_TOKEN";

function unauthorized(detail: string): NextResponse {
  return NextResponse.json(
    {
      type: "https://air-web-console.dev/errors/unauthorized",
      title: "Unauthorized",
      status: 401,
      detail,
    },
    { status: 401 },
  );
}

/** Returns a 401 `NextResponse` to short-circuit the caller with, or `null`
 * to continue. An unconfigured server-side token fails closed — a missing
 * `AIR_WEB__GATEWAY_TOKEN` is a misconfiguration, never an implicit
 * "allow everyone." */
export function assertGatewayAuthorized(request: NextRequest): NextResponse | null {
  const expected = process.env[ENV_VAR]?.trim();
  if (!expected) {
    return unauthorized("The gateway is not configured with an access token.");
  }

  const token = parseBearerToken(request.headers.get("authorization"));
  if (!token) {
    return unauthorized("Missing bearer token.");
  }

  if (!tokensMatch(token, expected)) {
    return unauthorized("Invalid bearer token.");
  }

  return null;
}
