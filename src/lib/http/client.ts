/**
 * Client-side entry point into the BFF proxy routes. Every tab calls this
 * instead of `fetch` directly — the one place that knows the route prefix
 * per service and the request-header convention the proxy reads.
 *
 * The browser names a *target* and, for air-platform, a *channel* — never
 * a base URL or API key. `NEXT_PUBLIC_AIR_WEB_GATEWAY_TOKEN` is baked into
 * the bundle at build time and sent as a bearer token on every call: it
 * authenticates this web app to its own gateway (this BFF), the same way a
 * publishable key would, and is unrelated to — and never grants access to
 * — the real upstream air-* API keys, which stay server-side.
 */
"use client";

import type { Connection } from "@/lib/connection";
import type { Exchange } from "@/lib/http/exchange";

const ROUTE_PREFIX: Record<Connection["service"], string> = {
  "air-classifier": "/api/classifier",
  "air-platform": "/api/platform",
  "air-llm": "/api/llm",
};

export interface SendOptions {
  method?: string;
  body?: unknown;
  /** Request the SSE transport (air-platform's turn stream). */
  stream?: boolean;
}

/** Send one request through this service's BFF proxy route. Always
 * resolves to an `Exchange` — network failures, timeouts and missing base
 * URLs all come back as data on it rather than a thrown error. A 401 from
 * the gateway itself (bad/missing bearer token) is the one case that is
 * *not* an `Exchange` — see the `ok` check callers should do first. */
export async function sendViaProxy(
  connection: Connection,
  path: string,
  options: SendOptions = {},
): Promise<Exchange> {
  const prefix = ROUTE_PREFIX[connection.service];
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: options.stream ? "text/event-stream" : "application/json",
    Authorization: `Bearer ${process.env.NEXT_PUBLIC_AIR_WEB_GATEWAY_TOKEN ?? ""}`,
    "X-Target-Name": connection.target,
    "X-Target-Timeout-Seconds": String(connection.timeoutSeconds),
  };
  if (connection.channel) headers["X-Target-Channel"] = connection.channel;

  const response = await fetch(`${prefix}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (response.status === 401) {
    const problem = await response.json().catch(() => ({}));
    return {
      method: (options.method ?? "GET").toUpperCase(),
      url: `${prefix}${path}`,
      requestHeaders: headers,
      requestBody: options.body ?? null,
      statusCode: 401,
      reason: "Unauthorized",
      responseHeaders: {},
      responseJson: problem,
      responseText: JSON.stringify(problem),
      elapsedMs: 0,
      error: null,
      isStream: false,
      events: [],
    };
  }

  return (await response.json()) as Exchange;
}
