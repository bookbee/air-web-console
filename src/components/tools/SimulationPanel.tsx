"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { Fragment, useState } from "react";

import { ResponseView } from "@/components/shared/ResponseView";
import { connectionLabel, connectionLocation, isRemote, type Connection } from "@/lib/connection";
import { sendViaProxy } from "@/lib/http/client";
import type { Exchange } from "@/lib/http/exchange";
import { useHistoryStore } from "@/store/historyStore";

import { ConfirmWrite } from "./ConfirmWrite";
import { newContext, runSimulation, SIMULATIONS, tally, type Send, type SimOutcome, type Simulation } from "./data";
import { ToolsSummary } from "./ToolsSummary";

function verdict(outcome: SimOutcome | undefined) {
  if (!outcome) return null;
  const gap = outcome.simulation.group === "known gaps";
  if (outcome.skipped) return { color: "default" as const, label: `skipped: ${outcome.skipped}` };
  if (outcome.failure === null) return { color: gap ? ("info" as const) : ("success" as const), label: gap ? "pass: fix landed?" : "pass" };
  return { color: gap ? ("warning" as const) : ("error" as const), label: gap ? `open: ${outcome.failure}` : outcome.failure };
}

/** Orchestrator-style simulations against whichever air-tools-gateway the
 * sidebar targets, judged exactly as `make tools-check` judges them. Each
 * row is one or more steps (a propose feeding its execute, a replay compared
 * with the first answer); expand a row to see every step's request and
 * answer. Rows that need a chosen key go around the BFF, so only the
 * headless run sends them. */
