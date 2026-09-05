"use client";

import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import FormControlLabel from "@mui/material/FormControlLabel";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useMemo, useState } from "react";

import { JsonViewer } from "@/components/shared/JsonViewer";
import { ResponseView } from "@/components/shared/ResponseView";
import { SendRow } from "@/components/shared/SendRow";
import { useSendRequest } from "@/hooks/useSendRequest";
import type { Connection } from "@/lib/connection";
import { joinUrl, type Exchange } from "@/lib/http/exchange";
import { parseJsonArray } from "@/lib/validators";

import { BatchSummary } from "./BatchSummary";
import { DEFAULT_MAX_BATCH_ITEMS } from "./data";
import { OptionsEditor } from "./OptionsEditor";

type Mode = "lines" | "json";

export function BatchForm({ connection }: { connection: Connection }) {
  const [mode, setMode] = useState<Mode>("lines");
  const [lines, setLines] = useState("");
  const [json, setJson] = useState("");
  const [options, setOptions] = useState<Record<string, unknown>>({});

  const mutation = useSendRequest(connection);

  const { items, error: jsonError } = useMemo(() => {
    if (mode === "lines") {
      const parsed = lines
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => ({ text: line }));
      return { items: parsed, error: null as string | null };
    }
    const result = parseJsonArray<Record<string, unknown>>(json, "items");
    if (result.error) return { items: [], error: result.error };
    const parsed = result.value ?? [];
    if (!parsed.every((item) => item && typeof item === "object")) {
      return { items: [], error: "every element of items must be a JSON object." };
    }
    return { items: parsed, error: null };
  }, [mode, lines, json]);

  const errors: string[] = [];
  if (jsonError) errors.push(jsonError);
  if (items.length === 0) errors.unshift("Supply at least one item.");
  if (!connection.baseUrl.trim()) errors.push("No air-classifier base URL set in the sidebar.");

  const body: Record<string, unknown> = { items };
  if (Object.keys(options).length > 0) body.options = options;

  const url = joinUrl(connection.baseUrl || "https://—", "/v1/classify/batch");

  return (
    <Box>
      <RadioGroup row value={mode} onChange={(e) => setMode(e.target.value as Mode)} sx={{ mb: 1.5 }}>
        <FormControlLabel value="lines" control={<Radio size="small" />} label="One text per line" />
        <FormControlLabel value="json" control={<Radio size="small" />} label="Full JSON items array" />
      </RadioGroup>

      {mode === "lines" ? (
        <TextField
          label="texts · one per line"
          multiline
          minRows={6}
          fullWidth
          value={lines}
          onChange={(e) => setLines(e.target.value)}
          placeholder={"Great value for money.\nArrived broken.\nDoes the job, nothing special."}
        />
      ) : (
        <TextField
          label="items · JSON array of request objects"
          multiline
          minRows={8}
          fullWidth
          value={json}
          onChange={(e) => setJson(e.target.value)}
          placeholder='[\n  {"text": "Great value."},\n  {"text": "Arrived broken.", "metadata": {"id": "r-2"}}\n]'
          helperText="Each element takes the same shape as a single request, minus batch options."
        />
      )}

      <Box sx={{ mt: 1.5 }}>
        <OptionsEditor onChange={setOptions} />
      </Box>

      {items.length > DEFAULT_MAX_BATCH_ITEMS && (
        <Alert severity="warning" sx={{ mt: 1.5 }}>
          {items.length} items. The schema allows 1000, but a deployment&apos;s own batch ceiling
          defaults to {DEFAULT_MAX_BATCH_ITEMS} and rejects more. The System tab&apos;s Capabilities
          probe reports the limit for this target.
        </Alert>
      )}

      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
        {items.length} item(s) ready to send.
      </Typography>

      <Accordion disableGutters elevation={0} sx={{ border: 1, borderColor: "divider", "&:before": { display: "none" }, mt: 1.5 }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="body2">Request body preview</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <JsonViewer value={body} />
        </AccordionDetails>
      </Accordion>

      <SendRow
        label="Send batch"
        url={url}
        connection={connection}
        errors={errors}
        loading={mutation.isPending}
        onSend={() => mutation.mutate({ path: "/v1/classify/batch", method: "POST", body })}
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
            storageKey="clf-batch"
            summary={(payload) => <BatchSummary payload={payload} />}
          />
        </Box>
      )}
    </Box>
  );
}
