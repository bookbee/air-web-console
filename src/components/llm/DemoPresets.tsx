"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";

/** A row of one-click examples. Picking one only fills the form below; the
 * request still goes out exactly as the form and its body preview show. */
export function DemoPresets<P extends { id: string; label: string; blurb: string }>({
  presets,
  picked,
  blockerFor,
  onPick,
}: {
  presets: readonly P[];
  picked: P | null;
  blockerFor?: (preset: P) => string | null;
  onPick: (preset: P) => void;
}) {
  return (
    <Box sx={{ mb: 2 }}>
      <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
          Try:
        </Typography>
        {presets.map((preset) => {
          const blocker = blockerFor?.(preset) ?? null;
          const button = (
            <Button
              size="small"
              variant={picked?.id === preset.id ? "contained" : "outlined"}
              disabled={blocker !== null}
              onClick={() => onPick(preset)}
            >
              {preset.label}
            </Button>
          );
          return blocker ? (
            <Tooltip key={preset.id} title={`Unavailable here: ${blocker}`}>
              <span>{button}</span>
            </Tooltip>
          ) : (
            <Box component="span" key={preset.id}>
              {button}
            </Box>
          );
        })}
      </Box>
      {picked && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {picked.blurb}
        </Typography>
      )}
    </Box>
  );
}
