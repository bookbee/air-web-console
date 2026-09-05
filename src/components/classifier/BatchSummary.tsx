"use client";

import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Alert from "@mui/material/Alert";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Box from "@mui/material/Box";

import { DashboardGrid, TableTitle, type Row } from "@/components/shared/DashboardGrid";
import { DataTable } from "@/components/shared/DataTable";
import { formatCost, num } from "@/lib/format";
import { useConnectionStore } from "@/store/connectionStore";

import { ClassificationSummary } from "./ClassificationSummary";

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

  const overview = items.map((item) => {
    const result = asRecord(item.result);
    const sentiment = asRecord(result.sentiment);
    const error = asRecord(item.error);
    return {
      "#": item.index,
      ok: item.ok,
      label: sentiment.label ?? "",
      polarity: sentiment.polarity,
      confidence: sentiment.confidence,
      "decided by": result.decided_by ?? "",
      error: error.title ?? "",
    };
  });

  return (
    <Box>
      <DashboardGrid title="Batch" rows={rows} />
      <TableTitle title="Items" />
      <DataTable rows={overview} />
      {items.map((item, index) => {
        const ok = Boolean(item.ok);
        const result = asRecord(item.result);
        const error = asRecord(item.error);
        const label = ok ? String(asRecord(result.sentiment).label ?? "?") : "failed";
        return (
          <Accordion key={index} disableGutters elevation={0} sx={{ border: 1, borderColor: "divider", "&:before": { display: "none" }, mt: 1 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              Item {String(item.index)} — {label}
            </AccordionSummary>
            <AccordionDetails>
              {ok ? (
                <ClassificationSummary payload={result} />
              ) : (
                <Alert severity="error">{String(error.title ?? "Unknown error")}</Alert>
              )}
            </AccordionDetails>
          </Accordion>
        );
      })}
    </Box>
  );
}
