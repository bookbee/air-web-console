"use client";

import Divider from "@mui/material/Divider";
import FormControlLabel from "@mui/material/FormControlLabel";
import Grid from "@mui/material/Grid";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Typography from "@mui/material/Typography";
import { useState } from "react";

import { RouteCard } from "@/components/shared/RouteCard";
import { TargetCaption } from "@/components/layout/TargetBar";
import type { Connection } from "@/lib/connection";

import { BatchForm } from "./BatchForm";
import { SingleForm } from "./SingleForm";
import { SummaryForm } from "./SummaryForm";

type Mode = "single" | "batch" | "summary";

interface ModeCard {
  key: Mode;
  path: string;
  description: string;
  detail: string;
}

const MODE_CARDS: readonly ModeCard[] = [
  {
    key: "single",
    path: "POST /v1/classify",
    description: "Analyse one piece of text — sentiment, tone, urgency and more.",
    detail: "body field: text",
  },
  {
    key: "batch",
    path: "POST /v1/classify/batch",
    description: "Analyse many texts in one call, same response shape per item.",
    detail: "body field: items[]",
  },
  {
    key: "summary",
    path: "POST /v1/summary/refresh",
    description: "Fold new feedback or reviews into a caller-stored rolling customer summary.",
    detail: "stateless — body fields: customer_id, items[]",
  },
];

/** The air-classifier-service tab — ported from `tabs/classifier.py`, plus a third
 * mode for the service's `/v1/summary/refresh` route. Single/Batch put one
 * endpoint onto a four-rung escalation ladder: every request enters at the
 * cheapest rung and climbs only when the rung below is not confident
 * enough. Summary is stateless and built on the same ladder — it folds new
 * items into a caller-stored rolling summary rather than analysing text in
 * isolation. Laid out the same way the Orchestrator tab lays out its own
 * routes: the mode picker first, then one compact card per option. */
export function ClassifierTab({ connection }: { connection: Connection }) {
  const [mode, setMode] = useState<Mode>("single");

  return (
    <div>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Three ways into air-classifier-service&apos;s four-rung escalation ladder —{" "}
        <code>t0_rules</code> → <code>t1_classifier</code> → <code>t2_local_llm</code> →{" "}
        <code>t3_cloud_llm</code>. Analyse one text, a batch of many, or fold new items into a
        caller-stored rolling customer summary — every request enters at the cheapest rung and
        climbs only when the rung below isn&apos;t confident enough.
      </Typography>

      <RadioGroup row value={mode} onChange={(e) => setMode(e.target.value as Mode)} sx={{ mb: 1.5 }}>
        <FormControlLabel value="single" control={<Radio size="small" />} label="Single" />
        <FormControlLabel value="batch" control={<Radio size="small" />} label="Batch" />
        <FormControlLabel value="summary" control={<Radio size="small" />} label="Summary" />
      </RadioGroup>

      <TargetCaption connection={connection} />

      <Grid container spacing={2} sx={{ mb: 1.5 }}>
        {MODE_CARDS.map((card) => (
          <Grid key={card.key} size={{ xs: 12, sm: 4 }}>
            <RouteCard
              path={card.path}
              description={card.description}
              detail={card.detail}
              active={card.key === mode}
            />
          </Grid>
        ))}
      </Grid>

      <Divider sx={{ my: 2 }} />

      {mode === "single" && <SingleForm connection={connection} />}
      {mode === "batch" && <BatchForm connection={connection} />}
      {mode === "summary" && <SummaryForm connection={connection} />}
    </div>
  );
}
