"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

import { DashboardGrid, TableTitle, type Row } from "@/components/shared/DashboardGrid";
import { DataTable } from "@/components/shared/DataTable";
import { formatCost, num, pct, text, yn, type Kind } from "@/lib/format";
import { useConnectionStore } from "@/store/connectionStore";

/**
 * Decoding a `/v1/classify` response — ported from `components/summary.py`.
 * Fields fall into three groups: always present, present only when the
 * ladder reached an LLM tier, and present only when the caller supplied a
 * `rating`. The renderer notes rather than hides an empty conditional
 * block — that absence is itself informative about how far the ladder
 * climbed.
 */

const SENTIMENT_KIND: Record<string, Kind> = {
  positive: "ok",
  negative: "err",
  mixed: "warn",
  neutral: "",
  unknown: "muted",
};
const URGENCY_KIND: Record<string, Kind> = { low: "", medium: "warn", high: "err", critical: "err" };
const ACTIONABILITY_KIND: Record<string, Kind> = {
  none: "",
  informational: "",
  actionable: "warn",
  blocking: "err",
};
const PRIORITY_KIND: Record<string, Kind> = { p1: "err", p2: "warn", p3: "", p4: "" };
const TONE_KIND: Record<string, Kind> = {
  satisfied: "ok",
  appreciative: "ok",
  neutral: "",
  confused: "",
  frustrated: "warn",
  urgent: "warn",
  sarcastic: "warn",
  angry: "err",
  disappointed: "err",
  anxious: "err",
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function labeled(value: unknown, kinds: Record<string, Kind>): [string, Kind] {
  const scored = asRecord(value);
  const label = scored.label;
  if (!label) return ["—", "muted"];
  const confidence = scored.confidence;
  const display = typeof confidence === "number" ? `${label} · ${pct(confidence)}` : String(label);
  return [display, kinds[String(label)] ?? ""];
}

function useCostRate() {
  return useConnectionStore((state) => state.usdToInrRate);
}

function Verdict({ payload }: { payload: Record<string, unknown> }) {
  const sentiment = asRecord(payload.sentiment);
  const label = String(sentiment.label ?? "unknown");
  const polarity = sentiment.polarity;
  const confidence = sentiment.confidence;
  const language = asRecord(payload.language);
  const degraded = Boolean(payload.degraded);
  const rationale = sentiment.rationale;

  const rows: Row[] = [
    [
      { label: "label", value: text(label), kind: SENTIMENT_KIND[label] ?? "" },
      { label: "polarity", value: typeof polarity === "number" ? `${polarity >= 0 ? "+" : ""}${polarity.toFixed(2)}` : "—" },
      { label: "confidence", value: pct(confidence) },
    ],
    [
      { label: "decided_by", value: text(payload.decided_by) },
      { label: "degraded", value: yn(degraded), kind: degraded ? "err" : "" },
      { label: "cached", value: yn(payload.cached) },
      { label: "language", value: `${language.code ?? "—"} · ${pct(language.confidence)}` },
    ],
  ];

  return (
    <>
      <DashboardGrid title="Verdict" rows={rows} />
      {typeof rationale === "string" && rationale.trim() && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
          &ldquo;{rationale}&rdquo;
        </Typography>
      )}
      {degraded && (
        <Alert severity="warning" sx={{ mb: 1.5 }}>
          <code>degraded: true</code> — at least one tier failed and the verdict came from a lower
          rung than the ladder wanted. Check the escalation trace below.
        </Alert>
      )}
    </>
  );
}

function RoutingAndActionability({ payload }: { payload: Record<string, unknown> }) {
  const [urgencyValue, urgencyKind] = labeled(payload.urgency, URGENCY_KIND);
  const actionability = String(payload.actionability || "—");
  const routing = asRecord(payload.routing);
  const priority = String(routing.priority || "");
  const requiresHuman = Boolean(payload.requires_human);

  const rows: Row[] = [
    [
      { label: "urgency", value: urgencyValue, kind: urgencyKind },
      { label: "actionability", value: actionability, kind: ACTIONABILITY_KIND[actionability] ?? "" },
      { label: "queue", value: text(routing.queue), kind: routing.queue ? "" : "muted" },
      { label: "priority", value: priority || "—", kind: priority ? PRIORITY_KIND[priority.toLowerCase()] ?? "" : "muted" },
      { label: "requires_human", value: yn(requiresHuman), kind: requiresHuman ? "warn" : "muted" },
    ],
  ];
  return <DashboardGrid title="Routing" rows={rows} />;
}

function ToneTopicsIntent({ payload }: { payload: Record<string, unknown> }) {
  const [toneValue, toneKind] = labeled(payload.tone, TONE_KIND);
  const [intentValue] = labeled(payload.intent, {});
  const topics = Array.isArray(payload.topics) ? (payload.topics as Record<string, unknown>[]) : [];
  const topicLabels = topics.map((t) => t.label).filter(Boolean).join(", ");

  const empty = toneValue === "—" && intentValue === "—" && !topicLabels;
  const rows: Row[] = empty
    ? []
    : [
        [
          { label: "tone", value: toneValue, kind: toneKind },
          { label: "intent", value: intentValue, kind: intentValue !== "—" ? "" : "muted" },
          { label: "topics", value: topicLabels || "—", kind: topicLabels ? "" : "muted" },
        ],
      ];

  return (
    <DashboardGrid
      title="Tone, topics & intent"
      rows={rows}
      empty="No tone, topics or intent — either the ladder stopped before an LLM tier, or the deciding rung was not asked to fill them."
    />
  );
}

