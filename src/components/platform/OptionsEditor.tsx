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

/** `TurnOptions` — ported from `_options_editor` in `tabs/platform.py`.
 * Unticked rows are omitted so the service's own default wins. */
export function OptionsEditor({ onChange }: { onChange: (options: Record<string, unknown>) => void }) {
  const [deadlineOn, setDeadlineOn] = useState(false);
  const [deadline, setDeadline] = useState(15000);
  const [costOn, setCostOn] = useState(false);
  const [cost, setCost] = useState(0.25);
  const [routesOn, setRoutesOn] = useState(false);
  const [routes, setRoutes] = useState("direct");
  const [cacheOn, setCacheOn] = useState(false);
  const [cache, setCache] = useState(true);
  const [piiOn, setPiiOn] = useState(false);
  const [pii, setPii] = useState(true);
  const [traceOn, setTraceOn] = useState(false);
  const [trace, setTrace] = useState(true);

  useEffect(() => {
    const options: Record<string, unknown> = {};
    if (deadlineOn) options.deadline_ms = deadline;
    if (costOn) options.max_cost_usd = cost;
    if (routesOn) {
      const list = routes.split(",").map((r) => r.trim()).filter(Boolean);
      if (list.length > 0) options.allow_routes = list;
    }
    if (cacheOn) options.use_cache = cache;
    if (piiOn) options.redact_pii = pii;
    if (traceOn) options.include_trace = trace;
    onChange(options);
    // `onChange` excluded deliberately — see classifier/OptionsEditor.tsx's
    // comment on the same pattern.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadlineOn, deadline, costOn, cost, routesOn, routes, cacheOn, cache, piiOn, pii, traceOn, trace]);

  return (
    <Accordion disableGutters elevation={0} sx={{ border: 1, borderColor: "divider", "&:before": { display: "none" } }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="body2">Options — tick a row to send it, leave clear to use the service default</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <OptionRow label="deadline_ms" enabled={deadlineOn} onToggle={setDeadlineOn} defaultCaption="Default: 15000 ms — see turn.deadline_ms in Capabilities.">
          <TextField type="number" size="small" fullWidth value={deadline} onChange={(e) => setDeadline(Number(e.target.value))} slotProps={{ htmlInput: { min: 100, max: 120000, step: 500 } }} />
        </OptionRow>
        <OptionRow label="max_cost_usd" enabled={costOn} onToggle={setCostOn} defaultCaption="Default: $0.25 per turn.">
          <TextField type="number" size="small" fullWidth value={cost} onChange={(e) => setCost(Number(e.target.value))} slotProps={{ htmlInput: { min: 0, max: 10, step: 0.05 } }} />
        </OptionRow>
        <OptionRow label="allow_routes" enabled={routesOn} onToggle={setRoutesOn} defaultCaption="Default: unset — the planner picks. Capabilities lists what exists.">
          <TextField size="small" fullWidth value={routes} onChange={(e) => setRoutes(e.target.value)} placeholder="direct" />
        </OptionRow>
        <OptionRow label="use_cache" enabled={cacheOn} onToggle={setCacheOn} defaultCaption="Default: on. Turn it off to force a cold turn while testing.">
          <FormControlLabel control={<Checkbox checked={cache} onChange={(e) => setCache(e.target.checked)} />} label="Serve from cache when possible" />
        </OptionRow>
        <OptionRow label="redact_pii" enabled={piiOn} onToggle={setPiiOn} defaultCaption="Default: on, per the guardrail profile of your channel.">
          <FormControlLabel control={<Checkbox checked={pii} onChange={(e) => setPii(e.target.checked)} />} label="Redact PII on the way in" />
        </OptionRow>
        <OptionRow label="include_trace" enabled={traceOn} onToggle={setTraceOn} defaultCaption="Default: true — the trace is what makes the pipeline legible.">
          <FormControlLabel control={<Checkbox checked={trace} onChange={(e) => setTrace(e.target.checked)} />} label="Return the stage trace" />
        </OptionRow>
      </AccordionDetails>
    </Accordion>
  );
}
