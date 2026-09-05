"use client";

import Divider from "@mui/material/Divider";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { useState } from "react";

import type { Connection } from "@/lib/connection";

import { HistoryPanel } from "./HistoryPanel";
import { ProbePanel } from "./ProbePanel";

/** Health, readiness and capabilities for all three services — ported from
 * `tabs/system.py`. */
export function SystemTab({
  classifier,
  llm,
  platformCustomer,
  platformBusiness,
}: {
  classifier: Connection;
  llm: Connection;
  platformCustomer: Connection;
  platformBusiness: Connection;
}) {
  const [channel, setChannel] = useState<"customer" | "business">("customer");
  const platformConnection = channel === "customer" ? platformCustomer : platformBusiness;

  return (
    <div>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Liveness, readiness and the tier inventory for whichever environment the sidebar is
        pointed at. Check here first when a request behaves oddly — a rung that is enabled but
        unavailable explains most surprises.
      </Typography>

      <SectionTitle>air-classifier</SectionTitle>
      <ProbePanel connection={classifier} slot="system-classifier" />

      <Divider sx={{ my: 3 }} />

      <SectionTitle>air-llm</SectionTitle>
      <ProbePanel connection={llm} slot="system-llm" />

      <Divider sx={{ my: 3 }} />

      <SectionTitle>air-platform</SectionTitle>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
        The same probes against the platform base URL. <code>/v1/capabilities</code> answers per
        channel — guardrails, routes and quotas are profile-specific — so the channel here is the
        key the probe is sent with.
      </Typography>
      <ToggleButtonGroup
        value={channel}
        exclusive
        size="small"
        onChange={(_, value) => value && setChannel(value)}
        sx={{ mb: 1.5 }}
      >
        <ToggleButton value="customer">customer</ToggleButton>
        <ToggleButton value="business">business</ToggleButton>
      </ToggleButtonGroup>
      <ProbePanel connection={platformConnection} slot={`system-platform-${channel}`} />

      <Divider sx={{ my: 3 }} />

      <HistoryPanel />
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      sx={{
        fontSize: "0.74rem",
        fontWeight: 600,
        letterSpacing: "0.8px",
        textTransform: "uppercase",
        color: "text.secondary",
        mb: 1,
      }}
    >
      {children}
    </Typography>
  );
}
