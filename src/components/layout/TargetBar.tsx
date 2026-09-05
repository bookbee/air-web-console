"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import { useState } from "react";

import {
  connectionHost,
  connectionLabel,
  connectionLocation,
  isAuthenticated,
  isRemote,
  type Connection,
} from "@/lib/connection";
import { sendViaProxy } from "@/lib/http/client";

/**
 * The "where is this going" strip pinned under the title — ported from
 * `components/target_bar.py`. States the destination in full, unprompted,
 * and colours anything that is not this machine, because the single most
 * expensive mistake this console can permit is sending a request to the
 * wrong environment.
 *
 * One row per *service*, not per connection: air-orchestrator-service holds two
 * connections (customer/business channel, each its own key) but they share
 * one base URL, and which channel a request uses is already a choice made
 * in the Orchestrator tab's own radio buttons — repeating that choice here as a
 * second row would just be the same destination stated twice. Each
 * channel's keyed/no-key status still needs to be visible, so the merged
 * row shows both inline instead of dropping one.
 */

const HEALTH_PATH = "/v1/health";

interface ProbeResult {
  ok: boolean;
  detail: string;
  ms: number;
  at: string;
}

async function probe(connection: Connection): Promise<ProbeResult> {
  const exchange = await sendViaProxy(connection, HEALTH_PATH);
  const detail =
    exchange.error !== null
      ? "unreachable"
      : exchange.statusCode !== null && exchange.statusCode < 400
        ? "healthy"
        : `HTTP ${exchange.statusCode}`;
  return {
    ok: exchange.error === null && (exchange.statusCode ?? 0) < 400,
    detail,
    ms: Math.round(exchange.elapsedMs),
    at: new Date().toLocaleTimeString([], { hour12: false }),
  };
}

function LocationChip({ connection }: { connection: Connection }) {
  const theme = useTheme();
  const location = connectionLocation(connection);
  const map = {
    local: { label: "LOCAL", bg: theme.air.chip.localBg, color: theme.air.chip.local },
    remote: { label: "REMOTE", bg: theme.air.chip.remoteBg, color: theme.air.chip.remote },
    unset: { label: "NOT SET", bg: "transparent", color: theme.air.chip.unset },
  }[location];
  return (
    <Box
      component="span"
      sx={{
        display: "inline-block",
        px: 0.8,
        py: 0.05,
        borderRadius: 0.5,
        fontSize: "0.68rem",
        fontWeight: 700,
        letterSpacing: "0.6px",
        bgcolor: map.bg,
        color: map.color,
      }}
    >
      {map.label}
    </Box>
  );
}

function KeyChip({ connection, prefix }: { connection: Connection; prefix?: string }) {
  const theme = useTheme();
  const authenticated = isAuthenticated(connection);
  return (
    <Box
      component="span"
      sx={{
        display: "inline-block",
        px: 0.8,
        py: 0.05,
        borderRadius: 0.5,
        fontSize: "0.68rem",
        fontWeight: 700,
        letterSpacing: "0.6px",
        color: authenticated ? theme.air.chip.key : theme.air.chip.nokey,
      }}
    >
      {prefix ? `${prefix}: ` : ""}
      {authenticated ? "KEYED" : "NO KEY"}
    </Box>
  );
}

function ReachabilityDot({ result }: { result: ProbeResult | undefined }) {
  const theme = useTheme();
  if (!result) {
    return (
      <Typography component="span" sx={{ fontSize: "0.82rem", color: "text.secondary" }}>
        ○ not checked
      </Typography>
    );
  }
  const color = result.ok ? theme.palette.success.main : theme.palette.error.main;
  return (
    <Typography component="span" sx={{ fontSize: "0.82rem", color: "text.secondary" }}>
      <Box component="span" sx={{ color, mr: 0.5 }}>
        ●
      </Box>
      {result.detail} · {result.ms} ms · {result.at}
    </Typography>
  );
}

/** One row per service. `connection` supplies the base URL/location every
 * service row shows; `keyChips` lets a multi-key service (air-orchestrator-service)
 * show more than one keyed/no-key indicator without repeating the whole
 * row per key. */
function ServiceTargetRow({
  label,
  connection,
  keyChips,
  result,
}: {
  label: string;
  connection: Connection;
  keyChips?: { prefix: string; connection: Connection }[];
  result: ProbeResult | undefined;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 1,
        py: 0.3,
        fontSize: "0.82rem",
        fontFamily: "monospace",
      }}
    >
      <Typography component="span" sx={{ minWidth: "10rem", fontWeight: 600, fontFamily: "inherit" }}>
        {label}
      </Typography>
      <LocationChip connection={connection} />
      <Typography component="span" sx={{ fontFamily: "inherit" }}>
        {connection.baseUrl || "— no base URL —"}
      </Typography>
      {keyChips ? (
        keyChips.map((chip) => <KeyChip key={chip.prefix} connection={chip.connection} prefix={chip.prefix} />)
      ) : (
        <KeyChip connection={connection} />
      )}
      <ReachabilityDot result={result} />
    </Box>
  );
}

