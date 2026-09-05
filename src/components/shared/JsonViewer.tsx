"use client";

import Box from "@mui/material/Box";
import { useTheme } from "@mui/material/styles";

import { CopyButton } from "./CopyButton";

/** A monospace, pre-formatted JSON block with a copy affordance — the
 * console's stand-in for `st.json`/`st.code`. */
export function JsonViewer({ value, maxHeight = 480 }: { value: unknown; maxHeight?: number }) {
  const theme = useTheme();
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);

  return (
    <Box sx={{ position: "relative" }}>
      <Box sx={{ position: "absolute", top: 6, right: 6 }}>
        <CopyButton value={text} />
      </Box>
      <Box
        component="pre"
        sx={{
          m: 0,
          p: 1.25,
          pr: 5,
          bgcolor: theme.air.codeBg,
          border: 1,
          borderColor: "divider",
          borderRadius: 1.5,
          fontFamily: theme.air.fontMono,
          fontSize: "0.82rem",
          lineHeight: 1.5,
          overflow: "auto",
          maxHeight,
          whiteSpace: "pre",
        }}
      >
        {text}
      </Box>
    </Box>
  );
}
