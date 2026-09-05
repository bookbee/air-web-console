"use client";

import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";

/** A plain data table for arbitrary rows of mixed-shape objects. A browser
 * table has no column-typing problem — any JS value stringifies fine in a
 * `<TableCell>`, whatever shape a given row happens to be. */
export function DataTable({
  rows,
  columns,
}: {
  rows: Record<string, unknown>[];
  /** Explicit column order + labels; defaults to the keys of the first row. */
  columns?: { key: string; label: string }[];
}) {
  if (rows.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ fontStyle: "italic" }}>
        No rows.
      </Typography>
    );
  }
  const cols = columns ?? Object.keys(rows[0]).map((key) => ({ key, label: key }));

  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          {cols.map((col) => (
            <TableCell key={col.key}>{col.label}</TableCell>
          ))}
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((row, index) => (
          <TableRow key={index}>
            {cols.map((col) => (
              <TableCell key={col.key} sx={{ fontFamily: "monospace", fontSize: "0.8rem" }}>
                {formatCell(row[col.key])}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
