"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";

import { DashboardGrid, type Row } from "@/components/shared/DashboardGrid";
import type { Exchange } from "@/lib/http/exchange";

import type { RagCapabilities, RagReadiness } from "./data";

function failureOf(exchange: Exchange | undefined): string | null {
  if (!exchange) return null;
  if (exchange.error) return exchange.error;
  const body = (exchange.responseJson ?? {}) as Record<string, unknown>;
  return exchange.statusCode !== null && exchange.statusCode >= 400
    ? `${exchange.statusCode} ${String(body.title ?? exchange.reason)}`
    : null;
}

/** One strip that says which air-rag-service answers this tab and whether it
 * can answer usefully: readiness (the gateway it embeds through, the index
 * size, warnings) and the key's own capabilities (tenant, env, backend). */
export function RagStatus({
  ready,
  capabilities,
  onReload,
  disabled,
}: {
  ready: Exchange | undefined;
  capabilities: Exchange | undefined;
  onReload: () => void;
  disabled: boolean;
}) {
  const readiness = (ready?.responseJson ?? null) as RagReadiness | null;
  const caps = (capabilities?.statusCode === 200 ? capabilities.responseJson : null) as RagCapabilities | null;
  const gateway = readiness?.dependencies?.find((d) => d.service === "air-model-gateway") ?? readiness?.dependencies?.[0];
  const count = caps?.document_count ?? readiness?.document_count;
  const readyError = readiness?.ready === undefined ? failureOf(ready) : null;
  const capsError = failureOf(capabilities);

  const rows: Row[] = [
    [
      {
        label: "ready",
        value: readiness?.ready === undefined ? (readyError ?? "…") : readiness.ready ? "yes" : "no (503)",
        kind: readiness?.ready ? "ok" : readiness?.ready === false || readyError ? "err" : "muted",
      },
      {
        label: gateway?.service ?? "gateway",
        value: gateway ? (gateway.reachable ? `reachable · ${gateway.latency_ms?.toFixed(0) ?? "—"} ms` : `unreachable${gateway.detail ? `: ${gateway.detail}` : ""}`) : "—",
        kind: gateway ? (gateway.reachable ? "ok" : "err") : "muted",
      },
      { label: "chunks indexed", value: count === undefined ? "—" : String(count), kind: count === 0 ? "err" : count ? "ok" : "muted" },
      { label: "version", value: readiness?.version ?? caps?.version ?? "—", kind: "muted" },
    ],
    [
      { label: "key's tenant", value: caps?.tenant ?? (capsError ? `— (${capsError})` : "…"), kind: capsError ? "warn" : undefined },
      { label: "env", value: caps?.env ?? "—" },
      { label: "vector store", value: caps?.vector_store_backend ?? "—" },
    ],
  ];

  return (
    <Box sx={{ mb: 1.5 }}>
      <DashboardGrid title="air-rag-service · GET /v1/ready · GET /v1/capabilities" rows={rows} />
      {count === 0 && (
        <Alert severity="error" sx={{ mb: 1 }}>
          <b>The index is empty.</b> Every retrieve will answer <code>citations: []</code>: the service was started
          without <code>seed_dir</code>. Restart it with <code>make run-sit</code> in <code>../air-rag-service</code>.
        </Alert>
      )}
      {(readiness?.warnings ?? [])
        .filter(() => count !== 0)
        .map((warning) => (
          <Alert key={warning} severity="warning" sx={{ mb: 1 }}>
            {warning}
          </Alert>
        ))}
      <Button size="small" onClick={onReload} disabled={disabled}>
        Reload status
      </Button>
    </Box>
  );
}
