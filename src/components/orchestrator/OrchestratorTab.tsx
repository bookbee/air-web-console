"use client";

import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import Divider from "@mui/material/Divider";
import FormControlLabel from "@mui/material/FormControlLabel";
import Grid from "@mui/material/Grid";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useMemo, useState } from "react";

import { RouteCard } from "@/components/shared/RouteCard";
import { TargetCaption } from "@/components/layout/TargetBar";
import { JsonViewer } from "@/components/shared/JsonViewer";
import { ResponseView } from "@/components/shared/ResponseView";
import { SendRow } from "@/components/shared/SendRow";
import { useSendRequest } from "@/hooks/useSendRequest";
import type { Connection } from "@/lib/connection";
import { joinUrl, type Exchange } from "@/lib/http/exchange";
import { parseJsonObject } from "@/lib/validators";

import { ROUTES } from "./data";
import { foldEvents } from "./events";
import { OptionsEditor } from "./OptionsEditor";
import { Transcript, type TranscriptTurn } from "./Transcript";
import { TurnSummary } from "./TurnSummary";

function resolvePayload(exchange: Exchange): Record<string, unknown> | null {
  if (exchange.isStream) {
    return exchange.events.length > 0 ? foldEvents(exchange.events) : null;
  }
  return exchange.responseJson && typeof exchange.responseJson === "object"
    ? (exchange.responseJson as Record<string, unknown>)
    : null;
}

/** The air-orchestrator-service tab. Both routes run one pipeline behind
 * two entry points that differ only by profile. The channel comes from the
 * API key, not from a header or a route param, so the console holds one
 * key per channel and sends the one belonging to the route you picked. */
