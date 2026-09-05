"use client";

import DownloadIcon from "@mui/icons-material/Download";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import { useState } from "react";

import {
  displayHeaders,
  exchangeOk,
  exchangeRequestId,
  exchangeServerLatencyMs,
  toCurl,
  type Exchange,
} from "@/lib/http/exchange";

import { JsonViewer } from "./JsonViewer";

/**
 * The response pane shared by every tab — Postman's split: a status line
 * you can read at a glance, then the body, the headers, and the request
 * that produced them. Ported from `components/response_view.py`. The
 * optional `summary` renders the decoded domain object above the raw JSON.
 */

interface ProblemDetail {
  title?: string;
  detail?: string;
  errors?: { field?: string; message?: string; code?: string }[];
}

function pillTone(exchange: Exchange): "ok" | "warn" | "err" {
  if (exchange.error !== null) return "err";
  const code = exchange.statusCode ?? 0;
  if (code < 400) return "ok";
  return code < 500 ? "warn" : "err";
}

function pillLabel(exchange: Exchange): string {
  if (exchange.error !== null) return "NETWORK ERROR";
  return `${exchange.statusCode ?? "—"} ${exchange.reason}`.trim();
}

function StatusBar({ exchange }: { exchange: Exchange }) {
  const theme = useTheme();
  const tone = pillTone(exchange);
  const requestId = exchangeRequestId(exchange);
  const serverMs = exchangeServerLatencyMs(exchange);
  let path = exchange.url;
  try {
    path = new URL(exchange.url).pathname;
  } catch {
    // Keep the raw url if it isn't a valid absolute URL.
  }

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 1,
        px: 1.25,
        py: 1,
        border: 1,
        borderColor: "divider",
        borderRadius: 1.5,
        bgcolor: "background.paper",
        mb: 1.5,
      }}
    >
      <Typography sx={{ fontFamily: theme.air.fontMono, fontSize: "0.82rem", color: "text.secondary" }}>
        <b>{exchange.method}</b> {path}
      </Typography>
      <Box
        sx={{
          px: 1,
          py: 0.15,
          borderRadius: 999,
          fontSize: "0.78rem",
          fontWeight: 600,
          color: theme.palette.getContrastText(
            tone === "ok"
              ? theme.palette.success.main
              : tone === "warn"
                ? theme.palette.warning.main
                : theme.palette.error.main,
          ),
          bgcolor:
            tone === "ok" ? "success.main" : tone === "warn" ? "warning.main" : "error.main",
        }}
      >
        {pillLabel(exchange)}
      </Box>
      <Typography sx={{ fontFamily: theme.air.fontMono, fontSize: "0.82rem", color: "text.secondary" }}>
        round trip <b>{exchange.elapsedMs.toFixed(0)} ms</b>
      </Typography>
      {serverMs !== null && (
        <Typography sx={{ fontFamily: theme.air.fontMono, fontSize: "0.82rem", color: "text.secondary" }}>
          service <b>{serverMs.toFixed(0)} ms</b>
        </Typography>
      )}
      {requestId && (
        <Typography sx={{ fontFamily: theme.air.fontMono, fontSize: "0.82rem", color: "text.secondary" }}>
          {requestId}
        </Typography>
      )}
    </Box>
  );
}

