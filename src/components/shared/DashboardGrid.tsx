"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useTheme, type Theme } from "@mui/material/styles";

import type { Kind } from "@/lib/format";

/**
 * The dense, ops-dashboard data grid every response summary is built from —
 * ported from `dashboard.py`. Several related facts share one monospace
 * row, the way a real ops panel (Datadog, Grafana) packs them; colour is
 * reserved for state actually worth a second look, not for decorating every
 * field regardless of whether it means anything.
 */

export interface Cell {
  label: string;
  value: string;
  kind?: Kind;
}

export type Row = Cell[];

export function DashboardGrid({
  title,
  rows,
  empty = "No data in this response.",
}: {
  title: string;
  rows: Row[] | null | undefined;
  empty?: string;
}) {
  const theme = useTheme();

  return (
    <Box
      sx={{
        border: 1,
        borderColor: "divider",
        borderRadius: 1.5,
        overflow: "hidden",
        mb: 1.5,
        bgcolor: "background.default",
      }}
    >
      <Box
        sx={{
          bgcolor: "background.paper",
          px: 1.25,
          py: 0.5,
          fontSize: "0.68rem",
          fontWeight: 700,
          letterSpacing: "0.8px",
          textTransform: "uppercase",
          color: "text.secondary",
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        {title}
      </Box>
      {!rows || rows.length === 0 ? (
        <Box sx={{ px: 1.25, py: 1, color: "text.secondary", fontSize: "0.82rem", fontStyle: "italic" }}>
          {empty}
        </Box>
      ) : (
        rows.map((row, index) => (
          <Box
            key={index}
            sx={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "baseline",
              gap: 2.5,
              px: 1.25,
              py: 0.65,
              borderBottom: index < rows.length - 1 ? 1 : 0,
              borderColor: "divider",
            }}
          >
            {row.map((cell, cellIndex) => (
              <Box
                key={cellIndex}
                sx={{ display: "inline-flex", alignItems: "baseline", gap: 0.6, whiteSpace: "nowrap" }}
              >
                <Typography
                  component="span"
                  sx={{ fontFamily: theme.air.fontMono, fontSize: "0.72rem", color: "text.secondary" }}
                >
                  {cell.label}
                </Typography>
                <Typography
                  component="span"
                  sx={{
                    fontFamily: theme.air.fontMono,
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    color: cellColor(cell.kind, theme),
                  }}
                >
                  {cell.value}
                </Typography>
              </Box>
            ))}
          </Box>
        ))
      )}
    </Box>
  );
}

function cellColor(kind: Kind | undefined, theme: Theme): string {
  if (!kind) return theme.palette.text.primary;
  if (kind === "muted") return theme.palette.text.secondary;
  return theme.air.kind[kind];
}

/** The same header bar `DashboardGrid` uses, standalone — for a section
 * whose body is a real table rather than key/value rows. */
export function TableTitle({ title }: { title: string }) {
  return (
    <Box
      sx={{
        bgcolor: "background.paper",
        px: 1.25,
        py: 0.5,
        fontSize: "0.68rem",
        fontWeight: 700,
        letterSpacing: "0.8px",
        textTransform: "uppercase",
        color: "text.secondary",
        border: 1,
        borderColor: "divider",
        borderRadius: "6px 6px 0 0",
        mt: 1.5,
      }}
    >
      {title}
    </Box>
  );
}
