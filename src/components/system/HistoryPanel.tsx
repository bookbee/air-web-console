"use client";

import DownloadIcon from "@mui/icons-material/Download";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { DataTable } from "@/components/shared/DataTable";
import { exchangeRequestId } from "@/lib/http/exchange";
import { useHistoryStore } from "@/store/historyStore";

/** Every call this session made, newest first. Persisted across reloads
 * (see `historyStore.ts`), so the log survives a page refresh instead of
 * vanishing. */
export function HistoryPanel() {
  const entries = useHistoryStore((state) => state.entries);
  const clear = useHistoryStore((state) => state.clear);

  const rows = entries.map((entry) => ({
    method: entry.exchange.method,
    url: entry.exchange.url,
    status: entry.exchange.error === null ? String(entry.exchange.statusCode) : "network error",
    ms: Math.round(entry.exchange.elapsedMs),
    "request id": exchangeRequestId(entry.exchange) ?? "",
  }));

  const download = () => {
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "air-web-history.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Box>
      <Typography
        sx={{
          fontSize: "0.74rem",
          fontWeight: 600,
          letterSpacing: "0.8px",
          textTransform: "uppercase",
          color: "text.secondary",
          mb: 0.5,
        }}
      >
        Recent calls
      </Typography>
      {rows.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Nothing sent yet this session.
        </Typography>
      ) : (
        <>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
            Every call this session made, newest first, whichever target it went to.
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
            <Button size="small" onClick={clear}>
              Clear history
            </Button>
            <Button size="small" startIcon={<DownloadIcon />} onClick={download}>
              Download log
            </Button>
          </Stack>
          <DataTable rows={rows} />
        </>
      )}
    </Box>
  );
}
