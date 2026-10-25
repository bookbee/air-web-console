/**
 * The live wire between this console's BFF and its browser, for a stream
 * the browser wants rendered as it arrives (the Model Gateway tab's
 * `stream: true` with "live" ticked).
 *
 * The BFF still speaks real SSE to the service. Towards the browser it sends
 * NDJSON, one JSON object per line: a `{frame}` per SSE event the moment the
 * BFF reads it, then exactly one `{exchange}`, the finished, key-masked
 * Exchange the collected transport would have returned. So history, cURL and
 * the summary see the same Exchange either way, and only the wait changes.
 * NDJSON rather than re-emitted SSE because the last line has to carry that
 * whole Exchange, and because response compression leaves
 * `application/x-ndjson` alone, where it would buffer `text/event-stream`.
 *
 * Isomorphic and dependency-free, so it is unit-tested alongside.
 */

import type { Exchange, SseEvent } from "./exchange";

/** Request header (with `Accept: text/event-stream`) that asks for this wire. */
export const LIVE_STREAM_HEADER = "X-Stream-Mode";
export const LIVE_STREAM_VALUE = "live";
export const LIVE_CONTENT_TYPE = "application/x-ndjson";

export type LiveLine = { frame: SseEvent } | { exchange: Exchange };

export function encodeLiveLine(line: LiveLine): string {
  return `${JSON.stringify(line)}\n`;
}

/** Read a live body to its end: `onFrame` for each frame as it arrives, then
 * the closing Exchange, or null if the body ended without one (the BFF died
 * or the connection dropped mid-stream). */
export async function readLiveBody(
  body: ReadableStream<Uint8Array>,
  onFrame: (frame: SseEvent) => void,
): Promise<Exchange | null> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let exchange: Exchange | null = null;
  const take = (text: string) => {
    if (!text.trim()) return;
    const line = JSON.parse(text) as LiveLine;
    if ("frame" in line) onFrame(line.frame);
    else exchange = line.exchange;
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    lines.forEach(take);
  }
  take(buffer + decoder.decode());
  return exchange;
}
