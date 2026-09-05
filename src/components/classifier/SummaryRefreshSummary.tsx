"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";

import { DashboardGrid, TableTitle, type Row } from "@/components/shared/DashboardGrid";
import { DataTable } from "@/components/shared/DataTable";
import { formatCost, num, text } from "@/lib/format";
import { useConnectionStore } from "@/store/connectionStore";

import { ClassifyItemsList } from "./ClassifyItemsList";

/**
 * Decoding a `/v1/summary/refresh` response: the narrative headline, the
 * deterministic rollup it was built from, then the per-item verdicts —
 * same items shape `/v1/classify/batch` returns, so `ClassifyItemsList`
 * renders them identically.
 */

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function histogramRows(map: Record<string, unknown>, labelHeader: string) {
  return Object.entries(map).map(([label, count]) => ({ [labelHeader]: label, count }));
}

function HistogramTable({ title, map, labelHeader }: { title: string; map: Record<string, unknown>; labelHeader: string }) {
  if (Object.keys(map).length === 0) return null;
  return (
    <Box sx={{ mb: 1.5 }}>
      <TableTitle title={title} />
      <DataTable
        rows={histogramRows(map, labelHeader)}
        columns={[
          { key: labelHeader, label: labelHeader },
          { key: "count", label: "count" },
        ]}
      />
    </Box>
  );
}

export function SummaryRefreshSummary({ payload }: { payload: unknown }) {
  const rate = useConnectionStore((state) => state.usdToInrRate);
  const body = asRecord(payload);
  if (Object.keys(body).length === 0) {
    return (
      <Typography color="text.secondary" sx={{ fontStyle: "italic" }}>
        Nothing to summarise.
      </Typography>
    );
  }

  const summary = asRecord(body.summary);
  const rollup = asRecord(summary.rollup);
  const narrative = typeof summary.narrative === "string" ? summary.narrative : "";
  const degraded = Boolean(body.degraded);
  const usage = asRecord(body.usage);
  const cost = usage.est_cost_usd;
  const latency = body.latency_ms;
  const items = Array.isArray(body.items) ? (body.items as Record<string, unknown>[]) : [];
  const recentRatings = Array.isArray(rollup.recent_ratings) ? (rollup.recent_ratings as number[]) : [];

  const headerRows: Row[] = [
    [
      { label: "customer_id", value: text(body.customer_id) },
      { label: "version", value: num(summary.version) },
      { label: "degraded", value: degraded ? "yes" : "no", kind: degraded ? "warn" : "muted" },
      { label: "latency_ms", value: typeof latency === "number" ? latency.toFixed(0) : "—" },
      { label: "cost", value: typeof cost === "number" ? formatCost(cost, rate) : "—", kind: typeof cost === "number" && cost > 0 ? "" : "muted" },
    ],
  ];

  const rollupRows: Row[] = [
    [
      { label: "total_items", value: num(rollup.total_items) },
      { label: "rating_count", value: num(rollup.rating_count) },
      { label: "average_rating", value: typeof rollup.average_rating === "number" ? rollup.average_rating.toFixed(2) : "—" },
      {
        label: "recent_average_rating",
        value: typeof rollup.recent_average_rating === "number" ? rollup.recent_average_rating.toFixed(2) : "—",
      },
    ],
    [
      { label: "first_seen_at", value: text(rollup.first_seen_at) },
      { label: "last_seen_at", value: text(rollup.last_seen_at) },
    ],
  ];

  return (
    <Box>
      <DashboardGrid title="Verdict" rows={headerRows} />

      {degraded && (
        <Alert severity="warning" sx={{ mb: 1.5 }}>
          The narrative-refresh call failed, or air-llm&apos;s summary model isn&apos;t
          configured — the narrative below is carried over unchanged from{" "}
          <code>existing_summary</code>. The rollup and item verdicts are unaffected.
        </Alert>
      )}

      <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5 }}>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", mb: 0.5, textTransform: "uppercase", letterSpacing: "0.5px" }}
        >
          Narrative
        </Typography>
        <Typography variant="body2" sx={{ fontStyle: narrative ? "normal" : "italic" }}>
          {narrative ||
            "No narrative yet — this is the customer's first refresh, or every attempt so far has degraded."}
        </Typography>
      </Paper>

      <DashboardGrid title="Rollup" rows={rollupRows} />

      {recentRatings.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
          Recent ratings, oldest first: {recentRatings.join(", ")}
        </Typography>
      )}

      <HistogramTable title="Counts by source type" map={asRecord(rollup.counts_by_source_type)} labelHeader="source_type" />
      <HistogramTable title="Sentiment histogram" map={asRecord(rollup.sentiment_counts)} labelHeader="label" />
      <HistogramTable title="Urgency histogram" map={asRecord(rollup.urgency_counts)} labelHeader="label" />
      <HistogramTable title="Topic histogram" map={asRecord(rollup.topic_counts)} labelHeader="topic" />

      <ClassifyItemsList items={items} />
    </Box>
  );
}
