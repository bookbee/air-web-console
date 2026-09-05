/**
 * The transport layer: one request in, one fully-described Exchange out.
 * Every catch-all proxy route (`/api/classifier/**`, `/api/orchestrator/**`,
 * `/api/llm/**`) forwards
 * through `forwardRequest`/`forwardStreamRequest` below, so the response
 * pane never has to know which route produced an `Exchange`.
 *
 * Network failures are captured as an `Exchange` with an `error` rather than
 * thrown: a refused connection is an ordinary, expected result when the
 * service under test is also mid-development.
 */
import "server-only";

import { randomUUID } from "node:crypto";
import { Agent, fetch as undiciFetch } from "undici";

import type { Exchange, SseEvent } from "./exchange";

export interface ForwardOptions {
  method: string;
  url: string;
  apiKey: string;
  timeoutSeconds: number;
  verifyTls: boolean;
  body?: unknown;
}

function buildHeaders(apiKey: string, accept: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: accept,
  };
  if (apiKey.trim()) headers["X-API-Key"] = apiKey.trim();
  headers["X-Request-ID"] = `web_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
  return headers;
}

function dispatcherFor(verifyTls: boolean): Agent | undefined {
  return verifyTls ? undefined : new Agent({ connect: { rejectUnauthorized: false } });
}

function connectErrorMessage(url: string): string {
  return `Could not connect to ${url}. Is the service running, and is the base URL right?`;
}

/** A single JSON request/response round trip. */
export async function forwardRequest(options: ForwardOptions): Promise<Exchange> {
  const headers = buildHeaders(options.apiKey, "application/json");
  const requestBody = options.body !== undefined ? options.body : null;
  const exchange: Exchange = {
    method: options.method.toUpperCase(),
    url: options.url,
    requestHeaders: headers,
    requestBody,
    statusCode: null,
    reason: "",
    responseHeaders: {},
    responseJson: null,
    responseText: "",
    elapsedMs: 0,
    error: null,
    isStream: false,
    events: [],
  };

  const started = performance.now();
  try {
    const response = await undiciFetch(options.url, {
      method: options.method.toUpperCase(),
      headers,
      body: requestBody !== null ? JSON.stringify(requestBody) : undefined,
      signal: AbortSignal.timeout(options.timeoutSeconds * 1000),
      dispatcher: dispatcherFor(options.verifyTls),
    });
    exchange.elapsedMs = performance.now() - started;
    exchange.statusCode = response.status;
    exchange.reason = response.statusText;
    response.headers.forEach((value, name) => {
      exchange.responseHeaders[name] = value;
    });
    const text = await response.text();
    exchange.responseText = text;
    try {
      exchange.responseJson = text ? JSON.parse(text) : null;
    } catch {
      exchange.responseJson = null;
    }
  } catch (error) {
    exchange.elapsedMs = performance.now() - started;
    exchange.error = describeError(error, options.url, options.timeoutSeconds);
  }
  return exchange;
}

function describeError(error: unknown, url: string, timeoutSeconds: number): string {
  if (error instanceof Error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      return `Timed out after ${timeoutSeconds.toFixed(0)}s. Raise the timeout in the sidebar, or narrow the request.`;
    }
    if (error.cause && typeof error.cause === "object" && "code" in error.cause) {
      return connectErrorMessage(url);
    }
    return `${error.name}: ${error.message}`;
  }
  return connectErrorMessage(url);
}

/** Decode `event:`/`data:` SSE frames per the minimum spec: blocks separated
 * by a blank line, multiple `data:` lines in one block joined by `\n`. A
 * bare `:` line (a heartbeat) is ignored. Ported from `_iter_sse_frames`. */
function parseSseFrames(raw: string): SseEvent[] {
  const events: SseEvent[] = [];
  let eventName = "";
  let dataLines: string[] = [];

  const flush = () => {
    if (dataLines.length === 0) return;
    try {
      const payload = JSON.parse(dataLines.join("\n"));
      if (payload && typeof payload === "object" && !Array.isArray(payload)) {
        events.push({
          ...(payload as Record<string, unknown>),
          event: payload.event ?? (eventName || "message"),
        });
      }
    } catch {
      // Malformed frame — drop it, same as the Python parser does.
    }
    eventName = "";
    dataLines = [];
  };

  for (const line of raw.split("\n")) {
    if (line === "" || line === "\r") {
      flush();
    } else if (line.startsWith(":")) {
      continue;
    } else if (line.startsWith("event:")) {
      eventName = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trim());
    }
  }
  flush();
  return events;
}

/** Perform the call as a real SSE request and collect every frame into one
 * Exchange once the stream closes. Collected rather than piped live to the
 * browser: this exercises the real wire mechanics (the Accept header, one
 * long-lived stream, event:/data: framing) without needing incremental-
 * render plumbing the response pane doesn't have. */
export async function forwardStreamRequest(options: ForwardOptions): Promise<Exchange> {
  const headers = buildHeaders(options.apiKey, "text/event-stream");
  const requestBody = options.body !== undefined ? options.body : null;
  const exchange: Exchange = {
    method: options.method.toUpperCase(),
    url: options.url,
    requestHeaders: headers,
    requestBody,
    statusCode: null,
    reason: "",
    responseHeaders: {},
    responseJson: null,
    responseText: "",
    elapsedMs: 0,
    error: null,
    isStream: true,
    events: [],
  };

  const started = performance.now();
  try {
    const response = await undiciFetch(options.url, {
      method: options.method.toUpperCase(),
      headers,
      body: requestBody !== null ? JSON.stringify(requestBody) : undefined,
      signal: AbortSignal.timeout(options.timeoutSeconds * 1000),
      dispatcher: dispatcherFor(options.verifyTls),
    });
    exchange.statusCode = response.status;
    exchange.reason = response.statusText;
    response.headers.forEach((value, name) => {
      exchange.responseHeaders[name] = value;
    });
    const raw = await response.text();
    exchange.elapsedMs = performance.now() - started;
    exchange.events = parseSseFrames(raw);
    exchange.responseText = exchange.events
      .map((event) => `event: ${event.event}\ndata: ${JSON.stringify(event)}\n`)
      .join("\n");
  } catch (error) {
    exchange.elapsedMs = performance.now() - started;
    exchange.error = describeError(error, options.url, options.timeoutSeconds);
  }
  return exchange;
}