export function TargetBar({
  classifier,
  orchestratorChat,
  orchestratorQuery,
  llm,
}: {
  classifier: Connection;
  orchestratorChat: Connection;
  orchestratorQuery: Connection;
  llm: Connection;
}) {
  const [results, setResults] = useState<Record<string, ProbeResult>>({});
  const [checking, setChecking] = useState(false);

  const allConnections = [classifier, orchestratorChat, orchestratorQuery, llm];
  const remote = allConnections.some(isRemote);
  const targetLabel = classifier.targetLabel;

  // One probe per *service*: air-orchestrator-service's health endpoint needs no auth
  // and both channels share one base URL, so probing it with either key
  // answers for both — a second identical probe would tell us nothing new.
  const checkAll = async () => {
    setChecking(true);
    try {
      const candidates: [string, Connection][] = [
        ["air-classifier-service", classifier],
        ["air-orchestrator-service", orchestratorChat],
        ["air-llm", llm],
      ];
      const toProbe = candidates.filter(([, connection]) => connection.baseUrl.trim());
      const entries = await Promise.all(
        toProbe.map(async ([label, connection]) => [label, await probe(connection)] as const),
      );
      setResults(Object.fromEntries(entries));
    } finally {
      setChecking(false);
    }
  };

  return (
    <Box sx={{ display: "flex", gap: 1, mb: 1.5, alignItems: "flex-start" }}>
      <Box
        sx={{
          flex: 1,
          border: 1,
          borderLeftWidth: 4,
          borderColor: "divider",
          borderLeftColor: remote ? "warning.main" : "primary.main",
          borderRadius: 1.5,
          px: 1.25,
          py: 1,
          bgcolor: remote ? (theme) => theme.air.surfaceWarn : "background.paper",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: 1, mb: 0.5 }}>
          <Typography
            component="span"
            sx={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "1px", color: "text.secondary" }}
          >
            TARGET
          </Typography>
          <Typography component="span" sx={{ fontWeight: 700 }}>
            {targetLabel}
          </Typography>
          <Typography
            component="span"
            sx={{ fontSize: "0.78rem", color: remote ? "warning.main" : "text.secondary", fontWeight: remote ? 600 : 400 }}
          >
            {remote ? "requests leave this machine" : "everything stays on this machine"}
          </Typography>
        </Box>
        <ServiceTargetRow label="air-classifier-service" connection={classifier} result={results["air-classifier-service"]} />
        <ServiceTargetRow
          label="air-orchestrator-service"
          connection={orchestratorChat}
          keyChips={[
            { prefix: "customer", connection: orchestratorChat },
            { prefix: "business", connection: orchestratorQuery },
          ]}
          result={results["air-orchestrator-service"]}
        />
        <ServiceTargetRow label="air-llm" connection={llm} result={results["air-llm"]} />
      </Box>
      <Button
        variant="outlined"
        onClick={checkAll}
        disabled={checking}
        startIcon={checking ? <CircularProgress size={14} /> : undefined}
        sx={{ alignSelf: "stretch", whiteSpace: "nowrap" }}
      >
        Check all
      </Button>
    </Box>
  );
}

/** A one-line destination reminder, used inside a tab — ported from
 * `target_bar.caption()`. */
export function TargetCaption({ connection }: { connection: Connection }) {
  const theme = useTheme();
  const location = connectionLocation(connection);
  const marker =
    location === "local"
      ? { text: "⌂ LOCAL", color: theme.air.chip.local }
      : location === "remote"
        ? { text: "⬆ REMOTE", color: theme.air.chip.remote }
        : { text: "NOT SET", color: theme.air.chip.unset };
  const authenticated = isAuthenticated(connection);

  return (
    <Typography variant="caption" sx={{ display: "block", color: "text.secondary", mb: 1 }}>
      <Box component="span" sx={{ color: marker.color, fontWeight: 600 }}>
        {marker.text}
      </Box>{" "}
      · <b>{connectionLabel(connection)}</b> on <code>{connection.target}</code> ·{" "}
      <code>{connectionHost(connection) === "—" ? "—" : connection.baseUrl || "—"}</code> ·{" "}
      {authenticated ? "keyed" : <Box component="span" sx={{ color: theme.air.chip.nokey }}>no key</Box>}
    </Typography>
  );
}
