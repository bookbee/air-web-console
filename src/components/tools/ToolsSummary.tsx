"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";

import { DashboardGrid, type Row } from "@/components/shared/DashboardGrid";
import type { Exchange } from "@/lib/http/exchange";

import { routeOf } from "./data";

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const str = (value: unknown): string => (typeof value === "string" ? value : value == null ? "—" : JSON.stringify(value));
const money = (value: unknown): string => {
  const m = record(value);
  return m.amount === undefined ? "—" : `${str(m.amount)} ${str(m.currency)}`;
};
const yesNo = (value: unknown): string => (value === true ? "yes" : value === false ? "no" : "—");

/** The answer in the customer's terms: orders, one order, a proposal, an
 * execution. What the orchestrator would word its reply from. */
export function ToolsSummary({ exchange }: { exchange: Exchange }) {
  const body = record(exchange.responseJson);
  const { route, name } = routeOf(new URL(exchange.url, "http://x").pathname);

  if (route === "tool") {
    const data = record(body.data);
    const list = Array.isArray(data.orders) ? (data.orders as Record<string, unknown>[]) : null;
    const meta: Row = [
      { label: "capability", value: str(body.capability) },
      { label: "as of", value: str(body.as_of), kind: "muted" },
      { label: "truncated", value: yesNo(body.truncated), kind: body.truncated ? "warn" : undefined },
    ];
    if (list) {
      return (
        <Box>
          <DashboardGrid title={name ?? "tool"} rows={[meta]} />
          <Table size="small">
            <TableHead>
              <TableRow>
                {["order", "placed", "status", "total", "expected", "cancellable"].map((h) => (
                  <TableCell key={h}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {list.map((o) => (
                <TableRow key={str(o.order_id)}>
                  <TableCell sx={{ fontFamily: "monospace" }}>{str(o.order_id)}</TableCell>
                  <TableCell>{str(o.placed_at)}</TableCell>
                  <TableCell>{str(o.status)}</TableCell>
                  <TableCell>{money(o.total)}</TableCell>
                  <TableCell>{str(o.expected_delivery)}</TableCell>
                  <TableCell>{yesNo(o.cancellable)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      );
    }
    const items = Array.isArray(data.items) ? (data.items as Record<string, unknown>[]) : [];
    const tracking = record(data.tracking);
    return (
      <DashboardGrid
        title={name ?? "tool"}
        rows={[
          meta,
          [
            { label: "order", value: str(data.order_id) },
            { label: "status", value: str(data.status) },
            { label: "total", value: money(data.total) },
            { label: "expected", value: str(data.expected_delivery) },
          ],
          [
            { label: "cancellable", value: yesNo(data.cancellable), kind: data.cancellable ? "ok" : undefined },
            { label: "returnable", value: yesNo(data.returnable) },
            { label: "tracking", value: data.tracking ? `${str(tracking.carrier)} · ${str(tracking.status)}` : "none" },
          ],
          ...items.map((item): Row => [
            { label: "item", value: str(item.name) },
            { label: "qty", value: str(item.qty) },
            { label: "price", value: money(item.price) },
          ]),
        ]}
      />
    );
  }

  if (route === "propose") {
    const preview = record(body.preview);
    return (
      <Box>
        <Alert severity="info" sx={{ mb: 1 }}>
          <b>Nothing has changed.</b> {str(body.summary)}
        </Alert>
        <DashboardGrid
          title="proposal"
          rows={[
            [
              { label: "proposal_id", value: str(body.proposal_id) },
              { label: "risk", value: str(body.risk), kind: body.risk === "high" ? "warn" : undefined },
              { label: "expires", value: str(body.expires_at), kind: "muted" },
            ],
            [
              { label: "order", value: str(preview.order_id) },
              { label: "refund", value: money(preview.refund) },
            ],
          ]}
        />
      </Box>
    );
  }

  if (route === "execute") {
    const result = record(body.result);
    const status = str(body.status);
    return (
      <DashboardGrid
        title="execution"
        rows={[
          [
            { label: "status", value: status, kind: status === "done" ? "ok" : status === "rejected" ? "err" : "warn" },
            { label: "execution_id", value: str(body.execution_id) },
            ...(body.code ? [{ label: "code", value: str(body.code), kind: "err" as const }] : []),
          ],
          ...(body.result
            ? [
                [
                  { label: "order", value: str(result.order_id) },
                  { label: "refund", value: money(result.refund) },
                  { label: "eta (business days)", value: str(record(result.refund).eta_business_days) },
                ] as Row,
              ]
            : []),
        ]}
      />
    );
  }

  return null;
}
