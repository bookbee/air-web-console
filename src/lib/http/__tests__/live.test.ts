// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { Exchange, SseEvent } from "../exchange";
import { encodeLiveLine, readLiveBody } from "../live";

const EXCHANGE: Exchange = {
  method: "POST",
  url: "http://gw/v1/generate",
  requestHeaders: { "X-API-Key": "••••••••" },
  requestBody: { stream: true },
  statusCode: 200,
  reason: "OK",
  responseHeaders: {},
  responseJson: null,
  responseText: "",
  elapsedMs: 12,
  error: null,
  isStream: true,
  events: [{ event: "start" }, { event: "delta", content: "Hi" }, { event: "done" }],
};

/** A body delivered in the given chunks, as the network might split it. */
function bodyOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

describe("readLiveBody", () => {
  const wire =
    encodeLiveLine({ frame: { event: "start", received_ms: 5 } }) +
    encodeLiveLine({ frame: { event: "delta", content: "Hi\nthere", received_ms: 9 } }) +
    encodeLiveLine({ exchange: EXCHANGE });

  it("hands over each frame in order, then returns the closing Exchange", async () => {
    const frames: SseEvent[] = [];
    const exchange = await readLiveBody(bodyOf([wire]), (frame) => frames.push(frame));
    expect(frames.map((f) => f.event)).toEqual(["start", "delta"]);
    expect(frames[1].content).toBe("Hi\nthere");
    expect(exchange).toEqual(EXCHANGE);
  });

  it("reassembles lines the network split anywhere, even inside a character", async () => {
    const bytes = new TextEncoder().encode(wire.replace("Hi", "Hé"));
    const chunks = Array.from({ length: Math.ceil(bytes.length / 7) }, (_, i) => bytes.slice(i * 7, i * 7 + 7));
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        chunks.forEach((chunk) => controller.enqueue(chunk));
        controller.close();
      },
    });
    const frames: SseEvent[] = [];
    const exchange = await readLiveBody(body, (frame) => frames.push(frame));
    expect(frames[1].content).toBe("Hé\nthere");
    expect(exchange?.statusCode).toBe(200);
  });

  it("returns null when the body ends before the Exchange", async () => {
    const frames: SseEvent[] = [];
    const exchange = await readLiveBody(bodyOf([encodeLiveLine({ frame: { event: "start" } })]), (f) => frames.push(f));
    expect(frames).toHaveLength(1);
    expect(exchange).toBeNull();
  });
});
