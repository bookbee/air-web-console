"use client";

import SmartToyIcon from "@mui/icons-material/SmartToy";
import PersonIcon from "@mui/icons-material/Person";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

/** A single chat turn — the stand-in for `st.chat_message`. */
export function ChatBubble({ role, children }: { role: "user" | "assistant"; children: React.ReactNode }) {
  const isUser = role === "user";
  return (
    <Box sx={{ display: "flex", gap: 1.25, alignItems: "flex-start", mb: 1.5 }}>
      <Avatar sx={{ width: 28, height: 28, bgcolor: isUser ? "primary.main" : "secondary.main" }}>
        {isUser ? <PersonIcon fontSize="small" /> : <SmartToyIcon fontSize="small" />}
      </Avatar>
      <Box
        sx={{
          flex: 1,
          border: 1,
          borderColor: "divider",
          borderRadius: 1.5,
          p: 1.25,
          bgcolor: "background.paper",
        }}
      >
        <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
          {children}
        </Typography>
      </Box>
    </Box>
  );
}
