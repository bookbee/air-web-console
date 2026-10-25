"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import LinearProgress from "@mui/material/LinearProgress";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";

import type { SseEvent } from "@/lib/http/exchange";

import { foldStream } from "./stream";

/** A `/v1/generate` stream while it is still arriving: the answer so far,
 * refolded on every frame. Replaced by the usual response pane, built from
 * the finished Exchange, once the stream closes. */
export function LiveAnswer({ frames }: { frames: readonly SseEvent[] }) {
  const theme = useTheme();
  const folded = foldStream(frames);
  const facts = folded.stream;
  const content = String(folded.content ?? "");
  const source = [folded.provider, folded.model].filter(Boolean).join(" / ");

  return (
    <Box>
      <LinearProgress sx={{ mb: 1 }} />
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
        {facts.started ? `Streaming live from ${source || "the gateway"}` : "Waiting for the first frame…"}
        {facts.deltas > 0 && ` · ${facts.deltas} deltas · first at ${facts.firstDeltaMs ?? "—"} ms`}
      </Typography>
      <Box
        sx={{
          p: 1.5,
          minHeight: 64,
          border: 1,
          borderColor: "divider",
          borderRadius: 1,
          fontFamily: theme.air.fontMono,
          fontSize: "0.85rem",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {content}
        <Box component="span" sx={{ color: "text.secondary" }}>
          ▍
        </Box>
      </Box>
      {facts.error && (
        <Alert severity="error" sx={{ mt: 1.5 }}>
          Interrupted after it started: <code>{facts.error}</code>
        </Alert>
      )}
    </Box>
  );
}
