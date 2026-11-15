"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";

import { DashboardGrid, type Row } from "@/components/shared/DashboardGrid";
import type { Connection } from "@/lib/connection";
import { isRemote } from "@/lib/connection";
import type { Exchange } from "@/lib/http/exchange";

import { inventoryFailure, type Inventory } from "./data";

function failureOf(exchange: Exchange | undefined): string | null {
  if (!exchange) return null;
  if (exchange.error) return exchange.error;
  const body = (exchange.responseJson ?? {}) as Record<string, unknown>;
  return exchange.statusCode !== null && exchange.statusCode >= 400
    ? `${exchange.statusCode} ${String(body.code ?? body.title ?? exchange.reason)}`
    : null;
}

/** Which air-tools-gateway answers this tab, and what it will do: readiness
 * (the orders backend), the live inventory (checked against the contract,
 * since the orchestrator silently drops a bad entry), and which of the two
 * keys this target holds. */
export function ToolsStatus({
  connection,
  ready,
  capabilities,
  onReload,
}: {
  connection: Connection;
  ready: Exchange | undefined;
  capabilities: Exchange | undefined;
  onReload: () => void;
}) {
  const readiness = (ready?.responseJson ?? null) as { status?: string; checks?: { name: string; ok: boolean; detail?: string }[] } | null;
  const inventory = (capabilities?.statusCode === 200 ? capabilities.responseJson : null) as Inventory | null;
  const readyError = readiness?.status === undefined ? failureOf(ready) : null;
  const capsError = failureOf(capabilities);
  const contract = inventory ? inventoryFailure(inventory as unknown as Record<string, unknown>) : null;
  const backend = readiness?.checks?.find((c) => c.name === "orders_backend");
  const configured = Boolean(connection.baseUrl.trim());

  const rows: Row[] = [
    [
      {
        label: "ready",
        value: readiness?.status ?? (readyError ?? (configured ? "…" : "no base URL")),
        kind: readiness?.status === "ready" ? "ok" : readiness?.status || readyError ? "err" : "muted",
      },
      {
        label: "orders backend",
        value: backend ? (backend.ok ? "ok" : `down${backend.detail ? `: ${backend.detail}` : ""}`) : "—",
        kind: backend ? (backend.ok ? "ok" : "err") : "muted",
      },
      { label: "version", value: inventory?.version ?? "—", kind: "muted" },
    ],
    [
      {
        label: "capabilities",
        value: inventory && Array.isArray(inventory.capabilities) ? inventory.capabilities.map((c) => `${c.name} (${c.kind}${c.risk ? `, ${c.risk}` : ""})`).join(" · ") : (capsError ?? "…"),
        kind: capsError ? "warn" : contract ? "err" : undefined,
      },
    ],
    [
      { label: "read key", value: connection.authenticated ? "configured" : "none: tools and propose get 401", kind: connection.authenticated ? "ok" : "err" },
      {
        label: "execute key",
        value: connection.executeKeyed ? (isRemote(connection) ? "configured · REMOTE: each execute asks first" : "configured") : "none: the console refuses execute",
        kind: connection.executeKeyed ? (isRemote(connection) ? "warn" : "ok") : "muted",
      },
    ],
  ];

  return (
    <Box sx={{ mb: 1.5 }}>
      <DashboardGrid title="air-tools-gateway · GET /v1/ready · GET /v1/capabilities" rows={rows} />
      {contract && (
        <Alert severity="error" sx={{ mb: 1 }}>
          <b>The inventory breaks the contract:</b> {contract}. The orchestrator drops an entry like this without saying so.
        </Alert>
      )}
      <Button size="small" onClick={onReload} disabled={!configured}>
        Reload status
      </Button>
    </Box>
  );
}
