"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

import { DataTable } from "@/components/shared/DataTable";

import { isAvailable, type Capabilities } from "./data";

/** What each model choice means for this console, from the gateway's own
 * `GET /v1/capabilities`: the chain behind every class (in the order tried,
 * per-service overrides applied) and every published embedding name. Rows
 * the gateway can't serve here (`available: false`) are flagged: `allowed`
 * is the policy's answer alone. */
export function ModelChoices({ capabilities }: { capabilities: Capabilities }) {
  const configured = capabilities.providers ?? {};
  const unconfigured = (rung: string) => configured[rung.split(":")[0]] === false;

  const classRows = Object.entries(capabilities.generate ?? {}).map(([name, entry]) => ({
    class: name,
    allowed: entry.allowed,
    available: entry.available ?? "—",
    chain: entry.chain.map((rung) => (unconfigured(rung) ? `${rung} (not configured)` : rung)).join(" → "),
  }));
  const embedRows = Object.entries(capabilities.embed ?? {}).map(([name, spec]) => ({
    name,
    allowed: spec.allowed,
    model: `${spec.provider}:${spec.model}`,
    dimensions: spec.dimensions,
    available: isAvailable(capabilities, spec),
  }));
  const deadEmbeds = embedRows.filter((row) => row.allowed && !row.available).map((row) => row.name);

  return (
    <Box>
      <Typography variant="body2" sx={{ mb: 1 }}>
        environment <b>{capabilities.environment ?? "—"}</b> · may pin <b>{String(capabilities.may_pin)}</b> ·
        preferred providers <b>{capabilities.preferred_providers ? capabilities.preferred_providers.join(", ") : "any the class offers"}</b>
      </Typography>
      <DataTable rows={classRows} />
      <Box sx={{ mt: 1.5 }}>
        <DataTable rows={embedRows} />
      </Box>
      {deadEmbeds.length > 0 && (
        <Alert severity="warning" sx={{ mt: 1 }}>
          Allowed, but its one provider isn&apos;t configured on this gateway, so every call fails:{" "}
          {deadEmbeds.join(", ")}.
        </Alert>
      )}
    </Box>
  );
}