export function SimulationPanel({ connection }: { connection: Connection }) {
  const remember = useHistoryStore((state) => state.remember);
  const [outcomes, setOutcomes] = useState<Record<string, SimOutcome>>({});
  const [running, setRunning] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [shown, setShown] = useState<Exchange | null>(null);
  const [pending, setPending] = useState<Simulation[] | null>(null);
  const remote = isRemote(connection);
  const fixture = connectionLocation(connection) === "local";
  const disabled = !connection.baseUrl.trim() || running !== null;

  const send: Send = async (request) => {
    const exchange = await sendViaProxy(connection, request.path, {
      method: request.method,
      body: request.body,
      idempotencyKey: request.idempotencyKey,
    });
    remember(connectionLabel(connection), exchange);
    return exchange;
  };

  const run = async (simulations: readonly Simulation[]) => {
    try {
      for (const simulation of simulations) {
        setRunning(simulation.id);
        const outcome = await runSimulation(simulation, send, newContext(fixture));
        setOutcomes((prev) => ({ ...prev, [simulation.id]: outcome }));
        setOpen(simulation.id);
        const last = outcome.steps.at(-1)?.exchanges[0];
        if (last) setShown(last);
      }
    } finally {
      setRunning(null);
    }
  };

  /** A write on a remote target asks first; everything else runs now. */
  const request = (simulations: Simulation[]) => {
    if (remote && simulations.some((s) => s.mutates)) setPending(simulations);
    else void run(simulations);
  };

  // Run all: never the headless rows, and never a write on a remote target.
  const runnable = SIMULATIONS.filter((s) => !s.direct && !(remote && s.mutates));
  const counts = tally(Object.values(outcomes));
  const ran = counts.total + counts.skipped + counts.gapsOpen + counts.gapsFixed.length;

  return (
    <Box>
      <Typography sx={{ fontSize: "0.74rem", fontWeight: 600, letterSpacing: "0.8px", textTransform: "uppercase", color: "text.secondary", mb: 0.5 }}>
        Simulations
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
        The console plays air-orchestrator-service: each row is a turn or a guardrail, one or more steps, each checked
        for its status, problem <code>code</code> and body. Every answer is also held to the contract&apos;s standing
        rules: problem+json from the closed code set, no URL or stack in <code>detail</code>, <code>X-Request-ID</code>{" "}
        echoed{fixture ? <>, and only the subject&apos;s own orders, at its own tenant&apos;s amounts, with no customer ids</> : null}.{" "}
        <b>conversations</b> execute real cancellations: in fixture mode they use up 55120 and 70011 until the gateway
        restarts, and later runs skip them.{" "}
        {fixture ? null : <><b>This target isn&apos;t local</b>, so fixture-bound rows are skipped and <b>Run all</b> leaves out every write. </>}
        <b>headless</b> rows send a chosen key (none, the wrong scope, another tenant&apos;s) or a body that isn&apos;t
        JSON, so only <code>make tools-check</code> runs them.
      </Typography>
      <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1.5, mb: 1 }}>
        <Button variant="contained" size="small" disabled={disabled} onClick={() => request(runnable)}>
          {running ? "Running…" : "Run all"}
        </Button>
        {ran > 0 && (
          <Typography variant="body2" color={counts.passed === counts.total ? "success.main" : "error.main"} data-testid="sim-tally">
            {counts.passed} / {counts.total} passed{counts.skipped ? ` · ${counts.skipped} skipped` : ""}
          </Typography>
        )}
        {counts.gapsOpen > 0 && (
          <Typography variant="body2" color="warning.main">
            · {counts.gapsOpen} known gap{counts.gapsOpen === 1 ? "" : "s"} still open (expected)
          </Typography>
        )}
        {counts.gapsFixed.length > 0 && (
          <Typography variant="body2" color="info.main">
            · now passing, verify and move out of known gaps: {counts.gapsFixed.join(", ")}
          </Typography>
        )}
      </Box>

      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>simulation</TableCell>
            <TableCell>steps</TableCell>
            <TableCell>result</TableCell>
            <TableCell sx={{ display: { xs: "none", md: "table-cell" } }}>what it checks</TableCell>
            <TableCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {SIMULATIONS.map((simulation) => {
            const outcome = outcomes[simulation.id];
            const v = verdict(outcome);
            const expanded = open === simulation.id && outcome;
            return (
              <Fragment key={simulation.id}>
                <TableRow
                  hover
                  selected={open === simulation.id}
                  onClick={() => outcome && setOpen(open === simulation.id ? null : simulation.id)}
                  sx={{ cursor: outcome ? "pointer" : "default" }}
                  data-testid={`sim-${simulation.id}`}
                >
                  <TableCell>
                    <Typography variant="body2">{simulation.label}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {simulation.group}
                      {simulation.mutates ? " · writes" : ""}
                      {simulation.bug ? ` · ${simulation.bug}` : ""}
                    </Typography>
                  </TableCell>
                  <TableCell>{simulation.steps.length}</TableCell>
                  <TableCell>
                    {running === simulation.id ? (
                      <Chip size="small" label="running" />
                    ) : v ? (
                      <Chip size="small" color={v.color} label={v.label} sx={{ maxWidth: 320 }} />
                    ) : simulation.direct ? (
                      <Typography variant="caption" color="text.secondary">make tools-check</Typography>
                    ) : (
                      <Typography variant="caption" color="text.secondary">—</Typography>
                    )}
                  </TableCell>
                  <TableCell sx={{ display: { xs: "none", md: "table-cell" } }}>
                    <Typography variant="caption" color="text.secondary">
                      {simulation.note}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    {simulation.direct ? (
                      <Tooltip title="Sends a chosen key or a non-JSON body, around the BFF: run make tools-check">
                        <span>
                          <Button size="small" disabled>
                            Run
                          </Button>
                        </span>
                      </Tooltip>
                    ) : (
                      <Button
                        size="small"
                        disabled={disabled}
                        onClick={(e) => {
                          e.stopPropagation();
                          request([simulation]);
                        }}
                      >
                        Run
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
                {expanded && (
                  <TableRow>
                    <TableCell colSpan={5} sx={{ bgcolor: "background.default" }}>
                      {outcome.steps.map((step, index) => (
                        <Box key={step.step.id} sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5, flexWrap: "wrap" }}>
                          <Typography variant="caption" sx={{ minWidth: 22 }}>
                            {index + 1}.
                          </Typography>
                          <Typography variant="body2" sx={{ flex: "1 1 240px" }}>
                            {step.step.label}
                          </Typography>
                          {step.exchanges.map((exchange, i) => (
                            <Chip
                              key={i}
                              size="small"
                              clickable
                              onClick={() => setShown(exchange)}
                              color={step.failure ? "error" : "success"}
                              variant={shown === exchange ? "filled" : "outlined"}
                              label={exchange.error ? "error" : `${exchange.statusCode}`}
                            />
                          ))}
                          {step.failure && (
                            <Typography variant="caption" color="error.main">
                              {step.failure}
                            </Typography>
                          )}
                        </Box>
                      ))}
                      {outcome.skipped && (
                        <Typography variant="caption" color="text.secondary">
                          Skipped{outcome.steps.length ? " here" : ""}: {outcome.skipped}
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>

      {shown && (
        <Box sx={{ mt: 2 }}>
          <ResponseView exchange={shown} storageKey="tools-simulation" summary={(_payload, exchange) => <ToolsSummary exchange={exchange} />} />
        </Box>
      )}

      <ConfirmWrite
        connection={connection}
        what={`Run ${pending?.filter((s) => s.mutates).map((s) => `"${s.label}"`).join(", ") ?? ""}, which executes cancellations,`}
        open={pending !== null}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          const next = pending ?? [];
          setPending(null);
          void run(next);
        }}
      />
    </Box>
  );
}
