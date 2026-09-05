"use client";

import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import FormControlLabel from "@mui/material/FormControlLabel";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Typography from "@mui/material/Typography";
import { useState } from "react";

import { TargetCaption } from "@/components/layout/TargetBar";
import { JsonViewer } from "@/components/shared/JsonViewer";
import { ResponseView } from "@/components/shared/ResponseView";
import { RouteCard } from "@/components/shared/RouteCard";
import { SendRow } from "@/components/shared/SendRow";
import { useSendRequest } from "@/hooks/useSendRequest";
import type { Connection } from "@/lib/connection";
import { joinUrl, type Exchange } from "@/lib/http/exchange";

import { ChatFields, type ChatMessage } from "./ChatFields";
import { EmbeddingsFields } from "./EmbeddingsFields";
import { InferenceSummary } from "./InferenceSummary";
import { OptionsEditor } from "./OptionsEditor";
import { PolicyProbe } from "./PolicyProbe";

type Task = "chat" | "embeddings";

/** The air-llm tab — ported from `tabs/llm.py`. One request shape does
 * both tasks the service supports; `task` picks between them, not a route.
 * Neither task streams — air-llm has no SSE/websocket route anywhere. */
export function LlmTab({ connection }: { connection: Connection }) {
  const [task, setTask] = useState<Task>("chat");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatErrors, setChatErrors] = useState<string[]>([]);
  const [embeddingItems, setEmbeddingItems] = useState<string[]>([]);
  const [embeddingErrors, setEmbeddingErrors] = useState<string[]>([]);
  const [extras, setExtras] = useState<Record<string, unknown>>({});

  const mutation = useSendRequest(connection);

  const errors = [...(task === "chat" ? chatErrors : embeddingErrors)];
  if (!connection.baseUrl.trim()) errors.push("No air-llm base URL set in the sidebar.");

  const body: Record<string, unknown> = { task, ...extras };
  if (task === "chat") body.messages = messages;
  else body.input = embeddingItems;

  const url = joinUrl(connection.baseUrl || "https://—", "/v1/inference");

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        One endpoint, two tasks. <code>POST /v1/inference</code> serves chat and embeddings alike
        — <code>task</code> picks which — across whichever provider the deployment&apos;s routing
        config prefers, with failover between them on a per-attempt deadline.
      </Typography>
      <TargetCaption connection={connection} />

      <RouteCard
        path="POST /v1/inference"
        description={
          <>
            One entry point for both chat and embeddings — <code>task</code> picks which. Stateless
            per call: there is no session id, so a multi-turn exchange means resending the whole{" "}
            <code>messages</code> array.
          </>
        }
        detail={
          <>
            chat returns: content, usage, cost_usd, cached, refusal, finish_reason
            <br />
            embeddings returns: one vector per input string
          </>
        }
      />

      <Divider sx={{ my: 2 }} />

      <RadioGroup row value={task} onChange={(e) => setTask(e.target.value as Task)} sx={{ mb: 2 }}>
        <FormControlLabel value="chat" control={<Radio size="small" />} label="chat" />
        <FormControlLabel value="embeddings" control={<Radio size="small" />} label="embeddings" />
      </RadioGroup>

      {task === "chat" ? (
        <ChatFields onChange={(next, nextErrors) => { setMessages(next); setChatErrors(nextErrors); }} />
      ) : (
        <EmbeddingsFields onChange={(next, nextErrors) => { setEmbeddingItems(next); setEmbeddingErrors(nextErrors); }} />
      )}

      <Box sx={{ mt: 2 }}>
        <OptionsEditor task={task} onChange={setExtras} />
      </Box>

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
        onSend={() => mutation.mutate({ path: "/v1/inference", method: "POST", body })}
      />

      {mutation.data ? (
        <Box sx={{ mt: 2 }}>
          <Typography
            sx={{ fontSize: "0.74rem", fontWeight: 600, letterSpacing: "0.8px", textTransform: "uppercase", color: "text.secondary", mb: 1 }}
          >
            Response
          </Typography>
          <ResponseView
            exchange={mutation.data as Exchange}
            storageKey="llm"
            summary={(payload) => <InferenceSummary payload={payload} />}
          />
        </Box>
      ) : (
        <Typography color="text.secondary" sx={{ mt: 2, fontStyle: "italic" }}>
          No call sent yet this session.
        </Typography>
      )}

      <Divider sx={{ my: 3 }} />
      <PolicyProbe connection={connection} />
    </Box>
  );
}
