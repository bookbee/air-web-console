"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { useState } from "react";

import { ResponseView } from "@/components/shared/ResponseView";
import { connectionLabel, type Connection } from "@/lib/connection";
import { sendViaProxy } from "@/lib/http/client";
import type { Exchange } from "@/lib/http/exchange";
import { useHistoryStore } from "@/store/historyStore";

import { CallSummary } from "./CallSummary";
import { expectationFor, judge, SCENARIOS, tally, type Expectation, type Scenario } from "./data";

interface Outcome {
  exchange: Exchange;
  expected: Expectation;
  failure: string | null;
}

function expectedLabel(expected: Expectation): string {
  return expected.code ? `${expected.status} ${expected.code}` : String(expected.status);
}

/** One-click contract checks against whichever gateway the sidebar targets.
 * Runs in order, not in parallel: the cache-hit scenario depends on its own
 * first call landing, and this console's key is rate-limited per minute. */
export function ScenarioPanel({ connection }: { connection: Connection }) {
  const remember = useHistoryStore((state) => state.remember);
  const [environment, setEnvironment] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  const [running, setRunning] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const disabled = !connection.baseUrl.trim() || running !== null;

  const send = async (scenario: Scenario): Promise<Exchange> => {
    const exchange = await sendViaProxy(connection, scenario.path, {
      method: scenario.method,
      body: scenario.body,
      stream: scenario.stream,
    });
    remember(connectionLabel(connection), exchange);
    return exchange;
  };

  // The environment decides which expectation applies; ask the gateway
  // itself rather than trusting the target's name.
  const detectEnvironment = async (): Promise<string | null> => {
    const exchange = await sendViaProxy(connection, "/v1/capabilities");
    const body = exchange.responseJson as Record<string, unknown> | null;
    const env = body && typeof body.environment === "string" ? body.environment : null;
    setEnvironment(env);
    return env;
  };

  const runOne = async (scenario: Scenario, env: string | null) => {
    setRunning(scenario.id);
    let exchange = await send(scenario);
    if (scenario.repeat && !exchange.error) exchange = await send(scenario);
    const expected = expectationFor(scenario, env);
    setOutcomes((prev) => ({ ...prev, [scenario.id]: { exchange, expected, failure: judge(exchange, expected) } }));
    setSelected(scenario.id);
  };

  const run = async (scenarios: readonly Scenario[]) => {
    try {
      const env = environment ?? (await detectEnvironment());
      for (const scenario of scenarios) await runOne(scenario, env);
    } finally {
      setRunning(null);
    }
  };

  const counts = tally(
    SCENARIOS.filter((scenario) => outcomes[scenario.id]).map((scenario) => ({ scenario, failure: outcomes[scenario.id].failure })),
  );
  const ran = counts.contractTotal + counts.gapsOpen + counts.gapsFixed.length;
  const selectedOutcome = selected ? outcomes[selected] : undefined;

  return (
    <Box>
      <Typography sx={{ fontSize: "0.74rem", fontWeight: 600, letterSpacing: "0.8px", textTransform: "uppercase", color: "text.secondary", mb: 0.5 }}>
        Contract scenarios
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
        Each row sends one request and checks the status, <code>code</code> and key fields against
        what the gateway&apos;s contract promises. Expectations follow the gateway&apos;s own reported
        environment{environment ? <> (<b>{environment}</b>)</> : null}: outside <code>local</code> this
        console&apos;s key is granted <code>generate</code>, <code>admin_read</code> and <code>pin</code>, not{" "}
        <code>embed</code>. Rows marked <b>known gaps</b> check what the contract promises and fail (amber) until
        the matching gateway fix lands; each names its report under <code>bugs/model-gateway/</code>. Rows that name a cloud provider make small paid calls.
      </Typography>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1 }}>
        <Button variant="contained" size="small" disabled={disabled} onClick={() => run(SCENARIOS)}>
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
            return (
              <TableRow
                key={scenario.id}
                hover
                selected={selected === scenario.id}
                onClick={() => outcome && setSelected(scenario.id)}
                sx={{ cursor: outcome ? "pointer" : "default" }}
              >
                <TableCell>
                  <Typography variant="body2">{scenario.label}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {scenario.group}
                    {scenario.bug ? ` · ${scenario.bug}` : ""}
                  </Typography>
                </TableCell>
                <TableCell sx={{ fontFamily: "monospace", fontSize: "0.8rem" }}>
                  {expectedLabel(expectationFor(scenario, environment))}
                </TableCell>
                <TableCell>
                  {running === scenario.id ? (
                    <Chip size="small" label="running" />
                  ) : outcome ? (
                    <Chip
                      size="small"
                      color={outcome.failure === null ? (scenario.bug ? "info" : "success") : scenario.bug ? "warning" : "error"}
                      label={outcome.failure === null ? (scenario.bug ? "pass: fix landed?" : "pass") : scenario.bug ? `open: ${outcome.failure}` : outcome.failure}
                      sx={{ maxWidth: 260 }}
                    />
                  ) : (
                    <Typography variant="caption" color="text.secondary">—</Typography>
                  )}
                </TableCell>
                <TableCell sx={{ display: { xs: "none", md: "table-cell" } }}>
                  <Typography variant="caption" color="text.secondary">{scenario.note}</Typography>
                </TableCell>
                <TableCell align="right">
                  <Button
                    size="small"
                    disabled={disabled}
                    onClick={(e) => {
                      e.stopPropagation();
                      run([scenario]);
                    }}
                  >
                    Run
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {selectedOutcome && (
        <Box sx={{ mt: 2 }}>
          <ResponseView
            exchange={selectedOutcome.exchange}
            storageKey="llm-scenario"
            summary={(_payload, exchange) =>
              /\/v1\/(generate|embed)$/.test(exchange.url) ? <CallSummary exchange={exchange} /> : undefined
            }
          />
        </Box>
      )}
    </Box>
  );
}