function RatingConsistency({ payload }: { payload: Record<string, unknown> }) {
  const consistency = asRecord(payload.rating_consistency);
  if (Object.keys(consistency).length === 0) return null;

  const agreement = String(consistency.agreement || "—");
  const delta = consistency.delta;
  const normalised = consistency.normalised_rating;
  const disagrees = agreement !== "agrees" && agreement !== "—";

  const rows: Row[] = [
    [
      { label: "agreement", value: agreement.replace(/_/g, " "), kind: disagrees ? "warn" : "" },
      { label: "delta", value: typeof delta === "number" ? `${delta >= 0 ? "+" : ""}${delta.toFixed(2)}` : "—" },
      { label: "normalised_rating", value: typeof normalised === "number" ? `${normalised >= 0 ? "+" : ""}${normalised.toFixed(2)}` : "—" },
    ],
  ];

  return (
    <>
      <DashboardGrid title="Rating consistency" rows={rows} />
      {disagrees && (
        <Alert severity="info" sx={{ mb: 1.5 }}>
          The prose and the stars disagree ({agreement.replace(/_/g, " ")}) — often the most
          interesting rows in a review set.
        </Alert>
      )}
    </>
  );
}

function EmotionsAndAspects({ payload }: { payload: Record<string, unknown> }) {
  const emotions = Array.isArray(payload.emotions) ? (payload.emotions as Record<string, unknown>[]) : [];
  const aspects = Array.isArray(payload.aspects) ? (payload.aspects as Record<string, unknown>[]) : [];

  return (
    <>
      {emotions.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <TableTitle title="Emotions" />
          <DataTable
            rows={emotions.map((e) => ({ emotion: e.name, score: num(e.score, 2) }))}
            columns={[{ key: "emotion", label: "emotion" }, { key: "score", label: "score" }]}
          />
        </Box>
      )}
      {aspects.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <TableTitle title="Aspects" />
          <DataTable
            rows={aspects.map((a) => ({
              aspect: a.name,
              label: a.label,
              confidence: num(a.confidence, 2),
              evidence: a.evidence,
            }))}
          />
        </Box>
      )}
    </>
  );
}

function EscalationTrace({ payload }: { payload: Record<string, unknown> }) {
  const trace = Array.isArray(payload.escalation_trace) ? (payload.escalation_trace as Record<string, unknown>[]) : [];
  if (trace.length === 0) {
    return (
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
        No escalation trace in this response — <code>options.include_trace</code> was off, or the
        service omitted it.
      </Typography>
    );
  }
  const versions = asRecord(payload.model_versions);
  return (
    <Box sx={{ mb: 2 }}>
      <TableTitle title="Escalation ladder" />
      <DataTable
        rows={trace.map((step) => ({
          tier: step.tier,
          label: step.label,
          confidence: num(step.confidence, 2),
          "latency ms": step.latency_ms,
          model: versions[String(step.tier)] ?? "—",
          ok: step.succeeded,
          "escalated because": step.escalated_because || "— (accepted)",
        }))}
      />
    </Box>
  );
}

function SafetyAndUsage({ payload }: { payload: Record<string, unknown> }) {
  const rate = useCostRate();
  const safety = asRecord(payload.safety);
  const piiRedacted = Boolean(safety.pii_redacted);
  const flagged = Boolean(safety.flagged);
  const truncated = Boolean(safety.truncated);
  const findings = Array.isArray(safety.pii_findings) ? (safety.pii_findings as Record<string, unknown>[]) : [];
  const findingCount = findings.reduce((sum, f) => sum + Number(f.count || 0), 0);

  const safetyRows: Row[] = [
    [
      { label: "pii_redacted", value: yn(piiRedacted), kind: piiRedacted ? "ok" : "muted" },
      { label: "pii_findings", value: String(findingCount), kind: findingCount ? "warn" : "muted" },
      { label: "flagged", value: yn(flagged), kind: flagged ? "err" : "muted" },
      { label: "truncated", value: yn(truncated), kind: truncated ? "warn" : "muted" },
    ],
  ];

  const usage = asRecord(payload.usage);
  const cost = usage.est_cost_usd;
  const usageRows: Row[] = [
    [
      { label: "tiers_run", value: num(usage.tiers_run) },
      { label: "tokens_in", value: num(usage.tokens_in) },
      { label: "tokens_out", value: num(usage.tokens_out) },
      { label: "cache_read_tokens", value: num(usage.cache_read_tokens) },
      {
        label: "cost",
        value: typeof cost === "number" ? formatCost(cost, rate) : "—",
        kind: typeof cost === "number" && cost > 0 ? "" : "muted",
      },
    ],
  ];

  return (
    <>
      <DashboardGrid title="Safety" rows={safetyRows} />
      {findings.length > 0 && (
        <DataTable rows={findings.map((f) => ({ kind: f.kind, count: f.count }))} />
      )}
      {typeof safety.flag_reason === "string" && safety.flag_reason && (
        <Alert severity="warning" sx={{ my: 1 }}>
          Flagged: {safety.flag_reason}
        </Alert>
      )}
      <DashboardGrid title="Usage & cost" rows={usageRows} />
    </>
  );
}

export function ClassificationSummary({ payload }: { payload: unknown }) {
  const body = asRecord(payload);
  if (Object.keys(body).length === 0) {
    return (
      <Typography color="text.secondary" sx={{ fontStyle: "italic" }}>
        Nothing to summarise.
      </Typography>
    );
  }
  return (
    <Box>
      <Verdict payload={body} />
      <RoutingAndActionability payload={body} />
      <ToneTopicsIntent payload={body} />
      <RatingConsistency payload={body} />
      <EmotionsAndAspects payload={body} />
      <EscalationTrace payload={body} />
      <SafetyAndUsage payload={body} />
    </Box>
  );
}
