/**
 * The Model Gateway tab's demo layer: one-click presets that fill the form
 * to show each thing the gateway does, and the pure reads that make an
 * answer tell its story (which rung of the chain answered, how alike the
 * embedded texts are). Presets only fill the form; what is sent is still
 * exactly what the form shows. Pure, so it is unit-tested alongside.
 */

import type { Capabilities, ModelClass } from "./data";

export interface GeneratePreset {
  id: string;
  label: string;
  /** One line for the audience: what this shows. */
  blurb: string;
  message: string;
  /** Request fields, ticked in the options editor. Cloud presets leave
   * max_tokens unset: Gemini thinks first, and a tight cap cuts the answer
   * off (finish_reason: length), which also keeps it out of the cache. */
  options: Record<string, unknown>;
  needs: { modelClass?: ModelClass; provider?: string; pin?: boolean };
}

export interface EmbedPreset {
  id: string;
  label: string;
  blurb: string;
  model: string;
  input: string[];
}

const SENTIMENT_SCHEMA = {
  type: "object",
  properties: {
    sentiment: { type: "string", enum: ["positive", "neutral", "negative"] },
    reason: { type: "string" },
  },
  required: ["sentiment", "reason"],
  additionalProperties: false,
};

const LATE_PARCEL = "In one sentence, why might a customer's parcel arrive late?";

export const GENERATE_PRESETS: readonly GeneratePreset[] = [
  {
    id: "local",
    label: "Local & private",
    blurb: "model: local. Answered by our own model servers: the prompt never leaves the network, and it costs nothing.",
    message: LATE_PARCEL,
    options: { model: "local", max_tokens: 120 },
    needs: { modelClass: "local" },
  },
  {
    id: "cloud",
    label: "Cloud",
    blurb: "model: cloud. The first cloud model in the chain that's up answers, and cost_usd is what it cost. Send it again: the gateway's cache answers in milliseconds, at no cost.",
    message: LATE_PARCEL,
    options: { model: "cloud" },
    needs: { modelClass: "cloud" },
  },
  {
    id: "prefer",
    label: "Prefer Anthropic",
    blurb: "provider moves Anthropic's models to the front of the chain. The rest stay as fallback, so the call still succeeds if Anthropic is down.",
    message: LATE_PARCEL,
    options: { model: "cloud", provider: "anthropic" },
    needs: { modelClass: "cloud", provider: "anthropic" },
  },
  {
    id: "structured",
    label: "Structured JSON",
    blurb: "json_schema. The answer comes back as JSON shaped by the schema, ready for code to use. The console checks it parses.",
    message: "Classify the sentiment and give a one-line reason: the parcel came two days late, but support refunded the shipping fast.",
    options: { json_schema: SENTIMENT_SCHEMA, schema_name: "sentiment", max_tokens: 300 },
    needs: {},
  },
  {
    id: "stream",
    label: "Streaming",
    blurb: "stream: true. The answer appears as it's generated. Send it again: the cached answer replays instantly, at no cost.",
    message: "Write four short lines about the monsoon arriving in Mumbai.",
    options: { model: "local", stream: true, max_tokens: 300 },
    needs: { modelClass: "local" },
  },
  {
    id: "pin",
    label: "Pin one model",
    blurb: "pin names one exact provider:model, with no fallback. It's for operator tools, and needs the pin grant.",
    message: LATE_PARCEL,
    options: { pin: "anthropic:claude-haiku-4-5" },
    needs: { provider: "anthropic", pin: true },
  },
];

export const EMBED_PRESETS: readonly EmbedPreset[] = [
  {
    id: "similarity",
    label: "Similar meanings",
    blurb: "Four texts in, four vectors out. The grid shows how alike each pair is: the two late-delivery complaints score highest, though they share almost no words.",
    model: "local-768-v1",
    input: [
      "The delivery was late.",
      "My parcel turned up after the promised date.",
      "Great value for money.",
      "The product broke after a week.",
    ],
  },
];

/** Why a preset can't succeed for this console here, or null if it can.
 * Unknown capabilities never block: the gateway's answer is the truth. */
export function presetBlocker(capabilities: Capabilities | null, needs: GeneratePreset["needs"]): string | null {
  if (!capabilities) return null;
  if (needs.modelClass) {
    const entry = capabilities.generate?.[needs.modelClass];
    if (entry && !entry.allowed) return `class ${needs.modelClass} isn't granted to this console here`;
    if (entry && entry.available === false) return `no provider behind class ${needs.modelClass} is configured`;
  }
  if (needs.provider && capabilities.providers?.[needs.provider] === false) return `${needs.provider} isn't configured on this gateway`;
  if (needs.pin && capabilities.may_pin === false) return "this console may not pin here";
  return null;
}

export type RungState = "missed" | "served" | "unused";

const providerOf = (rung: string): string => rung.split(":")[0];

/** The chain behind the answer's class, in the order the gateway tried it,
 * with the rung that answered marked. Rungs before it didn't answer (down,
 * over quota, circuit open, or they failed): that is failover, made
 * visible. A provider preference moves that provider's rungs first, as the
 * gateway does. Null when there is no chain to show (a pin, an error, or an
 * answer that matches no rung). */
export function chainOutcome(
  capabilities: Capabilities | null,
  request: unknown,
  body: Record<string, unknown>,
): { rung: string; state: RungState }[] | null {
  const modelClass = body.model_class;
  if (typeof modelClass !== "string" || typeof body.provider !== "string" || typeof body.model !== "string") return null;
  let chain = capabilities?.generate?.[modelClass]?.chain;
  if (!chain) return null;
  const preferred = request && typeof request === "object" ? (request as { provider?: unknown }).provider : undefined;
  if (typeof preferred === "string") {
    chain = [...chain.filter((rung) => providerOf(rung) === preferred), ...chain.filter((rung) => providerOf(rung) !== preferred)];
  }
  const served = chain.indexOf(`${body.provider}:${body.model}`);
  if (served < 0) return null;
  return chain.map((rung, index) => ({
    rung,
    state: index < served ? "missed" : index === served ? "served" : "unused",
  }));
}

/** Cosine similarity of every pair of vectors, in input order. */
export function similarityMatrix(vectors: readonly (readonly number[])[]): number[][] {
  const norms = vectors.map((vector) => Math.sqrt(vector.reduce((sum, x) => sum + x * x, 0)));
  return vectors.map((a, i) =>
    vectors.map((b, j) => {
      if (norms[i] === 0 || norms[j] === 0) return 0;
      let dot = 0;
      for (let k = 0; k < Math.min(a.length, b.length); k += 1) dot += a[k] * b[k];
      return dot / (norms[i] * norms[j]);
    }),
  );
}
