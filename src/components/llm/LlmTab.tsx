"use client";

import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import FormControlLabel from "@mui/material/FormControlLabel";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Typography from "@mui/material/Typography";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { TargetCaption } from "@/components/layout/TargetBar";
import { JsonViewer } from "@/components/shared/JsonViewer";
import { ResponseView } from "@/components/shared/ResponseView";
import { RouteCard } from "@/components/shared/RouteCard";
import { SendRow } from "@/components/shared/SendRow";
import { useSendRequest } from "@/hooks/useSendRequest";
import type { Connection } from "@/lib/connection";
import { sendViaProxy } from "@/lib/http/client";
import { exchangeOk, joinUrl, type Exchange } from "@/lib/http/exchange";

import { CallSummary } from "./CallSummary";
import { ChatFields, type ChatMessage } from "./ChatFields";
import { rungFailures, type Capabilities, type Mode } from "./data";
import { EmbeddingsFields } from "./EmbeddingsFields";
import { ModelChoices } from "./ModelChoices";
import { OptionsEditor } from "./OptionsEditor";
import { PolicyProbe } from "./PolicyProbe";
import { ScenarioPanel } from "./ScenarioPanel";
import { responseBody } from "./stream";

const PATHS: Record<Mode, string> = { generate: "/v1/generate", embed: "/v1/embed" };

/** What the gateway's problem body means for the person testing it, beyond
 * the title/detail ResponseView already shows: a 502's detail packs every
 * rung's failure into one line, and an embed 403 outside local is this
 * console's own policy, not a gateway fault. */
function ProblemHint({ exchange }: { exchange: Exchange }) {
  const body = responseBody(exchange);
  const rungs = rungFailures(body.detail);
  if (rungs.length > 0) {
    return (
      <Alert severity="info" sx={{ mb: 1.5 }}>
        Every rung of the chain failed, in order:
        <Box component="ol" sx={{ m: 0, pl: 2.5 }}>
          {rungs.map((rung, index) => (
            <li key={index}>
              <code style={{ whiteSpace: "pre-wrap" }}>{rung}</code>
            </li>
          ))}
        </Box>
        A rung that failed on a 4xx (unknown model, missing key, rejected request) fails the same way on
        retry, even though the status is 502.
      </Alert>
    );
  }
  if (body.code === "policy_denied" && exchange.url.endsWith(PATHS.embed)) {
    return (
      <Alert severity="info" sx={{ mb: 1.5 }}>
        Expected outside <code>local</code>: the gateway&apos;s staging and prod policies grant
        air-web-console <code>generate</code> and <code>admin_read</code> only. Embed works here only
        against a <code>local</code> gateway.
      </Alert>
    );
  }
  if (body.code === "budget_exceeded") {
    return (
      <Alert severity="warning" sx={{ mb: 1.5 }}>
        Daily budget spent: don&apos;t retry before <code>Retry-After</code> (the next UTC day). Cache hits
        are still served.
      </Alert>
    );
  }
  return null;
}

/** The air-model-gateway tab. Two routes: `POST /v1/generate` (messages in,
 * one answer out, optionally structured, optionally streamed) and
 * `POST /v1/embed` (texts in, one vector each). What each model choice
 * means comes from the gateway's own `/v1/capabilities`, loaded per target. */
