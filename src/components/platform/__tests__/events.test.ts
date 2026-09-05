import { describe, expect, it } from "vitest";

import { foldEvents } from "../events";

describe("foldEvents", () => {
  it("reassembles a turn-lifecycle SSE stream into a TurnResult-shaped object", () => {
    const folded = foldEvents([
      { event: "turn.start", session_id: "s-1", channel: "customer" },
      { event: "stage", stage: "guardrails_in", status: "ok", latency_ms: 1 },
      { event: "route", routes: ["direct"], reason: "only route" },
      { event: "citation", citation: { title: "Doc 1" } },
      { event: "answer", text: "hello", structured: null, grounded: true, refusal: false },
      { event: "usage", usage: { total_tokens: 10, cost_usd: 0.001 } },
      { event: "turn.end", status: "ok", latency_ms: 5 },
    ]);

    expect(folded.session_id).toBe("s-1");
    expect(folded.routes).toEqual(["direct"]);
    expect(folded.answer).toBe("hello");
    expect(folded.grounded).toBe(true);
    expect(folded.status).toBe("ok");
    expect(folded.citations).toEqual([{ title: "Doc 1" }]);
    expect(folded.trace).toEqual([
      { stage: "guardrails_in", status: "ok", latency_ms: 1, detail: undefined },
    ]);
    expect(folded.usage).toEqual({ total_tokens: 10, cost_usd: 0.001 });
  });

  it("defaults usage/trace/citations to empty when no such events arrived", () => {
    const folded = foldEvents([{ event: "turn.start", session_id: "s-2" }]);
    expect(folded.trace).toEqual([]);
    expect(folded.citations).toEqual([]);
    expect(folded.usage).toEqual({});
  });
});
