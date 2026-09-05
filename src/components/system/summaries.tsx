"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";

import { DataTable } from "@/components/shared/DataTable";

/**
 * Health/readiness/capabilities summaries — ported from `tabs/system.py`.
 * air-classifier-service, air-orchestrator-service and air-llm each answer `/v1/capabilities`
 * and `/v1/ready` with a different shape, so these renderers follow
 * whichever fields the payload actually has rather than one service's
 * schema, exactly like the Python version.
 */

const HEADLINE_KEYS = ["service", "version", "env", "channel", "environment", "default_model"];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function detailText(value: unknown): string {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${key}=${typeof item === "object" ? JSON.stringify(item) : item}`)
      .join(", ");
  }
  return value ? String(value) : "";
}

function Facts({ payload }: { payload: Record<string, unknown> }) {
  const present = [
    ...HEADLINE_KEYS.filter((key) => key in payload).map((key) => [key, payload[key]] as const),
    ...["max_batch_items", "max_text_chars"].filter((key) => key in payload).map((key) => [key, payload[key]] as const),
  ];
  if (present.length === 0) return null;
  return (
    <Grid container spacing={2} sx={{ mb: 2 }}>
      {present.map(([key, value]) => (
        <Grid key={key} size={{ xs: 6, sm: 3 }}>
          <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase" }}>
            {key.replace(/_/g, " ")}
          </Typography>
          <Typography variant="h6">{String(value)}</Typography>
        </Grid>
      ))}
    </Grid>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box sx={{ mb: 2 }}>
      <Typography
        sx={{
          fontSize: "0.74rem",
          fontWeight: 600,
          letterSpacing: "0.8px",
          textTransform: "uppercase",
          color: "text.secondary",
          mb: 0.5,
        }}
      >
        {title}
      </Typography>
      {children}
    </Box>
  );
}

function ProviderMapBlock({ payload }: { payload: Record<string, unknown> }) {
  const providers = asRecord(payload.providers);
  const entries = Object.entries(providers);
  if (entries.length === 0) return null;
  const down = entries.filter(([, ok]) => ok === false).map(([name]) => name);
  return (
    <Section title="Providers">
      <DataTable
        rows={entries.map(([name, ok]) => ({ provider: name, reachable: ok }))}
        columns={[{ key: "provider", label: "provider" }, { key: "reachable", label: "reachable" }]}
      />
      {down.length > 0 && <Alert severity="warning" sx={{ mt: 1 }}>Unreachable: {down.join(", ")}</Alert>}
    </Section>
  );
}

export function CapabilitiesSummary({ payload }: { payload: unknown }) {
  const body = asRecord(payload);
  if (Object.keys(body).length === 0) return null;

  const tiers = Array.isArray(body.tiers) ? (body.tiers as Record<string, unknown>[]) : [];
  const languages = Array.isArray(body.supported_languages) ? (body.supported_languages as string[]) : [];
  const handled = new Set([...HEADLINE_KEYS, "max_batch_items", "max_text_chars", "tiers", "supported_languages", "providers"]);
  const unavailable = tiers.filter((t) => t.enabled && !t.available).map((t) => String(t.tier));

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Facts payload={body} />

      {tiers.length > 0 && (
        <Section title="Tiers">
          <DataTable
            rows={tiers.map((t) => ({
              tier: t.tier,
              enabled: t.enabled,
              available: t.available,
              "model version": t.model_version || "—",
              detail: detailText(t.detail),
            }))}
          />
          {unavailable.length > 0 && (
            <Alert severity="warning" sx={{ mt: 1 }}>
              Enabled but unavailable: {unavailable.join(", ")}. The ladder will stop below these
              rungs.
            </Alert>
          )}
        </Section>
      )}

      {languages.length > 0 && (
        <Section title="Supported languages">
          <Typography variant="body2">{languages.map((l) => `\`${l}\``).join(", ")}</Typography>
        </Section>
      )}

      <ProviderMapBlock payload={body} />

      {Object.entries(body).map(([key, value]) => {
        if (handled.has(key)) return null;
        if (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0) {
          const record = value as Record<string, unknown>;
          return (
            <Section key={key} title={key.replace(/_/g, " ")}>
              <DataTable
                rows={Object.entries(record).map(([k, v]) => ({
                  setting: k.replace(/_/g, " "),
                  value: typeof v === "object" ? detailText(v) : JSON.stringify(v),
                }))}
              />
            </Section>
          );
        }
        if (Array.isArray(value) && value.length > 0 && value.every((v) => typeof v !== "object")) {
          return (
            <Section key={key} title={key.replace(/_/g, " ")}>
              <Typography variant="body2">{value.map((item) => `\`${item}\``).join(", ")}</Typography>
            </Section>
          );
        }
        return null;
      })}
    </Paper>
  );
}

export function ReadinessSummary({ payload }: { payload: unknown }) {
  const body = asRecord(payload);
  if (Object.keys(body).length === 0) return null;

  const facts: [string, string][] = [];
  if ("status" in body) facts.push(["Status", String(body.status)]);
  if ("ready" in body) facts.push(["Ready", body.ready ? "yes" : "no"]);
  for (const key of ["service", "version", "checked_at"]) {
    if (key in body) facts.push([key.replace(/_/g, " "), String(body[key])]);
  }

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      {facts.length > 0 && (
        <Grid container spacing={2} sx={{ mb: 2 }}>
          {facts.map(([label, value]) => (
            <Grid key={label} size={{ xs: 6, sm: 3 }}>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase" }}>
                {label}
              </Typography>
              <Typography variant="h6">{value}</Typography>
            </Grid>
          ))}
        </Grid>
      )}

      <ProviderMapBlock payload={body} />

      {["components", "dependencies"].map((key) => {
        const rows = body[key];
        if (!Array.isArray(rows) || rows.length === 0) return null;
        const notReady = rows
          .filter((r) => r.ready === false || r.reachable === false)
          .map((r) => String(r.name ?? r.service ?? "?"));
        return (
          <Section key={key} title={key}>
            <DataTable rows={rows} />
            {notReady.length > 0 && (
              <Alert severity="warning" sx={{ mt: 1 }}>
                Not ready: {notReady.join(", ")}
              </Alert>
            )}
          </Section>
        );
      })}
    </Paper>
  );
}