export function LlmTab({ connection }: { connection: Connection }) {
  const [mode, setMode] = useState<Mode>("generate");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatErrors, setChatErrors] = useState<string[]>([]);
  const [embedBody, setEmbedBody] = useState<{ model: string; input: string[] }>({ model: "", input: [] });
  const [embedErrors, setEmbedErrors] = useState<string[]>([]);
  const [extras, setExtras] = useState<Record<string, unknown>>({});

  const mutation = useSendRequest(connection);

  // Per target: the chains behind each class differ by environment.
  const capabilitiesQuery = useQuery({
    queryKey: ["llm-capabilities", connection.target, connection.baseUrl],
    enabled: Boolean(connection.baseUrl.trim()),
    queryFn: () => sendViaProxy(connection, "/v1/capabilities"),
  });
  const capabilitiesExchange = capabilitiesQuery.data;
  const capabilities =
    capabilitiesExchange && exchangeOk(capabilitiesExchange) ? (capabilitiesExchange.responseJson as Capabilities) : null;
  const capabilitiesError =
    capabilitiesExchange && !capabilities
      ? (capabilitiesExchange.error ??
        `${capabilitiesExchange.statusCode} ${String(responseBody(capabilitiesExchange).code ?? capabilitiesExchange.reason)}`)
      : null;

  const errors = [...(mode === "generate" ? chatErrors : embedErrors)];
  if (!connection.baseUrl.trim()) errors.push("No air-model-gateway base URL set in the sidebar.");

  const body: Record<string, unknown> = mode === "generate" ? { ...extras, messages } : { ...embedBody };
  const stream = mode === "generate" && body.stream === true;
  const path = PATHS[mode];
  const url = joinUrl(connection.baseUrl || "https://—", path);

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Two routes. You choose <i>where</i> a model runs (a class), never which model; the gateway owner
        decides what serves each class and handles failover, retries, cost accounting and caching.
      </Typography>
      <TargetCaption connection={connection} />

      <Accordion disableGutters elevation={0} defaultExpanded sx={{ border: 1, borderColor: "divider", "&:before": { display: "none" }, mb: 2 }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="body2">Model choices for this console — GET /v1/capabilities</Typography>
        </AccordionSummary>
        <AccordionDetails>
          {capabilities ? (
            <ModelChoices capabilities={capabilities} />
          ) : (
            <Typography variant="body2" color="text.secondary">
              {capabilitiesError ? `Couldn't load capabilities: ${capabilitiesError}` : "Loading…"}
            </Typography>
          )}
          <Button size="small" sx={{ mt: 1 }} disabled={!connection.baseUrl.trim()} onClick={() => void capabilitiesQuery.refetch()}>
            Reload
          </Button>
        </AccordionDetails>
      </Accordion>

      <RadioGroup row value={mode} onChange={(e) => setMode(e.target.value as Mode)} sx={{ mb: 1 }}>
        <FormControlLabel value="generate" control={<Radio size="small" />} label="POST /v1/generate" />
        <FormControlLabel value="embed" control={<Radio size="small" />} label="POST /v1/embed" />
      </RadioGroup>

      {mode === "generate" ? (
        <RouteCard
          path="POST /v1/generate"
          description={
            <>
              Messages in, one answer out: chat, classification, summaries, extraction. Stateless: send the
              whole history every call. <code>model</code> is a class (<code>local</code>, <code>auto</code>,{" "}
              <code>cloud</code>); <code>pin</code> names one exact model, for operator tools.
            </>
          }
          detail={
            <>
              returns: content, model_class, provider, model, usage, cost_usd, cached, refusal, finish_reason
              <br />
              stream: true → SSE start, delta…, done | error
              <br />
              errors: problem+json with a stable <code>code</code> — retry only 429 rate_limited, 502, 503
            </>
          }
        />
      ) : (
        <RouteCard
          path="POST /v1/embed"
          description={
            <>
              Texts in, one vector per text out. <code>model</code> is a published embedding name and is
              required: it is your index&apos;s identity, and a name never changes meaning.
            </>
          }
          detail={<>returns: embedding_model, dimensions, model, provider, embeddings, usage, cost_usd · one model, never a fallback</>}
        />
      )}

      <Divider sx={{ my: 2 }} />

      {mode === "generate" ? (
        <>
          <ChatFields onChange={(next, nextErrors) => { setMessages(next); setChatErrors(nextErrors); }} />
          <Box sx={{ mt: 2 }}>
            <OptionsEditor capabilities={capabilities} onChange={setExtras} />
          </Box>
        </>
      ) : (
        <EmbeddingsFields capabilities={capabilities} onChange={(next, nextErrors) => { setEmbedBody(next); setEmbedErrors(nextErrors); }} />
      )}

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
        onSend={() => mutation.mutate({ path, method: "POST", body, stream })}
      />

      {mutation.data ? (
        <Box sx={{ mt: 2 }}>
          <Typography
            sx={{ fontSize: "0.74rem", fontWeight: 600, letterSpacing: "0.8px", textTransform: "uppercase", color: "text.secondary", mb: 1 }}
          >
            Response
          </Typography>
          <ProblemHint exchange={mutation.data as Exchange} />
          <ResponseView
            exchange={mutation.data as Exchange}
            storageKey="llm"
            summary={(_payload, exchange) => <CallSummary exchange={exchange} />}
          />
        </Box>
      ) : (
        <Typography color="text.secondary" sx={{ mt: 2, fontStyle: "italic" }}>
          No call sent yet this session.
        </Typography>
      )}

      <Divider sx={{ my: 3 }} />
      <ScenarioPanel connection={connection} />

      <Divider sx={{ my: 3 }} />
      <PolicyProbe connection={connection} />
    </Box>
  );
}
