"use client";

import Divider from "@mui/material/Divider";
import FormControlLabel from "@mui/material/FormControlLabel";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Typography from "@mui/material/Typography";
import { useState } from "react";

import { RouteCard } from "@/components/shared/RouteCard";
import { TargetCaption } from "@/components/layout/TargetBar";
import type { Connection } from "@/lib/connection";

import { BatchForm } from "./BatchForm";
import { SingleForm } from "./SingleForm";

type Mode = "single" | "batch";

/** The air-classifier tab — ported from `tabs/classifier.py`. One endpoint
 * onto a four-rung escalation ladder: every request enters at the cheapest
 * rung and climbs only when the rung below is not confident enough. */
export function ClassifierTab({ connection }: { connection: Connection }) {
  const [mode, setMode] = useState<Mode>("single");

  return (
    <div>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        One endpoint onto a four-rung escalation ladder — <code>t0_rules</code> →{" "}
        <code>t1_classifier</code> → <code>t2_local_llm</code> → <code>t3_cloud_llm</code>. Every
        request enters at the cheapest rung and climbs only when the rung below is not confident
        enough; the response says how far it climbed and why.
      </Typography>
      <TargetCaption connection={connection} />

      <RouteCard
        path="POST /v1/classify · POST /v1/classify/batch"
        description="One entry point for any text — plain sentiment, product feedback, a marketplace review, or anything in between. The text and the fields you supply are what decide which of those it looks like, not which endpoint you called."
        detail={
          <>
            always returns: sentiment, urgency, routing, requires_human, actionability, emotions
            <br />
            only when the ladder reaches an LLM tier: tone, topics, intent, aspects
            <br />
            only when you supply <code>rating</code>: rating_consistency
          </>
        }
      />

      <Divider sx={{ my: 2 }} />

      <RadioGroup row value={mode} onChange={(e) => setMode(e.target.value as Mode)} sx={{ mb: 2 }}>
        <FormControlLabel value="single" control={<Radio size="small" />} label="Single" />
        <FormControlLabel value="batch" control={<Radio size="small" />} label="Batch" />
      </RadioGroup>

      {mode === "single" ? <SingleForm connection={connection} /> : <BatchForm connection={connection} />}
    </div>
  );
}
