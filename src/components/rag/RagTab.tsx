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
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { TargetCaption } from "@/components/layout/TargetBar";
import { DemoPresets } from "@/components/llm/DemoPresets";
import { JsonViewer } from "@/components/shared/JsonViewer";
import { ResponseView } from "@/components/shared/ResponseView";
import { RouteCard } from "@/components/shared/RouteCard";
import { SendRow } from "@/components/shared/SendRow";
import { useSendRequest } from "@/hooks/useSendRequest";
import type { Connection } from "@/lib/connection";
import { sendViaProxy } from "@/lib/http/client";
import { joinUrl, type Exchange } from "@/lib/http/exchange";

import { CitationsSummary } from "./CitationsSummary";
import { DEFAULT_TENANT, QUERY_MAX_CHARS, type RagCapabilities } from "./data";
import { RAG_PRESETS, type RagPreset } from "./demo";
import { RagStatus } from "./RagStatus";
import { RetrieveOptions } from "./RetrieveOptions";
import { ScenarioPanel } from "./ScenarioPanel";

const PATH = "/v1/retrieve";
type Mode = "form" | "advanced";

/** Advanced mode's raw body. Anything JSON is sendable, so negative cases
 * (a `tenant` field, `top_k: 0`, a wrong type) go out exactly as written.
 * Text that isn't JSON can't: the BFF would forward it as a JSON string, a
 * different request, so malformed JSON is a `make rag-check` row instead. */
function parseRaw(raw: string): { body: unknown; error: string | null } {
  try {
    return { body: JSON.parse(raw), error: null };
  } catch (error) {
    return {
      body: null,
      error: `Not JSON (${error instanceof Error ? error.message : "parse error"}). Malformed JSON can't go through the BFF; make rag-check sends it directly.`,
    };
  }
}

/** The air-rag-service tab: `POST /v1/retrieve` (a query in, citations out),
 * read-only, tenant from the key. The status strip says whether an answer
 * can mean anything: an empty index answers every query with `[]`. */
