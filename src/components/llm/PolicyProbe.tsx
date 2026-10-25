"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";

import { DataTable } from "@/components/shared/DataTable";
import { ResponseView } from "@/components/shared/ResponseView";
import { useSendRequest } from "@/hooks/useSendRequest";
import type { Connection } from "@/lib/connection";
import type { Exchange } from "@/lib/http/exchange";

/** An unset choice list means every choice routing.yaml offers. */
const list = (value: unknown): string => (Array.isArray(value) ? value.join(", ") : "all");

/** One row per service grant — the part of `PolicyDoc` a tester actually
 * reads. The raw JSON stays one tab over in the response pane. */
function PolicySummary({ payload }: { payload: unknown }) {
  const doc = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const services = doc.services && typeof doc.services === "object" ? (doc.services as Record<string, Record<string, unknown>>) : {};
  const rows = Object.entries(services).map(([service, policy]) => {
    const resources = (policy.resources ?? {}) as Record<string, string[]>;
    return {
      service,
      grants: Object.entries(resources).map(([resource, actions]) => `${resource}: ${actions.join(", ")}`).join(" · "),
      "rate/min": policy.rate_per_minute ?? `${String(doc.default_rate_per_minute)} (default)`,
      classes: list(policy.model_classes),
      "embed models": list(policy.embed_models),
      "preferred providers": list(policy.preferred_providers),
      pin: policy.pin === true,
      "daily budget": policy.daily_budget_usd ?? "—",
    };
  });
  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography variant="body2" sx={{ mb: 1 }}>
        default_allow: <b>{String(doc.default_allow)}</b>
        {doc.default_allow ? " — any grant not listed below is allowed too (local only)." : ""}
        {" "}· provider quotas:{" "}
        <b>
          {Object.entries((doc.provider_quotas ?? {}) as Record<string, number>)
            .map(([provider, perMinute]) => `${provider} ${perMinute}/min`)
            .join(", ") || "none"}
        </b>
      </Typography>
      <DataTable rows={rows} />
    </Box>
  );
}

/** `GET /v1/admin/policy` — the gateway's whole effective policy, every
 * service's grants. Ported from `_policy_probe`. */
export function PolicyProbe({ connection }: { connection: Connection }) {
  const mutation = useSendRequest(connection);
  const disabled = !connection.baseUrl.trim();

  return (
    <div>
      <Typography
        sx={{ fontSize: "0.74rem", fontWeight: 600, letterSpacing: "0.8px", textTransform: "uppercase", color: "text.secondary", mb: 0.5 }}
      >
        Gateway policy
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
        <code>GET /v1/admin/policy</code> — every service&apos;s grants, rate limit, model-choice
        grants, pin and budget settings, as the gateway enforces them. Needs the <code>admin_read</code> grant,
        which this console holds; other services get a 403.
      </Typography>
      <Button variant="outlined" size="small" disabled={disabled} onClick={() => mutation.mutate({ path: "/v1/admin/policy" })}>
        Show policy
      </Button>
      {mutation.data && (
        <div style={{ marginTop: 12 }}>
          <ResponseView
            exchange={mutation.data as Exchange}
            storageKey="llm-policy"
            summary={(payload) => <PolicySummary payload={payload} />}
          />
        </div>
      )}
    </div>
  );
}
