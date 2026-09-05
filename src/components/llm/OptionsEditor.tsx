"use client";

import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useEffect, useState } from "react";

import { OptionRow } from "@/components/shared/OptionRow";
import { parseJsonObject } from "@/lib/validators";

/** air-llm's top-level fields — ported from `_optional_fields`. Unlike
 * air-classifier-service's and air-orchestrator-service's `options` sub-object, every field
 * here sits at the request's top level, since `InferenceRequest` has no
 * such wrapper — the payload builder in `LlmTab` merges these in flat. */
export function OptionsEditor({
  task,
  onChange,
}: {
  task: "chat" | "embeddings";
  onChange: (fields: Record<string, unknown>) => void;
}) {
  const [modelOn, setModelOn] = useState(false);
  const [model, setModel] = useState("");
  const [maxTokensOn, setMaxTokensOn] = useState(false);
  const [maxTokens, setMaxTokens] = useState(1024);
  const [tempOn, setTempOn] = useState(false);
  const [temperature, setTemperature] = useState(0.7);
  const [schemaOn, setSchemaOn] = useState(false);
  const [schemaRaw, setSchemaRaw] = useState("");
  const [schemaName, setSchemaName] = useState("");
  const [cacheOn, setCacheOn] = useState(false);
  const [cachePrefix, setCachePrefix] = useState(true);

  useEffect(() => {
    const fields: Record<string, unknown> = {};
    if (modelOn && model.trim()) fields.model = model.trim();
    if (task === "chat") {
      if (maxTokensOn) fields.max_tokens = maxTokens;
      if (tempOn) fields.temperature = temperature;
      if (schemaOn) {
        const result = parseJsonObject(schemaRaw, "json_schema");
        if (result.value) fields.json_schema = result.value;
        if (schemaName.trim()) fields.schema_name = schemaName.trim();
      }
    }
    if (cacheOn) fields.cache_prefix = cachePrefix;
    onChange(fields);
    // `onChange` excluded deliberately — see classifier/OptionsEditor.tsx's
    // comment on the same pattern; LlmTab passes a stable `setExtras` here
    // today, but excluding it keeps this component safe regardless.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelOn, model, task, maxTokensOn, maxTokens, tempOn, temperature, schemaOn, schemaRaw, schemaName, cacheOn, cachePrefix]);

  return (
    <Accordion disableGutters elevation={0} sx={{ border: 1, borderColor: "divider", "&:before": { display: "none" } }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="body2">Options — tick a row to send it, leave clear to use the service default</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <OptionRow label="model" enabled={modelOn} onToggle={setModelOn} defaultCaption="Default: the deployment's own default model — see the System tab.">
          <TextField size="small" fullWidth value={model} onChange={(e) => setModel(e.target.value)} placeholder="ollama:llama3.2:3b" />
        </OptionRow>

        {task === "chat" && (
          <>
            <OptionRow label="max_tokens" enabled={maxTokensOn} onToggle={setMaxTokensOn} defaultCaption="Default: the provider's own ceiling.">
              <TextField type="number" size="small" fullWidth value={maxTokens} onChange={(e) => setMaxTokens(Number(e.target.value))} slotProps={{ htmlInput: { min: 1, max: 32000 } }} />
            </OptionRow>
            <OptionRow label="temperature" enabled={tempOn} onToggle={setTempOn} defaultCaption="Default: the provider's own default.">
              <TextField type="number" size="small" fullWidth value={temperature} onChange={(e) => setTemperature(Number(e.target.value))} slotProps={{ htmlInput: { min: 0, max: 2, step: 0.1 } }} />
            </OptionRow>
            <OptionRow label="json_schema + schema_name" enabled={schemaOn} onToggle={setSchemaOn} defaultCaption="Default: unset — free-form text output.">
              <TextField
                label="json_schema"
                multiline
                minRows={3}
                size="small"
                fullWidth
                value={schemaRaw}
                onChange={(e) => setSchemaRaw(e.target.value)}
                placeholder='{"type": "object", "properties": {"count": {"type": "integer"}}}'
                sx={{ mb: 1 }}
              />
              <TextField label="schema_name" size="small" fullWidth value={schemaName} onChange={(e) => setSchemaName(e.target.value)} placeholder="order_summary" />
            </OptionRow>
          </>
        )}

        <OptionRow label="cache_prefix" enabled={cacheOn} onToggle={setCacheOn} defaultCaption="Default: true.">
          <FormControlLabel control={<Checkbox checked={cachePrefix} onChange={(e) => setCachePrefix(e.target.checked)} />} label="Let the provider cache the stable prefix of this call" />
        </OptionRow>
      </AccordionDetails>
    </Accordion>
  );
}
