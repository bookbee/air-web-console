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
import { useState } from "react";

import { ResponseView } from "@/components/shared/ResponseView";
import { connectionLabel, type Connection } from "@/lib/connection";
import { sendViaProxy } from "@/lib/http/client";
import type { Exchange } from "@/lib/http/exchange";
import { useHistoryStore } from "@/store/historyStore";

import { CitationsSummary } from "./CitationsSummary";
import {
  DEFAULT_TENANT,
  expectedLabel,
  judge,
  preflightFailure,
  SCENARIOS,
  tally,
  viaConsole,
  type RunContext,
  type Scenario,
} from "./data";

interface Outcome {
  exchange: Exchange | null;
  failure: string | null;
}

/** One-click contract and SIT checks against whichever air-rag-service the
 * sidebar targets, judged exactly as `make rag-check` judges them. Rows that
 * have to go around the BFF (no key, malformed JSON) are listed but run
 * only headless; operator rows run one at a time, after their manual step. */
export function ScenarioPanel({ connection }: { connection: Connection }) {
  const remember = useHistoryStore((state) => state.remember);
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  const [running, setRunning] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [context, setContext] = useState<RunContext | null>(null);
  const [indexEmpty, setIndexEmpty] = useState<string | null>(null);
  const disabled = !connection.baseUrl.trim() || running !== null;

  // The tenant to hold citations to, and whether the index is seeded: asked
  // of the service itself before any row runs.
  const preflight = async (): Promise<{ context: RunContext; empty: string | null }> => {
    const exchange = await sendViaProxy(connection, "/v1/capabilities");
    const body = (exchange.responseJson ?? {}) as Record<string, unknown>;
    const next = { tenant: typeof body.tenant === "string" ? body.tenant : DEFAULT_TENANT };
    const empty = exchange.statusCode === 200 ? preflightFailure(body) : `capabilities: ${exchange.error ?? exchange.statusCode}`;
    setContext(next);
    setIndexEmpty(empty);
    return { context: next, empty };
  };

  const runOne = async (scenario: Scenario, ctx: RunContext, empty: string | null) => {
    setRunning(scenario.id);
    if (scenario.sit && empty) {
      setOutcomes((prev) => ({ ...prev, [scenario.id]: { exchange: null, failure: empty } }));
      return;
    }
    const exchange = await sendViaProxy(connection, scenario.path, { method: scenario.method, body: scenario.body });
    remember(connectionLabel(connection), exchange);
    setOutcomes((prev) => ({ ...prev, [scenario.id]: { exchange, failure: judge(exchange, scenario.expected, ctx) } }));
    setSelected(scenario.id);
  };

  const run = async (scenarios: readonly Scenario[]) => {
    try {
      setRunning("preflight");
      const { context: ctx, empty } = await preflight();
      for (const scenario of scenarios) await runOne(scenario, ctx, empty);
    } finally {
      setRunning(null);
    }
  };

  const runnable = SCENARIOS.filter((s) => viaConsole(s) && !s.operator);
  const counts = tally(
    runnable.filter((s) => outcomes[s.id]).map((scenario) => ({ scenario, failure: outcomes[scenario.id].failure })),
  );
  const ran = counts.contractTotal + counts.gapsOpen + counts.gapsFixed.length;
  const selectedOutcome = selected ? outcomes[selected] : undefined;

  return (
    <Box>
      <Typography sx={{ fontSize: "0.74rem", fontWeight: 600, letterSpacing: "0.8px", textTransform: "uppercase", color: "text.secondary", mb: 0.5 }}>
        Contract and SIT scenarios
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
        Each row sends one request and checks its status, problem <code>type</code> and body. Every successful
        retrieve is also held to isolation: each citation must be the key&apos;s tenant
        {context ? <> (<b>{context.tenant}</b>)</> : null}, <code>status: active</code>, and never from{" "}
        <code>acme-returns</code> or <code>draft-no-tenant</code>. <b>retrieval (SIT)</b> rows mirror{" "}
        <code>air-rag-service/sit/queries.json</code> and need the index seeded (<code>make run-sit</code>).{" "}
        <b>headless</b> rows go around this console&apos;s BFF, so only <code>make rag-check</code> runs them;{" "}
        <b>operator</b> rows need the gateway stopped first. <b>known gaps</b> name a report under{" "}
        <code>bugs/rag/</code> and fail (amber) until it&apos;s fixed.
      </Typography>
      <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1.5, mb: 1 }}>
        <Button variant="contained" size="small" disabled={disabled} onClick={() => run(runnable)}>
          {running ? "Running…" : "Run all"}
        </Button>
        {ran > 0 && (
          <Typography variant="body2" color={counts.contractPassed === counts.contractTotal ? "success.main" : "error.main"}>
            contract {counts.contractPassed} / {counts.contractTotal} passed
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
        {indexEmpty && (
          <Typography variant="body2" color="error.main">
            · {indexEmpty}
          </Typography>
        )}
      </Box>

      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>scenario</TableCell>
            <TableCell>expected</TableCell>
            <TableCell>result</TableCell>
            <TableCell sx={{ display: { xs: "none", md: "table-cell" } }}>why</TableCell>
            <TableCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {SCENARIOS.map((scenario) => {
            const outcome = outcomes[scenario.id];
            const isGap = scenario.group === "known gaps";
            const headless = !viaConsole(scenario);
            return (
              <TableRow
                key={scenario.id}
                hover
                selected={selected === scenario.id}
                onClick={() => outcome?.exchange && setSelected(scenario.id)}
                sx={{ cursor: outcome?.exchange ? "pointer" : "default" }}
              >
                <TableCell>
                  <Typography variant="body2">{scenario.label}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {scenario.group}
                    {scenario.bug ? ` · ${scenario.bug}` : ""}
                  </Typography>
                </TableCell>
                <TableCell sx={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{expectedLabel(scenario.expected)}</TableCell>
                <TableCell>
                  {running === scenario.id ? (
                    <Chip size="small" label="running" />
                  ) : outcome ? (
                    <Chip
                      size="small"
                      color={outcome.failure === null ? (isGap ? "info" : "success") : isGap ? "warning" : "error"}
                      label={outcome.failure === null ? (isGap ? "pass: fix landed?" : "pass") : isGap ? `open: ${outcome.failure}` : outcome.failure}
                      sx={{ maxWidth: 280 }}
                    />
                  ) : headless ? (
                    <Typography variant="caption" color="text.secondary">make rag-check</Typography>
                  ) : (
                    <Typography variant="caption" color="text.secondary">—</Typography>
                  )}
                </TableCell>
                <TableCell sx={{ display: { xs: "none", md: "table-cell" } }}>
                  <Typography variant="caption" color="text.secondary">
                    {scenario.operator ? <b>{scenario.operator} </b> : null}
                    {scenario.note}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  {headless ? (
                    <Tooltip title="Goes around the BFF (no key, or a body that isn't JSON): run make rag-check">
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
                        void run([scenario]);
                      }}
                    >
                      Run
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {selectedOutcome?.exchange && (
        <Box sx={{ mt: 2 }}>
          <ResponseView
            exchange={selectedOutcome.exchange}
            storageKey="rag-scenario"
            summary={(_payload, exchange) =>
              exchange.url.split("?")[0].endsWith("/v1/retrieve") ? (
                <CitationsSummary exchange={exchange} tenant={context?.tenant ?? DEFAULT_TENANT} />
              ) : undefined
            }
          />
        </Box>
      )}
    </Box>
  );
}
