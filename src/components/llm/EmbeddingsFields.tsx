"use client";

import TextField from "@mui/material/TextField";
import { useEffect, useMemo, useState } from "react";

export function EmbeddingsFields({ onChange }: { onChange: (items: string[], errors: string[]) => void }) {
  const [raw, setRaw] = useState("");

  const { items, errors } = useMemo(() => {
    const parsed = raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    return { items: parsed, errors: parsed.length === 0 ? ["Supply at least one line of input."] : [] };
  }, [raw]);

  // `onChange` excluded deliberately — same reason as ChatFields.tsx.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => onChange(items, errors), [items, errors]);

  return (
    <TextField
      label="input · one string per line"
      multiline
      minRows={5}
      fullWidth
      value={raw}
      onChange={(e) => setRaw(e.target.value)}
      placeholder={"Great value for money.\nArrived broken."}
    />
  );
}
