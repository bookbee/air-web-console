"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import { useTheme } from "@mui/material/styles";

import { isRemote, type Connection } from "@/lib/connection";

/** The Send button and, beside it, the exact destination it will hit —
 * ported from every tab's `_send_row`. */
export function SendRow({
  label = "Send",
  url,
  connection,
  errors,
  loading,
  onSend,
  extra,
}: {
  label?: string;
  url: string;
  connection: Connection;
  errors: string[];
  loading?: boolean;
  onSend: () => void;
  extra?: React.ReactNode;
}) {
  const theme = useTheme();
  const remote = isRemote(connection);

  return (
    <Box sx={{ my: 1.5 }}>
      <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
        <Button
          variant="contained"
          onClick={onSend}
          disabled={errors.length > 0 || loading}
          startIcon={loading ? <CircularProgress size={14} color="inherit" /> : undefined}
        >
          {label}
        </Button>
        <Typography sx={{ fontFamily: theme.air.fontMono, fontSize: "0.82rem", color: "text.secondary" }}>
          POST {url}{" "}
          <Box
            component="span"
            sx={{
              ml: 0.5,
              px: 0.8,
              py: 0.05,
              borderRadius: 0.5,
              fontSize: "0.68rem",
              fontWeight: 700,
              bgcolor: remote ? theme.air.chip.remoteBg : theme.air.chip.localBg,
              color: remote ? theme.air.chip.remote : theme.air.chip.local,
            }}
          >
            {remote ? "REMOTE" : "LOCAL"}
          </Box>
        </Typography>
        {extra}
      </Stack>
      {errors.map((message) => (
        <Alert severity="warning" key={message} sx={{ mt: 1 }}>
          {message}
        </Alert>
      ))}
    </Box>
  );
}
