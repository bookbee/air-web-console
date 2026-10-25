"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";

import { ChatBubble } from "@/components/shared/ChatBubble";
import { DashboardGrid, type Row } from "@/components/shared/DashboardGrid";
import { JsonViewer } from "@/components/shared/JsonViewer";
import { formatCost, num, text, yn, type Kind } from "@/lib/format";
import type { Exchange } from "@/lib/http/exchange";
import { useConnectionStore } from "@/store/connectionStore";

import { responseBody, type StreamFacts } from "./stream";

/** Whether `content` parses, when the request asked for structured output.
 * The gateway forwards `json_schema` and never checks the answer against it
 * ("validate it on your side"), so this pane is that side. */
function structuredVerdict(request: unknown, content: unknown, finishReason: unknown): [string, Kind] | null {
  if (!request || typeof request !== "object" || !("json_schema" in request)) return null;
  if (finishReason === "length") return ["truncated — treat as invalid", "err"];
  if (typeof content !== "string") return ["no content", "err"];
  try {
    JSON.parse(content);
    return ["parses as JSON", "ok"];
  } catch {
    return ["not valid JSON", "err"];
  }
}

function finishKind(value: unknown): Kind {
  if (value === "stop") return "";
  if (value === "length" || value === "other") return "warn";
  if (value === "refusal") return "err";
  return "muted";
}

const ms = (value: number | null): string => (value === null ? "—" : `${value} ms`);

function StreamRows({ facts }: { facts: StreamFacts }) {
  // Every frame landing within a few ms of the last means something between
  // the gateway and here held the stream back and released it at once.
  const buffered =
    facts.deltas > 2 && facts.firstDeltaMs !== null && facts.lastEventMs !== null && facts.lastEventMs - facts.firstDeltaMs < 5;
  return (
    <>
      <DashboardGrid
        title="Stream"
        rows={[
          [
            { label: "start", value: yn(facts.started), kind: facts.started ? "ok" : "err" },
            { label: "deltas", value: String(facts.deltas) },
            { label: "ended with", value: facts.done ? "done" : facts.error ? "error" : "nothing", kind: facts.done ? "ok" : "err" },
            { label: "first delta", value: ms(facts.firstDeltaMs) },
            { label: "last event", value: ms(facts.lastEventMs) },
            { label: "replayed from cache", value: yn(facts.cachedStart), kind: facts.cachedStart ? "ok" : "muted" },
          ],
        ]}
      />
      {facts.error && (
        <Alert severity="error" sx={{ mb: 1.5 }}>
          Interrupted after it started: <code>{facts.error}</code>. The text below is incomplete; the
          gateway could no longer fail over once the first token was sent.
        </Alert>
      )}
      {buffered && (
        <Alert severity="warning" sx={{ mb: 1.5 }}>
          Every delta arrived within 5 ms: something between the gateway and this console buffered the
          stream. The gateway sends <code>X-Accel-Buffering: no</code>; check any proxy in between.
        </Alert>
      )}
    </>
  );
}

/** `/v1/generate` (JSON or a folded stream) and `/v1/embed` answers.
 * Needs the exchange, not just its JSON: a stream's body is its events,
 * and structured output is judged against the request that was sent. */
export function CallSummary({ exchange }: { exchange: Exchange }) {
  const rate = useConnectionStore((state) => state.usdToInrRate);
  const body = responseBody(exchange);
  if (Object.keys(body).length === 0 || typeof body.code === "string") return null;

  const facts = (body.stream ?? null) as StreamFacts | null;
  const isEmbed = "embedding_model" in body;
  const refusal = Boolean(body.refusal);
  const cached = Boolean(body.cached);

  const verdictRows: Row[] = isEmbed
    ? [
        [
          { label: "embedding_model", value: text(body.embedding_model) },
          { label: "dimensions", value: num(body.dimensions) },
          { label: "provider", value: text(body.provider) },
          { label: "model", value: text(body.model) },
        ],
      ]
    : [
        [
          { label: "model_class", value: body.model_class === null ? "null (pinned)" : text(body.model_class) },
          { label: "provider", value: text(body.provider) },
          { label: "model", value: text(body.model) },
          { label: "cached", value: yn(cached), kind: cached ? "ok" : "muted" },
        ],
        [
          { label: "finish_reason", value: text(body.finish_reason), kind: finishKind(body.finish_reason) },
          { label: "provider_finish_reason", value: text(body.provider_finish_reason), kind: "muted" },
          { label: "refusal", value: yn(refusal), kind: refusal ? "err" : "muted" },
        ],
      ];
  const structured = isEmbed ? null : structuredVerdict(exchange.requestBody, body.content, body.finish_reason);
  if (structured) verdictRows[1].push({ label: "structured output", value: structured[0], kind: structured[1] });
  verdictRows.push([{ label: "id", value: text(body.id), kind: "muted" }]);

  const content = body.content;
  const embeddings = Array.isArray(body.embeddings) ? (body.embeddings as unknown[][]) : null;
  const usage = body.usage && typeof body.usage === "object" ? (body.usage as Record<string, unknown>) : null;
  const cost = body.cost_usd;
  const inputCount = (exchange.requestBody as { input?: unknown } | null)?.input;
  const wrongDims = embeddings?.some((vector) => vector.length !== body.dimensions);

  return (
    <Box>
      <DashboardGrid title="Verdict" rows={verdictRows} />
      {facts && <StreamRows facts={facts} />}

      {typeof content === "string" && content.trim() && <ChatBubble role="assistant">{content}</ChatBubble>}
      {refusal && (
        <Alert severity="warning" sx={{ mb: 1.5 }}>
          <code>refusal: true</code> — the provider declined to answer. Refusals are never cached.
        </Alert>
      )}
      {body.finish_reason === "length" && (
        <Alert severity="warning" sx={{ mb: 1.5 }}>
          <code>finish_reason: length</code> — cut off at <code>max_tokens</code>. Not cached, so a retry
          with a higher cap gets a fresh answer. Thinking models (Gemini) spend part of the cap first.
        </Alert>
      )}
      {cached && (
        <Alert severity="info" sx={{ mb: 1.5 }}>
          Served from the gateway&apos;s response cache: <code>id</code> and <code>usage</code> are the
          original call&apos;s, <code>cost_usd</code> is 0.
        </Alert>
      )}

      {embeddings && (
        <Box sx={{ mb: 1.5 }}>
          <DashboardGrid
            title="Embeddings"
            rows={[
              [
                { label: "vectors", value: `${embeddings.length} × ${embeddings[0]?.length ?? 0}` },
                {
                  label: "one per input",
                  value: Array.isArray(inputCount) ? yn(inputCount.length === embeddings.length) : "—",
                  kind: Array.isArray(inputCount) && inputCount.length !== embeddings.length ? "err" : "ok",
                },
                { label: "matches dimensions", value: yn(!wrongDims), kind: wrongDims ? "err" : "ok" },
              ],
            ]}
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
              { label: "cache_write_tokens", value: num(usage.cache_write_tokens) },
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
