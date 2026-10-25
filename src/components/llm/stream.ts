/**
 * air-model-gateway's `/v1/generate` stream, folded back into the shape a
 * non-streamed answer has, so the summary and the scenario checks read
 * either identically. Pure, so it is unit-tested alongside.
 *
 * The wire (integration guide §4): one `start` (StreamStart), `delta`s whose
 * `content` concatenates to the answer, then `done` (GenerateSummary: every
 * GenerateOutput field but `content`) or `error` (a problem body) if the
 * stream failed after it started.
 */

import type { Exchange, SseEvent } from "@/lib/http/exchange";

export interface StreamFacts {
  started: boolean;
  cachedStart: boolean;
  deltas: number;
  done: boolean;
  /** The `error` event's `code: detail`, when the stream was interrupted. */
  error: string | null;
  /** When the BFF saw the first delta / the last frame, ms since sending. */
  firstDeltaMs: number | null;
  lastEventMs: number | null;
}

const FRAME_KEYS = new Set(["event", "received_ms"]);

/** Strip the frame-only keys, leaving the event's own JSON. */
function payloadOf(event: SseEvent): Record<string, unknown> {
  return Object.fromEntries(Object.entries(event).filter(([key]) => !FRAME_KEYS.has(key)));
}

export function foldStream(events: readonly SseEvent[]): Record<string, unknown> & { stream: StreamFacts } {
  const facts: StreamFacts = {
    started: false,
    cachedStart: false,
    deltas: 0,
    done: false,
    error: null,
    firstDeltaMs: null,
    lastEventMs: null,
  };
  let folded: Record<string, unknown> = {};
  let content = "";
  for (const event of events) {
    if (typeof event.received_ms === "number") facts.lastEventMs = event.received_ms;
    const data = payloadOf(event);
    switch (event.event) {
      case "start":
        facts.started = true;
        facts.cachedStart = data.cached === true;
        folded = { ...data, ...folded };
        break;
      case "delta":
        facts.deltas += 1;
        if (facts.firstDeltaMs === null && typeof event.received_ms === "number") facts.firstDeltaMs = event.received_ms;
        if (typeof data.content === "string") content += data.content;
        break;
      case "done":
        facts.done = true;
        folded = { ...folded, ...data };
        break;
      case "error":
        facts.error = `${String(data.code ?? "error")}: ${String(data.detail ?? "")}`;
        folded = { ...folded, problem: data };
        break;
    }
  }
  return { ...folded, content, stream: facts };
}

/** The body to judge or summarise: the JSON answer, or a stream folded into
 * one. A stream rejected before it started is plain problem+json. */
export function responseBody(exchange: Exchange): Record<string, unknown> {
  if (exchange.isStream && exchange.events.length > 0) return foldStream(exchange.events);
  const body = exchange.responseJson;
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}
