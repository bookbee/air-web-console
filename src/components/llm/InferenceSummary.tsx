"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";

import { ChatBubble } from "@/components/shared/ChatBubble";
import { DashboardGrid, type Row } from "@/components/shared/DashboardGrid";
import { JsonViewer } from "@/components/shared/JsonViewer";
import { formatCost, num, text, yn } from "@/lib/format";
import { useConnectionStore } from "@/store/connectionStore";

/** Ported from `_inference_summary`. */
export function InferenceSummary({ payload }: { payload: unknown }) {
  const rate = useConnectionStore((state) => state.usdToInrRate);
  if (!payload || typeof payload !== "object") return null;
  const body = payload as Record<string, unknown>;

  const refusal = Boolean(body.refusal);
  const cached = Boolean(body.cached);
  const verdictRows: Row[] = [
    [
      { label: "task", value: text(body.task) },
      { label: "provider", value: text(body.provider) },
      { label: "model", value: text(body.model) },
      { label: "cached", value: yn(cached) },
      { label: "refusal", value: yn(refusal), kind: refusal ? "err" : "muted" },
      { label: "finish_reason", value: text(body.finish_reason) },
    ],
  ];

  const content = body.content;
  const embeddings = Array.isArray(body.embeddings) ? (body.embeddings as unknown[][]) : null;
  const usage = body.usage && typeof body.usage === "object" ? (body.usage as Record<string, unknown>) : null;
  const cost = body.cost_usd;

  return (
    <Box>
      <DashboardGrid title="Verdict" rows={verdictRows} />

      {typeof content === "string" && content.trim() && <ChatBubble role="assistant">{content}</ChatBubble>}
      {refusal && (
        <Alert severity="warning" sx={{ mb: 1.5 }}>
          <code>refusal: true</code> — the provider declined to answer.
        </Alert>
      )}

      {embeddings && embeddings.length > 0 && (
        <Box sx={{ mb: 1.5 }}>
          <DashboardGrid
            title="Embeddings"
            rows={[[{ label: "vectors", value: `${embeddings.length} x ${embeddings[0]?.length ?? 0} dims` }]]}
          />
          <JsonViewer value={embeddings} maxHeight={240} />
        </Box>
      )}

      {usage && (
        <DashboardGrid
          title="Usage & cost"
          rows={[
            [
              { label: "prompt_tokens", value: num(usage.prompt_tokens) },
              { label: "completion_tokens", value: num(usage.completion_tokens) },
              { label: "total_tokens", value: num(usage.total_tokens) },
              { label: "cache_read_tokens", value: num(usage.cache_read_tokens) },
              {
                label: "cost",
                value: typeof cost === "number" ? formatCost(cost, rate) : "—",
                kind: typeof cost === "number" && cost > 0 ? "" : "muted",
              },
            ],
          ]}
        />
      )}
    </Box>
  );
}
