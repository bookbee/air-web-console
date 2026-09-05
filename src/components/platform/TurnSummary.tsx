"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";

import { ChatBubble } from "@/components/shared/ChatBubble";
import { DashboardGrid, TableTitle, type Row } from "@/components/shared/DashboardGrid";
import { DataTable } from "@/components/shared/DataTable";
import { JsonViewer } from "@/components/shared/JsonViewer";
import { formatCost, num, text, yn, type Kind } from "@/lib/format";
import type { Exchange } from "@/lib/http/exchange";
import { useConnectionStore } from "@/store/connectionStore";

import { EventTimeline } from "./EventTimeline";
import { foldEvents } from "./events";
import { ProposalPanel } from "./ProposalPanel";

/**
 * A `TurnResult`, read the way an operator reads it: verdict, then
 * evidence — ported from `_turn_summary`. Works identically whether the
 * turn came back as one JSON body or was folded from a collected SSE
 * stream, since `foldEvents` reassembles the same shape either way.
 */

const STATUS_KIND: Record<string, Kind> = { ok: "ok", refused: "warn", degraded: "warn", error: "err" };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function TurnSummary({
  exchange,
  sessionId,
  onProposalAction,
  proposalPending,
}: {
  exchange: Exchange;
  sessionId: string;
  onProposalAction: (approve: boolean) => void;
  proposalPending: boolean;
}) {
  const rate = useConnectionStore((state) => state.usdToInrRate);
  const body = exchange.isStream ? foldEvents(exchange.events) : asRecord(exchange.responseJson);

  const answer = body.answer;
  const status = String(body.status ?? "—");
  const grounded = Boolean(body.grounded);
  const refusal = Boolean(body.refusal);
  const routes = Array.isArray(body.routes) ? (body.routes as string[]) : [];
  const session = body.session_id;
  const structured = body.structured;
  const proposal = asRecord(body.proposal);
  const citations = Array.isArray(body.citations) ? (body.citations as Record<string, unknown>[]) : [];
  const trace = Array.isArray(body.trace) ? (body.trace as Record<string, unknown>[]) : [];
  const degraded = Array.isArray(body.degraded) ? (body.degraded as string[]) : [];
  const usage = asRecord(body.usage);

  const verdictRows: Row[] = [
    [
      { label: "status", value: status, kind: STATUS_KIND[status] ?? "" },
      { label: "grounded", value: yn(grounded), kind: grounded ? "" : "muted" },
      { label: "refusal", value: yn(refusal), kind: refusal ? "err" : "muted" },
      { label: "routes", value: routes.length > 0 ? routes.join(", ") : "—" },
      { label: "session_id", value: text(session) },
    ],
  ];

  const cost = usage.cost_usd;
  const usageRows: Row[] = [
    [
      { label: "model_calls", value: num(usage.model_calls) },
      { label: "prompt_tokens", value: num(usage.prompt_tokens) },
      { label: "completion_tokens", value: num(usage.completion_tokens) },
      { label: "total_tokens", value: num(usage.total_tokens) },
      { label: "cache_hit", value: yn(usage.cache_hit) },
      { label: "cost", value: typeof cost === "number" ? formatCost(cost, rate) : "—", kind: typeof cost === "number" && cost > 0 ? "" : "muted" },
    ],
  ];

  return (
    <Box>
      {exchange.isStream && exchange.events.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <EventTimeline events={exchange.events} />
        </Box>
      )}

      {typeof answer === "string" && answer.trim() && <ChatBubble role="assistant">{answer}</ChatBubble>}

      <DashboardGrid title="Verdict" rows={verdictRows} />

      {degraded.length > 0 && (
        <Alert severity="warning" sx={{ mb: 1.5 }}>
          Degraded: {degraded.join(", ")}. A capability was unavailable and the turn answered
          without it.
        </Alert>
      )}

      {structured !== undefined && structured !== null && (
        <Box sx={{ mb: 2 }}>
          <TableTitle title="Structured output" />
          <JsonViewer value={structured} />
        </Box>
      )}

      {Object.keys(proposal).length > 0 && (
        <ProposalPanel proposal={proposal} sessionId={sessionId} onAction={onProposalAction} disabled={proposalPending} />
      )}

      {citations.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <TableTitle title="Citations" />
          <DataTable rows={citations} />
        </Box>
      )}

      {trace.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <TableTitle title="Pipeline stages" />
          <DataTable
            rows={trace.map((step) => ({
              stage: step.stage,
              status: step.status,
              "latency ms": step.latency_ms,
              detail: step.detail ?? "",
            }))}
          />
        </Box>
      )}

      {Object.keys(usage).length > 0 && <DashboardGrid title="Usage" rows={usageRows} />}
    </Box>
  );
}
