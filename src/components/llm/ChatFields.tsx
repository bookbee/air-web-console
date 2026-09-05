"use client";

import DeleteIcon from "@mui/icons-material/Delete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useEffect, useMemo, useState } from "react";

import { parseJsonArray } from "@/lib/validators";

export interface ChatMessage {
  role: string;
  content: string;
}

type Mode = "single" | "conversation" | "advanced";

/**
 * air-llm's `messages` field, with a **Conversation builder** mode
 * alongside the raw-JSON "Advanced" one. air-llm keeps no conversation
 * state of its own (no `session_id`), so a genuine multi-turn exchange
 * means resending the whole transcript every call; hand-pasting that JSON
 * is functional but not friendly, so this mode builds the same array by
 * appending messages in the UI instead.
 */
export function ChatFields({ onChange }: { onChange: (messages: ChatMessage[], errors: string[]) => void }) {
  const [mode, setMode] = useState<Mode>("single");
  const [singleText, setSingleText] = useState("");
  const [conversation, setConversation] = useState<ChatMessage[]>([]);
  const [draftRole, setDraftRole] = useState("user");
  const [draftContent, setDraftContent] = useState("");
  const [advancedRaw, setAdvancedRaw] = useState("");

  const { messages, errors } = useMemo(() => {
    if (mode === "single") {
      if (!singleText.trim()) return { messages: [] as ChatMessage[], errors: ["message is required."] };
      return { messages: [{ role: "user", content: singleText }], errors: [] };
    }
    if (mode === "conversation") {
      if (conversation.length === 0) return { messages: [] as ChatMessage[], errors: ["Add at least one message."] };
      return { messages: conversation, errors: [] };
    }
    const result = parseJsonArray<ChatMessage>(advancedRaw, "messages");
    if (result.error) return { messages: [] as ChatMessage[], errors: [result.error] };
    if (!result.value || result.value.length === 0) return { messages: [] as ChatMessage[], errors: ["messages is required."] };
    const valid = result.value.every((m) => m && typeof m.role === "string" && typeof m.content === "string");
    if (!valid) {
      return { messages: [] as ChatMessage[], errors: ['every element of messages must be an object with string "role" and "content".'] };
    }
    return { messages: result.value, errors: [] };
  }, [mode, singleText, conversation, advancedRaw]);

  // `onChange` excluded deliberately — LlmTab passes a fresh inline
  // callback each render; see classifier/OptionsEditor.tsx's comment on the
  // same pattern.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => onChange(messages, errors), [messages, errors]);

  const addMessage = () => {
    if (!draftContent.trim()) return;
    setConversation((prev) => [...prev, { role: draftRole, content: draftContent }]);
    setDraftContent("");
  };

  return (
    <Box>
      <RadioGroup row value={mode} onChange={(e) => setMode(e.target.value as Mode)} sx={{ mb: 1.5 }}>
        <FormControlLabel value="single" control={<Radio size="small" />} label="Single message" />
        <FormControlLabel value="conversation" control={<Radio size="small" />} label="Conversation builder" />
        <FormControlLabel value="advanced" control={<Radio size="small" />} label="Advanced: paste JSON" />
      </RadioGroup>

      {mode === "single" && (
        <TextField
          label="message · required"
          multiline
          minRows={4}
          fullWidth
          value={singleText}
          onChange={(e) => setSingleText(e.target.value)}
          placeholder="Where is my order?"
        />
      )}

      {mode === "conversation" && (
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
            air-llm keeps no conversation state — there is no session id — so the whole transcript
            below is resent on every call.
          </Typography>
          {conversation.map((message, index) => (
            <Stack key={index} direction="row" spacing={1} sx={{ mb: 1, alignItems: "flex-start" }}>
              <TextField select size="small" value={message.role} sx={{ width: 130 }} disabled>
                <MenuItem value={message.role}>{message.role}</MenuItem>
              </TextField>
              <Typography variant="body2" sx={{ flex: 1, whiteSpace: "pre-wrap", pt: 1 }}>
                {message.content}
              </Typography>
              <IconButton
                size="small"
                onClick={() => setConversation((prev) => prev.filter((_, i) => i !== index))}
                aria-label="Remove message"
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Stack>
          ))}
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <TextField select size="small" value={draftRole} onChange={(e) => setDraftRole(e.target.value)} sx={{ width: 130 }}>
              <MenuItem value="user">user</MenuItem>
              <MenuItem value="assistant">assistant</MenuItem>
              <MenuItem value="system">system</MenuItem>
            </TextField>
            <TextField
              size="small"
              fullWidth
              value={draftContent}
              onChange={(e) => setDraftContent(e.target.value)}
              placeholder="Message content…"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  addMessage();
                }
              }}
            />
            <Button variant="outlined" onClick={addMessage}>
              Add
            </Button>
          </Stack>
        </Box>
      )}

      {mode === "advanced" && (
        <TextField
          label="messages · JSON array of {role, content} objects"
          multiline
          minRows={6}
          fullWidth
          value={advancedRaw}
          onChange={(e) => setAdvancedRaw(e.target.value)}
          placeholder={
            '[\n  {"role": "user", "content": "What is my order status?"},\n' +
            '  {"role": "assistant", "content": "Could you share the order id?"},\n' +
            '  {"role": "user", "content": "SUP-4821"}\n]'
          }
        />
      )}
    </Box>
  );
}
