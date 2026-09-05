"use client";

import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useEffect, useState } from "react";

import { OptionRow } from "@/components/shared/OptionRow";

import { TIERS } from "./data";

/**
 * `/v1/classify`'s `Options` — ported from `_options_editor` in
 * `tabs/classifier.py`. Every field is independent and tick-to-send: an
 * unticked row is omitted from the payload entirely rather than sent at a
 * default, since `Options.model_fields_set` is load-bearing server-side.
 */

export interface ClassifierOptionsHandle {
  setMinTier: (enabled: boolean, tier?: string) => void;
  setMaxTier: (enabled: boolean, tier?: string) => void;
}

export function OptionsEditor({
  onChange,
  registerHandle,
}: {
  onChange: (options: Record<string, unknown>) => void;
  registerHandle?: (handle: ClassifierOptionsHandle) => void;
}) {
  const [minTierOn, setMinTierOn] = useState(false);
  const [minTier, setMinTierValue] = useState<string>(TIERS[0]);
  const [maxTierOn, setMaxTierOn] = useState(false);
  const [maxTier, setMaxTierValue] = useState<string>(TIERS[3]);
  const [latencyOn, setLatencyOn] = useState(false);
  const [latency, setLatency] = useState(8000);
  const [costOn, setCostOn] = useState(false);
  const [cost, setCost] = useState(0.05);
  const [traceOn, setTraceOn] = useState(false);
  const [trace, setTrace] = useState(true);
  const [piiOn, setPiiOn] = useState(false);
  const [pii, setPii] = useState(true);
  const [aspectsOn, setAspectsOn] = useState(false);
  const [aspects, setAspects] = useState("battery, camera, price");

  useEffect(() => {
    registerHandle?.({
      setMinTier: (enabled, tier) => {
        setMinTierOn(enabled);
        if (tier) setMinTierValue(tier);
      },
      setMaxTier: (enabled, tier) => {
        setMaxTierOn(enabled);
        if (tier) setMaxTierValue(tier);
      },
    });
    // Registered once; the handle closes over setters, which are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const options: Record<string, unknown> = {};
    if (minTierOn) options.min_tier = minTier;
    if (maxTierOn) options.max_tier = maxTier;
    if (latencyOn) options.latency_budget_ms = latency;
    if (costOn) options.max_cost_usd = cost;
    if (traceOn) options.include_trace = trace;
    if (piiOn) options.redact_pii = pii;
    if (aspectsOn) {
      const list = aspects
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean)
        .slice(0, 20);
      if (list.length > 0) options.aspects = list;
    }
    onChange(options);
    // `onChange` is deliberately not a dependency: the parent (SingleForm/
    // BatchForm) passes `setOptions` directly here so it's stable, but other
    // options editors in this app receive a fresh inline callback each
    // render — including it would re-fire this effect on every parent
    // render and loop. Excluding it is safe: whenever the effect *does* run,
    // it always calls whichever `onChange` was passed most recently.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minTierOn, minTier, maxTierOn, maxTier, latencyOn, latency, costOn, cost, traceOn, trace, piiOn, pii, aspectsOn, aspects]);

  return (
    <Accordion disableGutters elevation={0} sx={{ border: 1, borderColor: "divider", "&:before": { display: "none" } }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="body2">Options — tick a row to send it, leave clear to use the service default</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
          Unticked options are omitted from the payload entirely — the service distinguishes
          &ldquo;caller said nothing&rdquo; from &ldquo;caller explicitly asked for this value&rdquo;, and some API
          keys reject the latter.
        </Typography>

        <OptionRow label="min_tier" enabled={minTierOn} onToggle={setMinTierOn} defaultCaption="Default: unset — the ladder starts at t0_rules.">
          <TextField select size="small" fullWidth value={minTier} onChange={(e) => setMinTierValue(e.target.value)}>
            {TIERS.map((t) => (
              <MenuItem key={t} value={t}>
                {t}
              </MenuItem>
            ))}
          </TextField>
        </OptionRow>

        <OptionRow label="max_tier" enabled={maxTierOn} onToggle={setMaxTierOn} defaultCaption="Default: t3_cloud_llm. Cap at t2_local_llm to keep text on-prem.">
          <TextField select size="small" fullWidth value={maxTier} onChange={(e) => setMaxTierValue(e.target.value)}>
            {TIERS.map((t) => (
              <MenuItem key={t} value={t}>
                {t}
              </MenuItem>
            ))}
          </TextField>
        </OptionRow>

        <OptionRow label="latency_budget_ms" enabled={latencyOn} onToggle={setLatencyOn} defaultCaption="Default: 8000 ms.">
          <TextField
            type="number"
            size="small"
            fullWidth
            value={latency}
            onChange={(e) => setLatency(Number(e.target.value))}
            slotProps={{ htmlInput: { min: 50, max: 30000, step: 250 } }}
          />
        </OptionRow>

        <OptionRow label="max_cost_usd" enabled={costOn} onToggle={setCostOn} defaultCaption="Default: $0.05 per request.">
          <TextField
            type="number"
            size="small"
            fullWidth
            value={cost}
            onChange={(e) => setCost(Number(e.target.value))}
            slotProps={{ htmlInput: { min: 0, max: 10, step: 0.01 } }}
          />
        </OptionRow>

        <OptionRow label="include_trace" enabled={traceOn} onToggle={setTraceOn} defaultCaption="Default: true — the trace is what makes the ladder legible.">
          <FormControlLabel
            control={<Checkbox checked={trace} onChange={(e) => setTrace(e.target.checked)} />}
            label="Return the escalation trace"
          />
        </OptionRow>

        <OptionRow label="redact_pii" enabled={piiOn} onToggle={setPiiOn} defaultCaption="Default: true. An explicit false can be refused by your API key.">
          <FormControlLabel
            control={<Checkbox checked={pii} onChange={(e) => setPii(e.target.checked)} />}
            label="Redact PII before it reaches a model"
          />
        </OptionRow>

        <OptionRow label="aspects" enabled={aspectsOn} onToggle={setAspectsOn} defaultCaption="Default: unset — the service picks aspects itself when the text has any. Max 20.">
          <TextField
            size="small"
            fullWidth
            value={aspects}
            onChange={(e) => setAspects(e.target.value)}
            placeholder="battery, camera, price"
          />
        </OptionRow>
      </AccordionDetails>
    </Accordion>
  );
}
