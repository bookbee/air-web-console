"use client";

import Chip from "@mui/material/Chip";
import { useTheme } from "@mui/material/styles";

export type BadgeKind = "positive" | "negative" | "neutral" | "mixed" | "unknown";

/** Inline verdict label — sentiment, urgency — ported from `theme.py`'s
 * `badge()`. */
export function Badge({ label, kind }: { label: string; kind: BadgeKind }) {
  const theme = useTheme();
  const tokens = theme.air.badge[kind];
  return (
    <Chip
      label={label}
      size="small"
      variant="outlined"
      sx={{
        bgcolor: tokens.bg,
        borderColor: tokens.line,
        color: tokens.ink,
        fontWeight: 600,
        borderStyle: kind === "unknown" ? "dashed" : "solid",
      }}
    />
  );
}
