/**
 * Shared handler behind the three catch-all proxy routes
 * (`/api/classifier/**`, `/api/orchestrator/**`, `/api/llm/**`). Each route.ts
 * is a two-line wrapper around this — every tab's request goes through the
 * same one transport, whichever service it targets.
 *
 * The connection is resolved entirely server-side: the client names a
 * *target* (and, for air-orchestrator-service, a *channel*) — never a base URL or key
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
 *
 * A stream asked for live (`X-Stream-Mode: live`, see `lib/http/live.ts`)
 * answers NDJSON instead: each frame as it arrives, then that same Exchange.
 */
import { NextResponse, type NextRequest } from "next/server";

import { assertGatewayAuthorized } from "@/lib/auth/gatewayAuth";
import { loadDefaults, resolveService, type OrchestratorChannel, type ServiceKind } from "@/lib/config";
import { displayHeaders, type Exchange } from "@/lib/http/exchange";
import {
  encodeLiveLine,
  LIVE_CONTENT_TYPE,
  LIVE_STREAM_HEADER,
  LIVE_STREAM_VALUE,
  type LiveLine,
} from "@/lib/http/live";
import { forwardRequest, forwardStreamRequest, type ForwardOptions } from "@/lib/http/proxy";

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

/** The upstream key was needed to make the call; it must not ride back to
 * the browser inside the Exchange. Masked here, server-side, not left to the
 * response pane's display helpers. */
function masked(exchange: Exchange): Exchange {
  return { ...exchange, requestHeaders: displayHeaders(exchange.requestHeaders) };
}

/** The live transport: frames go out as the upstream sends them. If the
 * browser goes away, the upstream call is aborted, so the service stops
 * generating instead of finishing an answer nobody reads. */
function liveStream(request: NextRequest, options: ForwardOptions): Response {
  const encoder = new TextEncoder();
  const abort = new AbortController();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (line: LiveLine) => {
        try {
          controller.enqueue(encoder.encode(encodeLiveLine(line)));
        } catch {
          // The browser already closed the stream; the abort below handles it.
        }
      };
      const exchange = await forwardStreamRequest({
        ...options,
        signal: AbortSignal.any([request.signal, abort.signal]),
        onEvent: (frame) => send({ frame }),
      });
      send({ exchange: masked(exchange) });
      try {
        controller.close();
      } catch {
        // Already cancelled.
      }
    },
    cancel() {
      abort.abort();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": LIVE_CONTENT_TYPE,
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function handleServiceProxy(
  request: NextRequest,
  pathSegments: string[],
  service: ServiceKind,
): Promise<NextResponse<Exchange> | NextResponse | Response> {
  const unauthorized = assertGatewayAuthorized(request);
  if (unauthorized) return unauthorized;

  const targetName = (request.headers.get("x-target-name") ?? "").trim().toLowerCase();
  const channelHeader = request.headers.get("x-target-channel");
  const channel: OrchestratorChannel | undefined =
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
  const options: ForwardOptions = { method: request.method, url, apiKey, timeoutSeconds, verifyTls, body };
  if (wantsStream && request.headers.get(LIVE_STREAM_HEADER) === LIVE_STREAM_VALUE) {
    return liveStream(request, options);
  }
  const transport = wantsStream ? forwardStreamRequest : forwardRequest;
  return NextResponse.json(masked(await transport(options)));
}