function ProblemDetailView({ payload }: { payload: ProblemDetail }) {
  return (
    <Box sx={{ mb: 1.5 }}>
      <Alert severity="error">
        <b>{payload.title}</b>
        {payload.detail ? <><br />{payload.detail}</> : null}
      </Alert>
      {payload.errors && payload.errors.length > 0 && (
        <Table size="small" sx={{ mt: 1 }}>
          <TableHead>
            <TableRow>
              <TableCell>field</TableCell>
              <TableCell>message</TableCell>
              <TableCell>code</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {payload.errors.map((error, index) => (
              <TableRow key={index}>
                <TableCell>{error.field ?? ""}</TableCell>
                <TableCell>{error.message ?? ""}</TableCell>
                <TableCell>{error.code ?? ""}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Box>
  );
}

function HeadersTable({ title, headers }: { title: string; headers: Record<string, string> }) {
  const rows = Object.entries(headers).sort(([a], [b]) => a.localeCompare(b));
  return (
    <Box sx={{ mb: 2 }}>
      <Typography sx={{ fontWeight: 600, fontSize: "0.85rem", mb: 0.5 }}>{title}</Typography>
      <Table size="small">
        <TableBody>
          {rows.map(([name, value]) => (
            <TableRow key={name}>
              <TableCell sx={{ width: "30%", fontFamily: "monospace" }}>{name}</TableCell>
              <TableCell sx={{ fontFamily: "monospace", wordBreak: "break-all" }}>{value}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

function downloadJson(value: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function ResponseView({
  exchange,
  storageKey,
  summary,
}: {
  exchange: Exchange;
  storageKey: string;
  summary?: (payload: unknown, exchange: Exchange) => React.ReactNode;
}) {
  const [tab, setTab] = useState(0);
  const [reveal, setReveal] = useState(false);

  const hasSummaryContent =
    Boolean(summary) && exchangeOk(exchange) && (exchange.responseJson !== null || (exchange.isStream && exchange.events.length > 0));
  const tabNames = hasSummaryContent ? ["Summary", "Response", "Headers", "Request"] : ["Response", "Headers", "Request"];

  if (exchange.error !== null) {
    return (
      <Box>
        <StatusBar exchange={exchange} />
        <Alert severity="error">{exchange.error}</Alert>
        <Box sx={{ mt: 1.5 }}>
          <Typography sx={{ fontWeight: 600, fontSize: "0.85rem", mb: 0.5 }}>
            Request that failed
          </Typography>
          <JsonViewer value={toCurl(exchange, false)} />
        </Box>
      </Box>
    );
  }

  const summaryPayload = exchange.isStream ? exchange : exchange.responseJson;

  return (
    <Box>
      <StatusBar exchange={exchange} />
      {!exchangeOk(exchange) && isProblemDetail(exchange.responseJson) && (
        <ProblemDetailView payload={exchange.responseJson} />
      )}

      <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ mb: 1.5 }}>
        {tabNames.map((name) => (
          <Tab key={name} label={name} />
        ))}
      </Tabs>

      {hasSummaryContent && tab === 0 && summary?.(summaryPayload, exchange)}

      {tabNames[tab] === "Response" && (
        <Box>
          {exchange.responseJson !== null ? (
            <>
              <JsonViewer value={exchange.responseJson} />
              <Button
                size="small"
                startIcon={<DownloadIcon />}
                sx={{ mt: 1 }}
                onClick={() => downloadJson(exchange.responseJson, `${storageKey}-response.json`)}
              >
                Download JSON
              </Button>
            </>
          ) : exchange.responseText ? (
            <JsonViewer value={exchange.responseText} />
          ) : (
            <Typography color="text.secondary" sx={{ fontStyle: "italic" }}>
              The service returned an empty body.
            </Typography>
          )}
        </Box>
      )}

      {tabNames[tab] === "Headers" && (
        <Box>
          <HeadersTable title="Response headers" headers={exchange.responseHeaders} />
          <HeadersTable title="Request headers" headers={displayHeaders(exchange.requestHeaders)} />
        </Box>
      )}

      {tabNames[tab] === "Request" && (
        <Box>
          <FormControlLabel
            control={<Checkbox checked={reveal} onChange={(event) => setReveal(event.target.checked)} />}
            label="Reveal API key"
          />
          <Box sx={{ position: "relative" }}>
            <JsonViewer value={toCurl(exchange, reveal)} />
          </Box>
          {exchange.requestBody !== null && exchange.requestBody !== undefined && (
            <Box sx={{ mt: 1.5 }}>
              <Typography sx={{ fontWeight: 600, fontSize: "0.85rem", mb: 0.5 }}>
                Request body as sent
              </Typography>
              <JsonViewer value={exchange.requestBody} />
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}

function isProblemDetail(value: unknown): value is ProblemDetail {
  return Boolean(value) && typeof value === "object" && "title" in (value as object);
}
