"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";

/** The "what this endpoint does" card used above every tab's form —
 * ported from the `.air-route` styling in `theme.py`, reused by
 * `_endpoint_card()`/`_route_cards()` across all three service tabs. */
export function RouteCard({
  path,
  description,
  detail,
  active = true,
}: {
  path: string;
  description: React.ReactNode;
  detail?: React.ReactNode;
  active?: boolean;
}) {
  const theme = useTheme();
  return (
    <Box
      sx={{
        border: 1,
        borderColor: active ? "primary.main" : "divider",
        borderRadius: 1.5,
        p: 1.25,
        height: "100%",
        bgcolor: active ? theme.air.chip.localBg : "background.default",
      }}
    >
      <Typography
        sx={{
          fontFamily: theme.air.fontMono,
          fontSize: "0.82rem",
          fontWeight: 600,
          color: "primary.main",
        }}
      >
        {path}
      </Typography>
      <Typography sx={{ fontSize: "0.82rem", mt: 0.4 }}>{description}</Typography>
      {detail && (
        <Typography sx={{ fontSize: "0.78rem", color: "text.secondary", mt: 0.5 }}>
          {detail}
        </Typography>
      )}
    </Box>
  );
}
