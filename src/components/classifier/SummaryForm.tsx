"use client";

import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import FormControlLabel from "@mui/material/FormControlLabel";
import Grid from "@mui/material/Grid";
import MenuItem from "@mui/material/MenuItem";
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
import { parseJsonArray, parseJsonObject } from "@/lib/validators";

import { DEFAULT_MAX_BATCH_ITEMS, SOURCE_TYPES, SUMMARY_EXAMPLE, type SourceType } from "./data";
import { OptionsEditor } from "./OptionsEditor";
import { SummaryRefreshSummary } from "./SummaryRefreshSummary";

type ItemsMode = "lines" | "json";

/**
 * `POST /v1/summary/refresh` — stateless customer-summary refresh, ported
 * from air-classifier-service's own worked example. The caller owns storage: send
 * back whatever `summary` a prior call returned as `existing_summary`, plus
 * only the newest items, and the rollup/narrative pick up where they left
 * off. This form keeps that round trip one click away — see "Use as
 * existing_summary" below the response.
 */
export function SummaryForm({ connection }: { connection: Connection }) {
  const [customerId, setCustomerId] = useState("");
  const [itemsMode, setItemsMode] = useState<ItemsMode>("lines");
  const [linesText, setLinesText] = useState("");
  const [linesSourceType, setLinesSourceType] = useState<SourceType>("feedback");
  const [itemsJson, setItemsJson] = useState("");
  const [existingSummaryRaw, setExistingSummaryRaw] = useState("");
  const [options, setOptions] = useState<Record<string, unknown>>({});

  const mutation = useSendRequest(connection);

  const loadExample = () => {
    setCustomerId(SUMMARY_EXAMPLE.customerId);
    setItemsMode("json");
    setItemsJson(JSON.stringify(SUMMARY_EXAMPLE.items, null, 2));
    setExistingSummaryRaw(JSON.stringify(SUMMARY_EXAMPLE.existingSummary, null, 2));
  };

  const { items, error: itemsError } = useMemo(() => {
    if (itemsMode === "lines") {
      const parsed = linesText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => ({ text: line, source_type: linesSourceType }));
      return { items: parsed, error: null as string | null };
    }
    const result = parseJsonArray<Record<string, unknown>>(itemsJson, "items");
    if (result.error) return { items: [], error: result.error };
    const parsed = result.value ?? [];
    if (!parsed.every((item) => item && typeof item === "object" && typeof item.text === "string")) {
      return { items: [], error: "every element of items must be an object with at least a string text." };
    }
    return { items: parsed, error: null };
  }, [itemsMode, linesText, linesSourceType, itemsJson]);

  const { existingSummary, error: existingSummaryError } = useMemo(() => {
    const result = parseJsonObject(existingSummaryRaw, "existing_summary");
    return { existingSummary: result.value, error: result.error };
  }, [existingSummaryRaw]);

  const errors: string[] = [];
  if (!customerId.trim()) errors.push("customer_id is required.");
  if (itemsError) errors.push(itemsError);
  if (items.length === 0 && !itemsError) errors.push("Supply at least one item.");
  if (existingSummaryError) errors.push(existingSummaryError);
  if (!connection.baseUrl.trim()) errors.push("No air-classifier-service base URL set in the sidebar.");

  const body: Record<string, unknown> = { customer_id: customerId.trim(), items };
  if (existingSummary) body.existing_summary = existingSummary;
  if (Object.keys(options).length > 0) body.options = options;

  const url = joinUrl(connection.baseUrl || "https://—", "/v1/summary/refresh");

  const responseSummary =
    mutation.data?.responseJson && typeof mutation.data.responseJson === "object"
      ? (mutation.data.responseJson as Record<string, unknown>).summary
      : undefined;

  return (
    <Box>
      <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
        <Button size="small" variant="outlined" onClick={loadExample}>
          Load example
        </Button>
      </Box>

      <Grid container spacing={2} sx={{ mb: 1.5 }}>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            label="customer_id · required"
            fullWidth
            value={customerId}
            onChange={(event) => setCustomerId(event.target.value)}
            placeholder="cust_482"
            helperText="Opaque identifier, echoed back only — never looked up or stored."
          />
        </Grid>
      </Grid>

      <Accordion
        disableGutters
        elevation={0}
        defaultExpanded
        sx={{ border: 1, borderColor: "divider", "&:before": { display: "none" }, mb: 1.5 }}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="body2">
            existing_summary · optional — omit for a customer&apos;s first-ever refresh
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          <TextField
            label="existing_summary · JSON, from a prior response's `summary`"
            multiline
            minRows={4}
            fullWidth
            value={existingSummaryRaw}
            onChange={(event) => setExistingSummaryRaw(event.target.value)}
            placeholder='{"narrative": "…", "rollup": {…}, "version": 1}'
          />
        </AccordionDetails>
      </Accordion>

      <RadioGroup
        row
        value={itemsMode}
        onChange={(event) => setItemsMode(event.target.value as ItemsMode)}
        sx={{ mb: 1 }}
      >
        <FormControlLabel value="lines" control={<Radio size="small" />} label="One text per line" />
        <FormControlLabel value="json" control={<Radio size="small" />} label="Full JSON items array" />
      </RadioGroup>

      {itemsMode === "lines" ? (
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 3 }}>
            <TextField
              select
              label="source_type"
              fullWidth
              value={linesSourceType}
              onChange={(event) => setLinesSourceType(event.target.value as SourceType)}
              helperText="Applied to every line below."
            >
              {SOURCE_TYPES.map((type) => (
                <MenuItem key={type} value={type}>
                  {type}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 9 }}>
            <TextField
              label="new items · one text per line"
              multiline
              minRows={5}
              fullWidth
              value={linesText}
              onChange={(event) => setLinesText(event.target.value)}
              placeholder={"The battery life is superb but the camera is a letdown.\nSupport replied within minutes, very helpful team."}
            />
          </Grid>
        </Grid>
      ) : (
        <TextField
          label="items · JSON array of SummaryItem objects"
          multiline
          minRows={8}
          fullWidth
          value={itemsJson}
          onChange={(event) => setItemsJson(event.target.value)}
          placeholder={
            '[\n  {"text": "…", "source_type": "review", "rating": 4},\n' +
            '  {"text": "…", "source_type": "feedback"}\n]'
          }
          helperText='Each item needs at least "text" and "source_type" (feedback | review); rating, channel, subject, product_id, occurred_at and metadata are all optional.'
        />
      )}

      {items.length > DEFAULT_MAX_BATCH_ITEMS && (
        <Typography variant="caption" color="warning.main" sx={{ display: "block", mt: 1 }}>
          {items.length} items — a deployment&apos;s own batch ceiling defaults to{" "}
          {DEFAULT_MAX_BATCH_ITEMS} and may reject more. The System tab&apos;s Capabilities probe
          reports the real limit for this target.
        </Typography>
      )}

      <Box sx={{ mt: 1.5 }}>
        <OptionsEditor onChange={setOptions} />
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
        onSend={() => mutation.mutate({ path: "/v1/summary/refresh", method: "POST", body })}
      />

      {mutation.data && (
        <Box sx={{ mt: 2 }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
            <Typography
              sx={{ fontSize: "0.74rem", fontWeight: 600, letterSpacing: "0.8px", textTransform: "uppercase", color: "text.secondary" }}
            >
              Response
            </Typography>
            {responseSummary !== undefined && (
              <Button
                size="small"
                onClick={() => setExistingSummaryRaw(JSON.stringify(responseSummary, null, 2))}
              >
                Use as existing_summary for next call
              </Button>
            )}
          </Box>
          <ResponseView
            exchange={mutation.data as Exchange}
            storageKey="clf-summary"
            summary={(payload) => <SummaryRefreshSummary payload={payload} />}
          />
        </Box>
      )}
    </Box>
  );
}
