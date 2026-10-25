"use client";

import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";

import { PROVIDERS, type Capabilities } from "./data";

/** One line that says which gateway answers this tab: its build, its
 * environment, and which of the providers it fronts are configured, all
 * from `GET /v1/capabilities`. */
export function GatewayStatus({ capabilities }: { capabilities: Capabilities }) {
  const configured = capabilities.providers ?? {};
  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 0.75, mb: 1.5 }}>
      <Typography variant="body2" sx={{ mr: 0.5 }}>
        air-model-gateway <b>{capabilities.version ?? "—"}</b>
        {capabilities.revision ? <> · build <code>{capabilities.revision}</code></> : null} · environment{" "}
        <b>{capabilities.environment ?? "—"}</b> · providers:
      </Typography>
      {PROVIDERS.map((provider) => {
        const on = configured[provider] === true;
        return (
          <Chip
            key={provider}
            size="small"
            variant="outlined"
            color={on ? "success" : "default"}
            label={on ? provider : `${provider}: not configured`}
            sx={on ? undefined : { color: "text.disabled" }}
          />
        );
      })}
    </Box>
  );
}
