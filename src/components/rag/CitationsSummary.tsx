"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Collapse from "@mui/material/Collapse";
import LinearProgress from "@mui/material/LinearProgress";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { useState } from "react";

import { DashboardGrid, TableTitle } from "@/components/shared/DashboardGrid";
import type { Exchange } from "@/lib/http/exchange";

import { citationRows, type CitationRow } from "./data";

function CitationLine({ row }: { row: CitationRow }) {
  const [open, setOpen] = useState(false);
  const score = Number.isFinite(row.score) ? row.score : 0;
  return (
    <>
      <TableRow hover onClick={() => setOpen(!open)} sx={{ cursor: "pointer", "& > td": { borderBottom: open ? 0 : undefined } }}>
        <TableCell sx={{ fontFamily: "monospace" }}>{row.rank}</TableCell>
        <TableCell>
          <Typography variant="body2" sx={{ fontFamily: "monospace", fontWeight: 600 }}>
            {row.source}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            chunk {row.chunk ?? "—"}
          </Typography>
        </TableCell>
        <TableCell sx={{ minWidth: 120 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <LinearProgress variant="determinate" value={Math.max(0, Math.min(1, score)) * 100} sx={{ flex: 1, height: 6, borderRadius: 1 }} />
            <Typography variant="caption" sx={{ fontFamily: "monospace" }}>
              {Number.isFinite(row.score) ? row.score.toFixed(3) : "—"}
            </Typography>
          </Box>
        </TableCell>
        <TableCell sx={{ display: { xs: "none", md: "table-cell" } }}>
          <Typography variant="body2">{row.title || "—"}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ wordBreak: "break-all" }}>
            {row.uri}
          </Typography>
        </TableCell>
        <TableCell sx={{ fontFamily: "monospace", fontSize: "0.8rem", color: row.leak ? "error.main" : undefined }}>
          {row.tenant || "—"} · {row.status || "—"}
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={5} sx={{ py: 0 }}>
          <Collapse in={open} unmountOnExit>
            <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", py: 1 }}>
              {row.snippet}
            </Typography>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}

/** A retrieve answer: the citations best first, each checked for isolation
 * against the key's tenant. An empty list is a real answer, said plainly. */
export function CitationsSummary({ exchange, tenant }: { exchange: Exchange; tenant: string }) {
  const rows = citationRows(exchange.responseJson, tenant);
  const leaks = rows.filter((row) => row.leak);
  const documents = new Set(rows.map((row) => row.source));
  const top = rows[0];

  return (
    <Box>
      <DashboardGrid
        title="Retrieval"
        rows={[
          [
            { label: "citations", value: String(rows.length) },
            { label: "documents", value: String(documents.size) },
            { label: "top", value: top ? `${top.source} (${top.score.toFixed(3)})` : "—" },
            { label: "tenant expected", value: tenant },
            { label: "isolation", value: leaks.length ? `${leaks.length} leak${leaks.length === 1 ? "" : "s"}` : "ok", kind: leaks.length ? "err" : "ok" },
            { label: "latency", value: `${exchange.elapsedMs.toFixed(0)} ms`, kind: "muted" },
          ],
        ]}
      />
      {leaks.length > 0 && (
        <Alert severity="error" sx={{ mb: 1.5 }}>
          Isolation broken: {leaks.map((row) => `#${row.rank} ${row.source} (${row.leak})`).join("; ")}. File it under{" "}
          <code>bugs/rag/</code>.
        </Alert>
      )}
      {rows.length === 0 ? (
        <Alert severity="info">
          No citations (honest empty result): nothing in this key&apos;s tenant matched. If the index is empty
          (see the status line above), start the service with <code>make run-sit</code>.
        </Alert>
      ) : (
        <>
          <TableTitle title="Citations · click a row for its snippet" />
          <Table size="small" sx={{ border: 1, borderTop: 0, borderColor: "divider" }}>
            <TableHead>
              <TableRow>
                <TableCell>#</TableCell>
                <TableCell>source</TableCell>
                <TableCell>score</TableCell>
                <TableCell sx={{ display: { xs: "none", md: "table-cell" } }}>title / uri</TableCell>
                <TableCell>tenant · status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <CitationLine key={`${row.rank}-${row.source}-${row.chunk}`} row={row} />
              ))}
            </TableBody>
          </Table>
        </>
      )}
    </Box>
  );
}
