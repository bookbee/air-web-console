"use client";

import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Grid from "@mui/material/Grid";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useMemo, useRef, useState } from "react";

import { JsonViewer } from "@/components/shared/JsonViewer";
import { ResponseView } from "@/components/shared/ResponseView";
import { SendRow } from "@/components/shared/SendRow";
import { useSendRequest } from "@/hooks/useSendRequest";
import type { Connection } from "@/lib/connection";
import { joinUrl, type Exchange } from "@/lib/http/exchange";
import { parseJsonObject } from "@/lib/validators";

import { ClassificationSummary } from "./ClassificationSummary";
import { EXAMPLES, MAX_TEXT_CHARS, type TierProbe } from "./data";
import { OptionalContext } from "./OptionalContext";
import { OptionsEditor, type ClassifierOptionsHandle } from "./OptionsEditor";
import { TierProbes } from "./TierProbes";

export function SingleForm({ connection }: { connection: Connection }) {
  const [text, setText] = useState("");
  const [contextRaw, setContextRaw] = useState("");
  const [metadataRaw, setMetadataRaw] = useState("");
  const [extras, setExtras] = useState<Record<string, unknown>>({});
  const [options, setOptions] = useState<Record<string, unknown>>({});
  const optionsHandle = useRef<ClassifierOptionsHandle | null>(null);

  const mutation = useSendRequest(connection);

  const applyProbe = (probe: TierProbe) => {
    setText(probe.text);
    optionsHandle.current?.setMinTier(true, probe.tier);
    optionsHandle.current?.setMaxTier(true, probe.tier);
    if (probe.rating !== undefined) {
      setExtras((prev) => ({ ...prev, rating: probe.rating, rating_scale_max: 5 }));
    }
  };

  const { context, error: contextError } = useMemo(() => {
    const result = parseJsonObject(contextRaw, "context");
    return { context: result.value, error: result.error };
  }, [contextRaw]);
  const { metadata, error: metadataError } = useMemo(() => {
    const result = parseJsonObject(metadataRaw, "metadata");
    return { metadata: result.value, error: result.error };
  }, [metadataRaw]);

  const errors: string[] = [];
  if (!text.trim()) errors.push("text is required.");
  if (text.length > MAX_TEXT_CHARS) errors.push(`text is ${text.length} characters; the service caps it at ${MAX_TEXT_CHARS}.`);
  if (contextError) errors.push(contextError);
  if (metadataError) errors.push(metadataError);
  if (!connection.baseUrl.trim()) errors.push("No air-classifier-service base URL set in the sidebar.");

  const body: Record<string, unknown> = { text, ...extras };
  if (context) body.context = context;
  if (metadata) body.metadata = metadata;
  if (Object.keys(options).length > 0) body.options = options;

  const url = joinUrl(connection.baseUrl || "https://—", "/v1/classify");

  return (
    <Box>
      <TierProbes onApply={applyProbe} />

      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1 }}>
        {EXAMPLES.map(([label, value]) => (
          <Button key={label} size="small" variant="outlined" onClick={() => setText(value)}>
            {label}
          </Button>
        ))}
      </Box>

      <TextField
        label="text · required"
        multiline
        minRows={4}
        fullWidth
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="The text to analyse…"
      />
      <Typography variant="caption" color={text.length > MAX_TEXT_CHARS ? "error" : "text.secondary"} sx={{ display: "block", mb: 1.5 }}>
        {text.length} / {MAX_TEXT_CHARS} characters
      </Typography>

      <Grid container spacing={2} sx={{ mb: 1.5 }}>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            label="context · optional JSON"
            multiline
            minRows={3}
            fullWidth
            value={contextRaw}
            onChange={(e) => setContextRaw(e.target.value)}
            placeholder='{"locale": "en-GB", "channel": "app"}'
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            label="metadata · optional JSON"
            multiline
            minRows={3}
            fullWidth
            value={metadataRaw}
            onChange={(e) => setMetadataRaw(e.target.value)}
            placeholder='{"ticket": "SUP-4821"}'
          />
        </Grid>
      </Grid>

      <OptionalContext onChange={(next) => setExtras((prev) => ({ ...prev, ...next }))} />
      <Box sx={{ mt: 1.5 }}>
        <OptionsEditor
          onChange={setOptions}
          registerHandle={(handle) => {
            optionsHandle.current = handle;
          }}
        />
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
        onSend={() => mutation.mutate({ path: "/v1/classify", method: "POST", body })}
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
            storageKey="clf-single"
            summary={(payload) => <ClassificationSummary payload={payload} />}
          />
        </Box>
      )}
    </Box>
  );
}
