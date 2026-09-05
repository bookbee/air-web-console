"use client";

import CheckIcon from "@mui/icons-material/Check";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import { useState } from "react";

/** A one-click copy on anything a developer would otherwise select by
 * hand — cURL snippets, base URLs, keys. */
export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleClick = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access denied — nothing useful to do beyond leaving the
      // button in its normal state.
    }
  };

  return (
    <Tooltip title={copied ? "Copied" : label}>
      <IconButton size="small" onClick={handleClick} aria-label={label}>
        {copied ? <CheckIcon fontSize="inherit" color="success" /> : <ContentCopyIcon fontSize="inherit" />}
      </IconButton>
    </Tooltip>
  );
}
