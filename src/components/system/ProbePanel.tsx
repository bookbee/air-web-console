"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useState } from "react";

import { ResponseView } from "@/components/shared/ResponseView";
import { TargetCaption } from "@/components/layout/TargetBar";
import { useSendRequest } from "@/hooks/useSendRequest";
import type { Connection } from "@/lib/connection";
import type { Exchange } from "@/lib/http/exchange";

import { CapabilitiesSummary, ReadinessSummary } from "./summaries";

const PROBES: { name: string; path: string }[] = [
  { name: "Health", path: "/v1/health" },
  { name: "Readiness", path: "/v1/ready" },
  { name: "Capabilities", path: "/v1/capabilities" },
];

function summaryFor(name: string) {
  if (name === "Capabilities") {
    return function CapabilitiesSummaryFor(payload: unknown) {
      return <CapabilitiesSummary payload={payload} />;
    };
  }
  if (name === "Readiness") {
    return function ReadinessSummaryFor(payload: unknown) {
      return <ReadinessSummary payload={payload} />;
    };
  }
  return undefined;
}

/** The probe buttons for one service, plus whatever the last one returned —
 * ported from `_probe_panel`. */
export function ProbePanel({ connection, slot }: { connection: Connection; slot: string }) {
  const mutation = useSendRequest(connection);
  const [lastProbe, setLastProbe] = useState<string>("Health");
  const disabled = !connection.baseUrl.trim();

  return (
    <Box>
      <TargetCaption connection={connection} />
      <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
        {PROBES.map(({ name, path }) => (
          <Button
            key={name}
            variant="outlined"
            size="small"
            disabled={disabled}
            onClick={() => {
              setLastProbe(name);
              mutation.mutate({ path });
            }}
          >
            {name}
          </Button>
        ))}
      </Stack>
      {disabled && (
        <Typography variant="caption" color="error">
          No base URL set for this service in the sidebar.
        </Typography>
      )}
      {mutation.data && (
        <ResponseView exchange={mutation.data as Exchange} storageKey={slot} summary={summaryFor(lastProbe)} />
      )}
    </Box>
  );
}
