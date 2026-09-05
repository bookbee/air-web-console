import type { SseEvent } from "@/lib/http/exchange";

/**
 * Reassembling air-orchestrator-service's turn-lifecycle SSE events into the same shape
 * a JSON-body `TurnResult` already has — ported from `_fold_events`. Our
 * BFF's stream transport already collects every frame server-side (see
 * `forwardStreamRequest`), so this is the one place that needs to know the
 * event vocabulary; `TurnSummary` reads either shape identically past this.
 */
export function foldEvents(events: SseEvent[]): Record<string, unknown> {
  const folded: Record<string, unknown> = { trace: [], citations: [], usage: {} };
  const trace = folded.trace as Record<string, unknown>[];
  const citations = folded.citations as Record<string, unknown>[];

  for (const event of events) {
    switch (event.event) {
      case "turn.start":
        folded.session_id = event.session_id;
        break;
      case "stage":
        trace.push({
          stage: event.stage,
          status: event.status,
          latency_ms: event.latency_ms,
          detail: event.detail,
        });
        break;
      case "route":
        folded.routes = event.routes;
        break;
      case "citation":
        if (event.citation && typeof event.citation === "object") {
          citations.push(event.citation as Record<string, unknown>);
        }
        break;
      case "proposal":
        folded.proposal = event.proposal;
        break;
      case "answer":
        folded.answer = event.text;
        folded.structured = event.structured;
        folded.grounded = event.grounded ?? false;
        folded.refusal = event.refusal ?? false;
        break;
      case "usage":
        folded.usage = event.usage ?? {};
        break;
      case "turn.end":
        folded.status = event.status;
        break;
      default:
        break;
    }
  }
  return folded;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** One line worth showing next to an event's name in the timeline — ported
 * from `_event_detail`. */
export function eventDetail(event: SseEvent): string {
  switch (event.event) {
    case "turn.start":
      return `session=${event.session_id} · channel=${event.channel}`;
    case "stage": {
      const bits = `${event.stage} · ${event.status} · ${event.latency_ms}ms`;
      return event.detail ? `${bits} — ${event.detail}` : bits;
    }
    case "route": {
      const routes = Array.isArray(event.routes) ? (event.routes as string[]) : [];
      const reason = String(event.reason ?? "");
      return routes.length > 0 ? `${routes.join(", ")} — ${reason}` : reason;
    }
    case "citation": {
      const citation = asRecord(event.citation);
      return String(citation.title ?? citation.source_id ?? "");
    }
    case "proposal": {
      const proposal = asRecord(event.proposal);
      return `${proposal.action} · risk=${proposal.risk} · ${proposal.proposal_id}`;
    }
    case "answer": {
      const text = String(event.text ?? "");
      return text.length <= 80 ? text : `${text.slice(0, 77)}...`;
    }
    case "usage": {
      const usage = asRecord(event.usage);
      const cost = typeof usage.cost_usd === "number" ? usage.cost_usd : 0;
      return `cost=$${cost.toFixed(4)} · tokens=${usage.total_tokens ?? 0}`;
    }
    case "error":
      return `${event.code}: ${event.detail}`;
    case "turn.end":
      return `status=${event.status} · ${event.latency_ms}ms`;
    default:
      return "";
  }
}
