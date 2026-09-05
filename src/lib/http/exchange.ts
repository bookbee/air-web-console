/**
 * The shape every proxied call returns to the browser, and the pure helpers
 * for displaying it — masking secrets, rendering it as cURL. The actual
 * network call happens server-side (see `proxy.ts`); this module is
 * isomorphic so the response pane can compute cURL/masking client-side
 * from the `Exchange` JSON it already has.
 */

export const SECRET_HEADERS = new Set([
  "x-api-key",
  "authorization",
  "cookie",
  "proxy-authorization",
]);

export const MASK = "••••••••";

export interface SseEvent {
  event?: string;
  [key: string]: unknown;
}

export interface Exchange {
  method: string;
  url: string;
  requestHeaders: Record<string, string>;
  requestBody: unknown;
  statusCode: number | null;
  reason: string;
  responseHeaders: Record<string, string>;
  responseJson: unknown;
  responseText: string;
  elapsedMs: number;
  error: string | null;
  /** True for an exchange made against the streaming (SSE) transport.
   * `responseJson` is always null on one of these — the events are the
   * body — see `events` instead. */
  isStream: boolean;
  events: SseEvent[];
}

export function exchangeOk(exchange: Exchange): boolean {
  return exchange.error === null && exchange.statusCode !== null && exchange.statusCode < 400;
}

/** Prefer the body's own request_id; fall back to the X-Request-ID header. */
export function exchangeRequestId(exchange: Exchange): string | null {
  const body = exchange.responseJson;
  if (body && typeof body === "object" && "request_id" in body) {
    const value = (body as Record<string, unknown>).request_id;
    if (typeof value === "string" && value) return value;
  }
  for (const [name, value] of Object.entries(exchange.responseHeaders)) {
    if (name.toLowerCase() === "x-request-id" && value) return value;
  }
  return null;
}

/** Service-reported latency, which excludes the network hop the BFF added. */
export function exchangeServerLatencyMs(exchange: Exchange): number | null {
  const body = exchange.responseJson;
  if (body && typeof body === "object" && "latency_ms" in body) {
    const value = (body as Record<string, unknown>).latency_ms;
    if (typeof value === "number") return value;
  }
  return null;
}

/** Copy of `headers` with secrets masked, for anything shown on screen. */
export function displayHeaders(
  headers: Record<string, string>,
  reveal = false,
): Record<string, string> {
  if (reveal) return { ...headers };
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    out[name] = SECRET_HEADERS.has(name.toLowerCase()) && value ? MASK : value;
  }
  return out;
}

export function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function shellQuote(value: string): string {
  // POSIX single-quote escaping: close, escape the quote, reopen.
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Render the exchange as a runnable cURL command. Secrets are masked by
 * default so the snippet can be pasted into a ticket. */
export function toCurl(exchange: Exchange, revealSecrets = false): string {
  const parts = [`curl -X ${exchange.method}`];
  if (exchange.isStream) {
    // Disables curl's own output buffering, so frames print as they arrive.
    parts.push("-N");
  }
  parts.push(shellQuote(exchange.url));
  for (const [name, value] of Object.entries(displayHeaders(exchange.requestHeaders, revealSecrets))) {
    parts.push(`-H ${shellQuote(`${name}: ${value}`)}`);
  }
  if (exchange.requestBody !== null && exchange.requestBody !== undefined) {
    const body = JSON.stringify(exchange.requestBody, null, 2);
    parts.push(`-d ${shellQuote(body)}`);
  }
  return parts.join(" \\\n  ");
}
