"use client";

import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";

import { ResponseView } from "@/components/shared/ResponseView";
import { useSendRequest } from "@/hooks/useSendRequest";
import type { Connection } from "@/lib/connection";
import type { Exchange } from "@/lib/http/exchange";

/** `GET /v1/admin/policy` — what this key is actually scoped to. Ported
 * from `_policy_probe`. Rendered as raw JSON: `PolicyDoc`'s exact shape is
 * an admin-only implementation detail worth showing verbatim. */
export function PolicyProbe({ connection }: { connection: Connection }) {
  const mutation = useSendRequest(connection);
  const disabled = !connection.baseUrl.trim();

  return (
    <div>
      <Typography
        sx={{ fontSize: "0.74rem", fontWeight: 600, letterSpacing: "0.8px", textTransform: "uppercase", color: "text.secondary", mb: 0.5 }}
      >
        Your key&apos;s policy
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
        <code>GET /v1/admin/policy</code> — resources, actions and rate limit your key is scoped
        to. Requires the <code>admin_read</code> scope; most caller keys will get a 403 here.
      </Typography>
      <Button variant="outlined" size="small" disabled={disabled} onClick={() => mutation.mutate({ path: "/v1/admin/policy" })}>
        Check my policy
      </Button>
      {mutation.data && (
        <div style={{ marginTop: 12 }}>
          <ResponseView exchange={mutation.data as Exchange} storageKey="llm-policy" />
        </div>
      )}
    </div>
  );
}
