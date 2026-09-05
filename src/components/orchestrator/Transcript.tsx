"use client";

import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";

import { ChatBubble } from "@/components/shared/ChatBubble";

export interface TranscriptTurn {
  role: "user" | "assistant";
  content: string;
}

export function Transcript({ turns, onClear }: { turns: TranscriptTurn[]; onClear: () => void }) {
  if (turns.length === 0) return null;
  return (
    <div>
      <Typography
        sx={{ fontSize: "0.74rem", fontWeight: 600, letterSpacing: "0.8px", textTransform: "uppercase", color: "text.secondary", mb: 1 }}
      >
        Transcript
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
        This session&apos;s turns, both routes. The service keeps its own history against{" "}
        <code>session_id</code>; this is only the local view.
      </Typography>
      <Button size="small" onClick={onClear} sx={{ mb: 1 }}>
        Clear transcript
      </Button>
      {turns.map((turn, index) => (
        <ChatBubble key={index} role={turn.role}>
          {turn.content}
        </ChatBubble>
      ))}
    </div>
  );
}
