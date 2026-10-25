"use client";

import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useEffect, useState } from "react";

import { OptionRow } from "@/components/shared/OptionRow";
import { parseJsonObject } from "@/lib/validators";

import { CLASS_PROVIDERS, MODEL_CLASSES, pinSuggestions, PROVIDERS, type Capabilities, type ModelClass } from "./data";

/** `POST /v1/generate`'s optional top-level fields. Every one is
 * tick-to-omit like the other tabs' editors: the gateway's schema is
 * `extra="forbid"` and treats an explicit default differently from an
 * absent one (`pin` beside an explicit `model: "auto"` is a 422, beside an
 * omitted one it isn't). Invalid combinations stay sendable on purpose:
 * this is where a tester sees the gateway reject them. */
export function OptionsEditor({
  capabilities,
  initial = {},
  onChange,
}: {
  capabilities: Capabilities | null;
  /** A demo preset's fields: each one present starts ticked, at its value. */
  initial?: Record<string, unknown>;
  onChange: (fields: Record<string, unknown>) => void;
}) {
  const has = (field: string) => field in initial;
  const [modelOn, setModelOn] = useState(has("model"));
  const [model, setModel] = useState<ModelClass>((initial.model as ModelClass) ?? "local");
  const [providerOn, setProviderOn] = useState(has("provider"));
  const [provider, setProvider] = useState<string>((initial.provider as string) ?? "ollama");
  const [pinOn, setPinOn] = useState(has("pin"));
  const [pin, setPin] = useState((initial.pin as string) ?? "");
  const [maxTokensOn, setMaxTokensOn] = useState(has("max_tokens"));
  const [maxTokens, setMaxTokens] = useState((initial.max_tokens as number) ?? 300);
  const [tempOn, setTempOn] = useState(has("temperature"));
  const [temperature, setTemperature] = useState((initial.temperature as number) ?? 0.7);
  const [schemaOn, setSchemaOn] = useState(has("json_schema"));
  const [schemaRaw, setSchemaRaw] = useState(has("json_schema") ? JSON.stringify(initial.json_schema, null, 2) : "");
  const [schemaName, setSchemaName] = useState((initial.schema_name as string) ?? "");
  const [cachePrefixOn, setCachePrefixOn] = useState(has("cache_prefix"));
  const [cachePrefix, setCachePrefix] = useState((initial.cache_prefix as boolean) ?? true);
  const [cacheOn, setCacheOn] = useState(has("cache"));
  const [cache, setCache] = useState((initial.cache as boolean) ?? false);
  const [streamOn, setStreamOn] = useState(has("stream"));
  const [stream, setStream] = useState((initial.stream as boolean) ?? true);

  useEffect(() => {
    const fields: Record<string, unknown> = {};
    if (modelOn) fields.model = model;
    if (providerOn) fields.provider = provider;
    if (pinOn && pin.trim()) fields.pin = pin.trim();
    if (maxTokensOn) fields.max_tokens = maxTokens;
    if (tempOn) fields.temperature = temperature;
    if (schemaOn) {
      const result = parseJsonObject(schemaRaw, "json_schema");
      if (result.value) fields.json_schema = result.value;
      if (schemaName.trim()) fields.schema_name = schemaName.trim();
    }
    if (cachePrefixOn) fields.cache_prefix = cachePrefix;
    if (cacheOn) fields.cache = cache;
    if (streamOn) fields.stream = stream;
    onChange(fields);
    // `onChange` excluded deliberately — see classifier/OptionsEditor.tsx's
    // comment on the same pattern.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelOn, model, providerOn, provider, pinOn, pin, maxTokensOn, maxTokens, tempOn, temperature, schemaOn, schemaRaw, schemaName, cachePrefixOn, cachePrefix, cacheOn, cache, streamOn, stream]);

  const chain = capabilities?.generate?.[modelOn ? model : "auto"];
  const classOffers = CLASS_PROVIDERS[modelOn ? model : "auto"];
  const pins = pinSuggestions(capabilities);

  return (
    <Accordion
      disableGutters
      elevation={0}
      defaultExpanded={Object.keys(initial).length > 0}
      sx={{ border: 1, borderColor: "divider", "&:before": { display: "none" } }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="body2">Options — tick a row to send it, leave clear to use the gateway default</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <OptionRow
          label="model (class)"
          enabled={modelOn}
          onToggle={setModelOn}
          defaultCaption={`Default: auto.${chain ? ` For this console that is ${chain.chain.join(" → ")}.` : ""}`}
        >
          <TextField select size="small" fullWidth value={model} onChange={(e) => setModel(e.target.value as ModelClass)}>
            {MODEL_CLASSES.map((entry) => (
              <MenuItem key={entry.name} value={entry.name}>
                <Box>
                  <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
                    {entry.name}
                    {capabilities?.generate?.[entry.name]?.allowed === false ? " — not granted" : ""}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">{entry.note}</Typography>
                </Box>
              </MenuItem>
            ))}
          </TextField>
          {chain && (
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5, fontFamily: "monospace" }}>
              chain: {chain.chain.join(" → ")}
            </Typography>
          )}
        </OptionRow>

        <OptionRow
          label="provider"
          enabled={providerOn}
          onToggle={setProviderOn}
          defaultCaption="Default: none — the chain's own order. A preference moves that provider's rungs first; the rest stay as fallback."
        >
          <TextField select size="small" fullWidth value={provider} onChange={(e) => setProvider(e.target.value)}>
            {PROVIDERS.map((name) => (
              <MenuItem key={name} value={name}>
                <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
                  {name}
                  {classOffers.includes(name) ? "" : ` — not offered by ${modelOn ? model : "auto"} (expect 422)`}
                  {capabilities?.providers?.[name] === false ? " — not configured" : ""}
                </Typography>
              </MenuItem>
            ))}
          </TextField>
        </OptionRow>

        <OptionRow
          label="pin"
          enabled={pinOn}
          onToggle={setPinOn}
          defaultCaption={`Default: unset. Operator tools only: one exact provider:model, no fallback; send it without model or provider.${capabilities?.may_pin === false ? " This console may not pin here (expect 403)." : ""}`}
        >
          <Autocomplete
            freeSolo
            size="small"
            fullWidth
            options={pins}
            inputValue={pin}
            onInputChange={(_, value) => setPin(value)}
            renderInput={(params) => <TextField {...params} placeholder="anthropic:claude-haiku-4-5" />}
          />
          {pinOn && (modelOn || providerOn) && (
            <Typography variant="caption" color="warning.main" sx={{ display: "block", mt: 0.5 }}>
              With model or provider also ticked, expect 422 validation_error.
            </Typography>
          )}
        </OptionRow>

        <OptionRow label="max_tokens" enabled={maxTokensOn} onToggle={setMaxTokensOn} defaultCaption="Default: the provider's own cap. At least 1; leave 300+ for structured output, since thinking models spend part of it first.">
          <TextField type="number" size="small" fullWidth value={maxTokens} onChange={(e) => setMaxTokens(Number(e.target.value))} slotProps={{ htmlInput: { min: 1, max: 32000 } }} />
        </OptionRow>
        <OptionRow label="temperature" enabled={tempOn} onToggle={setTempOn} defaultCaption="Default: the provider's own. Range 0–2. Anthropic rungs ignore it — their API no longer takes sampling parameters.">
          <TextField type="number" size="small" fullWidth value={temperature} onChange={(e) => setTemperature(Number(e.target.value))} slotProps={{ htmlInput: { min: 0, max: 2, step: 0.1 } }} />
        </OptionRow>
        <OptionRow label="json_schema + schema_name" enabled={schemaOn} onToggle={setSchemaOn} defaultCaption="Default: unset — free-form text. With it, content is a JSON string the gateway never validates.">
          <TextField
            label="json_schema"
            multiline
            minRows={3}
            size="small"
            fullWidth
            value={schemaRaw}
            onChange={(e) => setSchemaRaw(e.target.value)}
            placeholder='{"type": "object", "properties": {"label": {"type": "string"}}, "required": ["label"]}'
            sx={{ mb: 1 }}
          />
          <TextField label="schema_name" size="small" fullWidth value={schemaName} onChange={(e) => setSchemaName(e.target.value)} placeholder="sentiment" />
        </OptionRow>
        <OptionRow label="cache" enabled={cacheOn} onToggle={setCacheOn} defaultCaption="Default: true — an identical call from this console within the TTL gets the stored answer at no cost.">
          <FormControlLabel control={<Checkbox checked={cache} onChange={(e) => setCache(e.target.checked)} />} label="Use the gateway's response cache" />
        </OptionRow>
        <OptionRow label="cache_prefix" enabled={cachePrefixOn} onToggle={setCachePrefixOn} defaultCaption="Default: true. Asks the provider (Anthropic) to cache the system prompt and, once there is an assistant turn, the history.">
          <FormControlLabel control={<Checkbox checked={cachePrefix} onChange={(e) => setCachePrefix(e.target.checked)} />} label="Let the provider cache the stable prefix" />
        </OptionRow>
        <OptionRow label="stream" enabled={streamOn} onToggle={setStreamOn} defaultCaption="Default: false — one JSON body. True answers with Server-Sent Events: start, deltas, then done or error.">
          <FormControlLabel control={<Checkbox checked={stream} onChange={(e) => setStream(e.target.checked)} />} label="Stream as SSE (also switches this console to its SSE transport)" />
        </OptionRow>
      </AccordionDetails>
    </Accordion>
  );
}