export function OrchestratorTab({ chat, query }: { chat: Connection; query: Connection }) {
  const [routeKey, setRouteKey] = useState<"chat" | "query">("chat");
  const route = ROUTES.find((r) => r.key === routeKey)!;
  const connection = route.key === "chat" ? chat : query;

  const [text, setText] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [schemaRaw, setSchemaRaw] = useState("");
  const [options, setOptions] = useState<Record<string, unknown>>({});
  const [stream, setStream] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);

  const mutation = useSendRequest(connection);

  const { schema, error: schemaError } = useMemo(() => {
    if (route.key !== "query") return { schema: null, error: null };
    const result = parseJsonObject(schemaRaw, "output_schema");
    return { schema: result.value, error: result.error };
  }, [route.key, schemaRaw]);

  const errors: string[] = [];
  if (!text.trim()) errors.push(`${route.field} is required.`);
  if (!connection.baseUrl.trim()) errors.push("No air-orchestrator-service base URL set in the sidebar.");
  if (schemaError) errors.push(schemaError);

  const body: Record<string, unknown> = { [route.field]: text };
  if (sessionId.trim()) body.session_id = sessionId.trim();
  if (route.key === "query" && schema) body.output_schema = schema;
  if (Object.keys(options).length > 0) body.options = options;

  const url = joinUrl(connection.baseUrl || "https://—", route.path);

  const handleResult = (exchange: Exchange, sentText: string) => {
    if (exchange.error !== null || (exchange.statusCode ?? 0) >= 400) return;
    const result = resolvePayload(exchange);
    if (!result) return;
    if (typeof result.session_id === "string" && result.session_id) setSessionId(result.session_id);
    const turns: TranscriptTurn[] = [];
    if (sentText.trim()) turns.push({ role: "user", content: sentText });
    if (typeof result.answer === "string" && result.answer) turns.push({ role: "assistant", content: result.answer });
    if (turns.length > 0) setTranscript((prev) => [...prev, ...turns]);
  };

  const sendTurn = (turnBody: Record<string, unknown>, sentText: string) => {
    mutation.mutate(
      { path: route.path, method: "POST", body: turnBody, stream },
      { onSuccess: (exchange) => handleResult(exchange, sentText) },
    );
  };

  const currentPayload = mutation.data ? resolvePayload(mutation.data) : null;
  const currentProposalId =
    currentPayload && typeof currentPayload.proposal === "object" && currentPayload.proposal
      ? (currentPayload.proposal as Record<string, unknown>).proposal_id
      : undefined;

  const handleProposalAction = (approve: boolean) => {
    if (typeof currentProposalId !== "string") return;
    sendTurn(
      {
        [route.field]: approve ? "Confirm this action." : "Decline this action.",
        session_id: sessionId,
        confirm: { proposal_id: currentProposalId, approve },
      },
      "",
    );
  };

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        One pipeline, two entry points. <code>/v1/chat</code> serves the customer gateway and{" "}
        <code>/v1/query</code> the corporate one, returning structured output. They differ only by
        profile — guardrails, output contract, audit sink, quota, tool allow-list.
      </Typography>

      <RadioGroup row value={routeKey} onChange={(e) => setRouteKey(e.target.value as "chat" | "query")} sx={{ mb: 1 }}>
        {ROUTES.map((r) => (
          <FormControlLabel key={r.key} value={r.key} control={<Radio size="small" />} label={r.label} />
        ))}
      </RadioGroup>

      <TargetCaption connection={connection} />
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
        <code>{route.path}</code> is pinned to the <b>{route.channel}</b> channel, so the console
        sends the {route.channel} key. The other key would be a 403 here.
      </Typography>

      <Grid container spacing={2} sx={{ mb: 1.5 }}>
        {ROUTES.map((r) => (
          <Grid key={r.key} size={{ xs: 12, sm: 6 }}>
            <RouteCard
              path={`POST ${r.path}`}
              description={r.purpose}
              detail={
                <>
                  key: <b>{r.channel}</b> channel · body field <code>{r.field}</code>
                </>
              }
              active={r.key === routeKey}
            />
          </Grid>
        ))}
      </Grid>

      <Divider sx={{ my: 2 }} />

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 8 }}>
          <TextField
            label={`${route.field} · required`}
            multiline
            minRows={4}
            fullWidth
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={route.placeholder}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <TextField
            label="session_id · optional"
            fullWidth
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            placeholder="blank starts a new one"
            helperText="Returned by the first turn, fed back to continue it."
          />
        </Grid>
      </Grid>

      {route.key === "query" && (
        <TextField
          label="output_schema · optional JSON Schema the answer must satisfy"
          multiline
          minRows={3}
          fullWidth
          sx={{ mt: 2 }}
          value={schemaRaw}
          onChange={(e) => setSchemaRaw(e.target.value)}
          placeholder='{"type": "object", "properties": {"count": {"type": "integer"}}}'
        />
      )}

      <Box sx={{ mt: 2 }}>
        <OptionsEditor onChange={setOptions} />
      </Box>

      <FormControlLabel
        sx={{ mt: 1 }}
        control={<Checkbox checked={stream} onChange={(e) => setStream(e.target.checked)} />}
        label="Stream via SSE (Accept: text/event-stream)"
      />

      <Accordion disableGutters elevation={0} sx={{ border: 1, borderColor: "divider", "&:before": { display: "none" }, mt: 1.5 }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="body2">Request body preview</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <JsonViewer value={body} />
        </AccordionDetails>
      </Accordion>

      <SendRow
        url={url}
        connection={connection}
        errors={errors}
        loading={mutation.isPending}
        onSend={() => sendTurn(body, text)}
      />

      {mutation.data && (
        <Box sx={{ mt: 2 }}>
          <Typography
            sx={{ fontSize: "0.74rem", fontWeight: 600, letterSpacing: "0.8px", textTransform: "uppercase", color: "text.secondary", mb: 1 }}
          >
            Response
          </Typography>
          <ResponseView
            exchange={mutation.data as Exchange}
            storageKey={`orchestrator-${route.key}`}
            summary={(_payload, exchange) => (
              <TurnSummary
                exchange={exchange}
                sessionId={sessionId}
                onProposalAction={handleProposalAction}
                proposalPending={mutation.isPending}
              />
            )}
          />
        </Box>
      )}

      {transcript.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Transcript turns={transcript} onClear={() => setTranscript([])} />
        </Box>
      )}
    </Box>
  );
}
