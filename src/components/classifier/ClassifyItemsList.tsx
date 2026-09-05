"use client";

import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Alert from "@mui/material/Alert";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Box from "@mui/material/Box";

import { TableTitle } from "@/components/shared/DashboardGrid";
import { DataTable } from "@/components/shared/DataTable";

import { ClassificationSummary } from "./ClassificationSummary";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** One overview table + an expandable per-item verdict, for any response
 * whose `items` is a `ClassifyBatchItem[]` — the shape both
 * `/v1/classify/batch` and `/v1/summary/refresh` return. Shared so the two
 * summaries (`BatchSummary`, the summary-refresh view) render items
 * identically rather than each re-deriving the same table/accordion pair. */
export function ClassifyItemsList({ items }: { items: Record<string, unknown>[] }) {
  if (items.length === 0) {
    return (
      <Alert severity="info" sx={{ mt: 1.5 }}>
        No items in this response.
      </Alert>
    );
  }

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
      <TableTitle title="Items" />
      <DataTable rows={overview} />
      {items.map((item, index) => {
        const ok = Boolean(item.ok);
        const result = asRecord(item.result);
        const error = asRecord(item.error);
        const label = ok ? String(asRecord(result.sentiment).label ?? "?") : "failed";
        return (
          <Accordion
            key={index}
            disableGutters
            elevation={0}
            sx={{ border: 1, borderColor: "divider", "&:before": { display: "none" }, mt: 1 }}
          >
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