export function RagTab({ connection }: { connection: Connection }) {
  const [mode, setMode] = useState<Mode>("form");
  const [preset, setPreset] = useState<RagPreset | null>(null);
  const [round, setRound] = useState(0);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<Record<string, unknown>>({});
  const [raw, setRaw] = useState('{\n  "query": "how many days do I have to return something",\n  "top_k": 5\n}');
  const mutation = useSendRequest(connection);
  const configured = Boolean(connection.baseUrl.trim());

  const readyQuery = useQuery({
    queryKey: ["rag-ready", connection.target, connection.baseUrl],
    enabled: configured,
    queryFn: () => sendViaProxy(connection, "/v1/ready"),
  });
  const capabilitiesQuery = useQuery({
    queryKey: ["rag-capabilities", connection.target, connection.baseUrl],
    enabled: configured,
    queryFn: () => sendViaProxy(connection, "/v1/capabilities"),
  });
  const capabilities = (capabilitiesQuery.data?.statusCode === 200 ? capabilitiesQuery.data.responseJson : null) as RagCapabilities | null;
  const tenant = capabilities?.tenant ?? DEFAULT_TENANT;

  const pick = (next: RagPreset) => {
    setPreset(next);
    if (next.raw) {
      setRaw(JSON.stringify(next.raw, null, 2));
      setMode("advanced");
    } else {
      setQuery(next.query ?? "");
      setMode("form");
    }
    setRound((r) => r + 1);
  };

  const parsed = mode === "advanced" ? parseRaw(raw) : null;
  const body: unknown = mode === "form" ? { query, ...options } : parsed?.body;

  const errors: string[] = [];
  if (!configured) errors.push("No air-rag-service base URL set on the server for this target.");
  if (mode === "form" && !query.trim()) errors.push("Type a query (or use Advanced mode to send an empty one on purpose).");
  if (parsed?.error) errors.push(parsed.error);

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Retrieval with citations, read-only. The tenant comes from the key, never the request; the service embeds the
        query through its own air-model-gateway token, never this console&apos;s.
      </Typography>
      <TargetCaption connection={connection} />
      <RagStatus
        ready={readyQuery.data}
        capabilities={capabilitiesQuery.data}
        disabled={!configured}
        onReload={() => {
          void readyQuery.refetch();
          void capabilitiesQuery.refetch();
        }}
      />

      <RouteCard
        path="POST /v1/retrieve"
        description={
          <>
            A query in, the best-matching chunks of this key&apos;s tenant out, best first. No match, or an empty index,
            is <code>citations: []</code>, never an error.
          </>
        }
        detail={
          <>
            body: query (1..{QUERY_MAX_CHARS} chars), top_k? (1..50, default 5), user_id? · any other field is a 422
            <br />
            returns: query, citations[source_id &lt;doc&gt;#&lt;chunk&gt;, snippet, score 0..1, metadata]
            <br />
            errors: problem+json (<code>type</code> …/air-rag-service/&lt;slug&gt;) · 503 dependency-unavailable when the gateway is down
          </>
        }
      />

      <Divider sx={{ my: 2 }} />

      <DemoPresets presets={RAG_PRESETS} picked={preset} onPick={pick} />

      <RadioGroup row value={mode} onChange={(e) => setMode(e.target.value as Mode)} sx={{ mb: 1 }}>
        <FormControlLabel value="form" control={<Radio size="small" />} label="Form" />
        <FormControlLabel value="advanced" control={<Radio size="small" />} label="Advanced · raw JSON body" />
      </RadioGroup>

      {/* Both stay mounted, so switching modes keeps what was typed. */}
      <Box sx={{ display: mode === "form" ? "block" : "none" }}>
        <TextField
          label="query"
          multiline
          minRows={2}
          fullWidth
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          helperText={`${query.length} / ${QUERY_MAX_CHARS}`}
          error={query.length > QUERY_MAX_CHARS}
        />
        <Box sx={{ mt: 1 }}>
          <RetrieveOptions key={`options-${round}`} initial={preset?.raw ? undefined : preset?.options} onChange={setOptions} />
        </Box>
      </Box>
      <Box sx={{ display: mode === "advanced" ? "block" : "none" }}>
        <TextField
          label="body"
          multiline
          minRows={6}
          fullWidth
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          slotProps={{ htmlInput: { style: { fontFamily: "monospace", fontSize: "0.85rem" } } }}
          helperText="Sent exactly as written: use it for the negative cases (a tenant field, top_k 0, a wrong type)."
        />
      </Box>

      <Accordion disableGutters elevation={0} sx={{ border: 1, borderColor: "divider", "&:before": { display: "none" }, mt: 1.5 }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="body2">Request body preview</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <JsonViewer value={body ?? null} />
        </AccordionDetails>
      </Accordion>

      <SendRow
        url={joinUrl(connection.baseUrl || "https://—", PATH)}
        connection={connection}
        errors={errors}
        loading={mutation.isPending}
        onSend={() => mutation.mutate({ path: PATH, method: "POST", body })}
      />

      {mutation.data ? (
        <Box sx={{ mt: 2 }}>
          <Typography sx={{ fontSize: "0.74rem", fontWeight: 600, letterSpacing: "0.8px", textTransform: "uppercase", color: "text.secondary", mb: 1 }}>
            Response
          </Typography>
          <ResponseView
            exchange={mutation.data as Exchange}
            storageKey="rag"
            summary={(_payload, exchange) => <CitationsSummary exchange={exchange} tenant={tenant} />}
          />
        </Box>
      ) : (
        <Typography color="text.secondary" sx={{ mt: 2, fontStyle: "italic" }}>
          No {PATH} call sent yet this session.
        </Typography>
      )}

      <Divider sx={{ my: 3 }} />
      <ScenarioPanel connection={connection} />
    </Box>
  );
}
