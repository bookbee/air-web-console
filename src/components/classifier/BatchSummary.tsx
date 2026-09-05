"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";

import { DashboardGrid, type Row } from "@/components/shared/DashboardGrid";
import { formatCost, num } from "@/lib/format";
import { useConnectionStore } from "@/store/connectionStore";

import { ClassifyItemsList } from "./ClassifyItemsList";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Render a batch response: the roll-up, then each item on demand — ported
 * from `render_batch`. */
export function BatchSummary({ payload }: { payload: unknown }) {
  const rate = useConnectionStore((state) => state.usdToInrRate);
  const body = asRecord(payload);
  const items = Array.isArray(body.items) ? (body.items as Record<string, unknown>[]) : [];
  if (items.length === 0) {
    return <Alert severity="info">No items in this batch response.</Alert>;
  }

  const usage = asRecord(body.usage);
  const cost = usage.est_cost_usd;
  const latency = body.latency_ms;

  const rows: Row[] = [
    [
      { label: "succeeded", value: num(body.succeeded) },
      { label: "failed", value: num(body.failed), kind: body.failed ? "err" : "" },
      { label: "service_ms", value: typeof latency === "number" ? latency.toFixed(0) : "—" },
      { label: "cost", value: typeof cost === "number" ? formatCost(cost, rate) : "—" },
    ],
  ];

  return (
    <Box>
      <DashboardGrid title="Batch" rows={rows} />
      <ClassifyItemsList items={items} />
    </Box>
  );
}
