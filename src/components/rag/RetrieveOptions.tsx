"use client";

import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useEffect, useState } from "react";

import { OptionRow } from "@/components/shared/OptionRow";

import { TOP_K_DEFAULT, TOP_K_MAX, TOP_K_MIN } from "./data";

/** `POST /v1/retrieve`'s optional fields, tick-to-omit like every other
 * tab's editor: an unticked field is left out of the body, never sent at its
 * default. Out-of-range values stay sendable on purpose, so a tester sees the
 * service's 422. */
export function RetrieveOptions({
  initial = {},
  onChange,
}: {
  /** A preset's options: each one present starts ticked, at its value. */
  initial?: { top_k?: number; user_id?: string };
  onChange: (fields: Record<string, unknown>) => void;
}) {
  const [topKOn, setTopKOn] = useState("top_k" in initial);
  const [topK, setTopK] = useState(initial.top_k ?? TOP_K_DEFAULT);
  const [userIdOn, setUserIdOn] = useState("user_id" in initial);
  const [userId, setUserId] = useState(initial.user_id ?? "");

  useEffect(() => {
    const fields: Record<string, unknown> = {};
    if (topKOn) fields.top_k = topK;
    if (userIdOn) fields.user_id = userId;
    onChange(fields);
    // `onChange` excluded deliberately, as in classifier/OptionsEditor.tsx.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topKOn, topK, userIdOn, userId]);

  return (
    <>
      <OptionRow label="top_k" enabled={topKOn} onToggle={setTopKOn} defaultCaption={`omitted · the service uses ${TOP_K_DEFAULT}`}>
        <TextField
          type="number"
          size="small"
          value={Number.isFinite(topK) ? topK : ""}
          onChange={(event) => setTopK(Number.parseInt(event.target.value, 10))}
          slotProps={{ htmlInput: { step: 1 } }}
          helperText={
            topK < TOP_K_MIN || topK > TOP_K_MAX
              ? `Outside ${TOP_K_MIN}..${TOP_K_MAX}: sent anyway, expect a 422.`
              : `${TOP_K_MIN}..${TOP_K_MAX}. At most this many citations, best first.`
          }
          sx={{ width: 280 }}
        />
      </OptionRow>
      <OptionRow label="user_id" enabled={userIdOn} onToggle={setUserIdOn} defaultCaption="omitted">
        <TextField size="small" fullWidth value={userId} onChange={(event) => setUserId(event.target.value)} />
        <Typography variant="caption" color="text.secondary">
          Accepted for future per-user scoping; it doesn&apos;t change results today. It never selects a tenant.
        </Typography>
      </OptionRow>
    </>
  );
}
