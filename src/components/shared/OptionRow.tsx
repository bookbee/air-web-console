"use client";

import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import Typography from "@mui/material/Typography";

/**
 * One row of the "tick to send" options editor every tab uses — ported from
 * the `row = st.columns([1, 2]); if row[0].checkbox(...): … else: …`
 * pattern repeated across `tabs/*.py`.
 *
 * `Options.model_fields_set` is load-bearing server-side: an unticked
 * option must be omitted from the JSON body entirely, never sent at its
 * default value. So this component's only job is presenting that choice —
 * the caller (each tab's options editor) decides what "enabled" means for
 * the request body it builds.
 */
export function OptionRow({
  label,
  enabled,
  onToggle,
  defaultCaption,
  children,
}: {
  label: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  defaultCaption: string;
  children: React.ReactNode;
}) {
  return (
    <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.5, py: 0.75 }}>
      <Box sx={{ minWidth: 180, pt: 0.75 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
          <Checkbox
            size="small"
            checked={enabled}
            onChange={(event) => onToggle(event.target.checked)}
            sx={{ p: 0.5 }}
          />
          <Typography component="span" variant="body2" sx={{ fontFamily: "monospace" }}>
            {label}
          </Typography>
        </label>
      </Box>
      <Box sx={{ flex: 1 }}>
        {enabled ? (
          children
        ) : (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", pt: 1 }}>
            {defaultCaption}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
