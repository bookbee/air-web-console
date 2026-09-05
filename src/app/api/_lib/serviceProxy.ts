/**
 * Shared handler behind the three catch-all proxy routes
 * (`/api/classifier/**`, `/api/platform/**`, `/api/llm/**`). Each route.ts
 * is a two-line wrapper around this — every tab's request goes through the
 * same one transport, whichever service it targets.
 *
 * The connection is resolved entirely server-side: the client names a
 * *target* (and, for air-platform, a *channel*) — never a base URL or key
 * — and `resolveService()` (`lib/config.ts`) turns that into the real
 * `{baseUrl, apiKey, verifyTls}` from this server's own `.env`. This is
 * the fix for the earlier design's SSRF hole (a client-supplied base URL
 * that this server would blindly fetch) and credential leak (a
 * client-supplied — and client-visible — API key): the server now only
 * ever calls hosts it configured itself, with keys the browser never sees.
 *
 * Always resolves to a 200 with an `Exchange` JSON body, even for a network
 * failure or a missing base URL — the failure is data for the response pane
 * to render, never an HTTP-level error from this BFF itself. The one
 * exception is gateway auth (401) and target/channel validation (never
 * reached, since unknown values fall back safely) — those are real
 * HTTP-level errors, not `Exchange` data, since they're about *this*
 * server's own front door rather than the upstream call.
 */
import { NextResponse, type NextRequest } from "next/server";

import { assertGatewayAuthorized } from "@/lib/auth/gatewayAuth";
import { loadDefaults, resolveService, type PlatformChannel, type ServiceKind } from "@/lib/config";
import type { Exchange } from "@/lib/http/exchange";
import { forwardRequest, forwardStreamRequest } from "@/lib/http/proxy";

const MIN_TIMEOUT_SECONDS = 1;
const MAX_TIMEOUT_SECONDS = 120;
const DEFAULT_TIMEOUT_SECONDS = 60;

function emptyExchange(method: string, url: string, error: string): Exchange {
  return {
    method: method.toUpperCase(),
    url,
    requestHeaders: {},
    requestBody: null,
    statusCode: null,
    reason: "",
    responseHeaders: {},
    responseJson: null,
    responseText: "",
    elapsedMs: 0,
    error,
    isStream: false,
    events: [],
  };
}

function clampTimeout(raw: string | null): number {
  const parsed = raw ? Number.parseFloat(raw) : DEFAULT_TIMEOUT_SECONDS;
  if (!Number.isFinite(parsed)) return DEFAULT_TIMEOUT_SECONDS;
  return Math.min(MAX_TIMEOUT_SECONDS, Math.max(MIN_TIMEOUT_SECONDS, parsed));
}

export async function handleServiceProxy(
  request: NextRequest,
  pathSegments: string[],
  service: ServiceKind,
): Promise<NextResponse<Exchange> | NextResponse> {
  const unauthorized = assertGatewayAuthorized(request);
  if (unauthorized) return unauthorized;

  const targetName = (request.headers.get("x-target-name") ?? "").trim().toLowerCase();
  const channelHeader = request.headers.get("x-target-channel");
  const channel: PlatformChannel | undefined =
    channelHeader === "business" ? "business" : channelHeader === "customer" ? "customer" : undefined;
  const timeoutSeconds = clampTimeout(request.headers.get("x-target-timeout-seconds"));

  const defaults = loadDefaults();
  const resolvedTargetName = targetName in defaults.targets ? targetName : defaults.selected;
  const { baseUrl, apiKey, verifyTls } = resolveService(defaults, resolvedTargetName, service, channel);

  const path = `/${pathSegments.join("/")}`;
  const search = request.nextUrl.search;

  if (!baseUrl) {
    return NextResponse.json(
      emptyExchange(request.method, path, "No base URL configured for this service on the server."),
    );
  }

  const url = `${baseUrl.replace(/\/+$/, "")}${path}${search}`;

  let body: unknown;
  if (request.method !== "GET" && request.method !== "HEAD") {
    const raw = await request.text();
    if (raw) {
      try {
        body = JSON.parse(raw);
      } catch {
        body = raw;
      }
    }
  }

  const wantsStream = (request.headers.get("accept") ?? "").includes("text/event-stream");
  const transport = wantsStream ? forwardStreamRequest : forwardRequest;

  const exchange = await transport({
    method: request.method,
    url,
    apiKey,
    timeoutSeconds,
    verifyTls,
    body,
  });

  return NextResponse.json(exchange);
}
