"use client";

import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useEffect, useMemo, useState } from "react";

import { FALLBACK_EMBED_MODELS, isAvailable, type Capabilities } from "./data";

/** `POST /v1/embed`'s body: `model` is required (it is the index's
 * identity, so there is no default to fall back to) and `input` is one
 * text per line. */
export function EmbeddingsFields({
  capabilities,
  onChange,
}: {
  capabilities: Capabilities | null;
  onChange: (body: { model: string; input: string[] }, errors: string[]) => void;
}) {
  const [model, setModel] = useState("local-768-v1");
  const [raw, setRaw] = useState("");
  const published = capabilities?.embed ? Object.keys(capabilities.embed) : FALLBACK_EMBED_MODELS;
  const spec = capabilities?.embed?.[model];

  const { input, errors } = useMemo(() => {
    const parsed = raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const problems = parsed.length === 0 ? ["Supply at least one line of input."] : [];
    if (!model.trim()) problems.push("Name an embedding model.");
    return { input: parsed, errors: problems };
  }, [raw, model]);

  // `onChange` excluded deliberately — same reason as ChatFields.tsx.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => onChange({ model: model.trim(), input }, errors), [model, input, errors]);

  return (
    <Box>
      <Autocomplete
        freeSolo
        size="small"
        options={published}
        inputValue={model}
        onInputChange={(_, value) => setModel(value)}
        renderInput={(params) => <TextField {...params} label="model · <local|cloud>-<dimensions>-v<version>" />}
        sx={{ mb: 0.5 }}
      />
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
        {spec
          ? `${spec.provider}:${spec.model}, ${spec.dimensions} dimensions${spec.allowed ? "" : " — not granted to this console"}${capabilities && !isAvailable(capabilities, spec) ? ` — ${spec.provider} not configured here` : ""}. One model, never a fallback.`
          : "Not a published name here (expect 422), or capabilities not loaded yet."}
      </Typography>
      <TextField
        label="input · one text per line"
        multiline
        minRows={5}
        fullWidth
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        placeholder={"Great value for money.\nArrived broken."}
      />
    </Box>
  );
}
