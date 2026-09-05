"use client";

import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Slider from "@mui/material/Slider";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";

import { locationOf } from "@/lib/location";
import { useConnectionStore } from "@/store/connectionStore";
import { useThemeStore, type ThemeMode } from "@/store/themeStore";

/**
 * Connection settings — deliberately read-only. Base URL and X-API-Key are
 * resolved server-side (see `lib/config.ts`), so there is nothing here to
 * edit. The sidebar's job is purely "which target, and what does it look
 * like" — a target *picker*, not a target *editor*. Adding an environment
 * is a `.env` change on the server, not a sidebar edit.
 */

function LocationCaption({ baseUrl }: { baseUrl: string }) {
  const theme = useTheme();
  const location = locationOf(baseUrl);
  if (location === "unset") {
    return (
      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
        not configured on the server
      </Typography>
    );
  }
  const isRemote = location === "remote";
  return (
    <Typography
      variant="caption"
      sx={{ display: "block", color: isRemote ? theme.air.chip.remote : theme.air.chip.local }}
    >
      {isRemote ? "⬆ REMOTE" : "⌂ LOCAL"}
    </Typography>
  );
}

function ServiceStatus({ label, baseUrl, keyed, route }: { label: string; baseUrl: string; keyed: boolean; route: string }) {
  const theme = useTheme();
  return (
    <Box sx={{ mb: 1.25 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
        <Chip
          label={keyed ? "keyed" : "no key"}
          size="small"
          sx={{
            height: 18,
            fontSize: "0.65rem",
            fontWeight: 700,
            color: keyed ? theme.air.chip.key : theme.air.chip.nokey,
            bgcolor: "transparent",
            border: 1,
            borderColor: keyed ? theme.air.chip.key : theme.air.chip.nokey,
          }}
        />
      </Box>
      <Typography sx={{ fontFamily: theme.air.fontMono, fontSize: "0.82rem", wordBreak: "break-all" }}>
        {baseUrl || "— not configured —"}
      </Typography>
      <LocationCaption baseUrl={baseUrl} />
      {!keyed && (
        <Typography variant="caption" sx={{ display: "block", color: theme.air.chip.nokey }}>
          no key set on the server · <code>{route}</code> will return 401
        </Typography>
      )}
    </Box>
  );
}

export function Sidebar() {
  const targets = useConnectionStore((state) => state.targets);
  const selectedTarget = useConnectionStore((state) => state.selectedTarget);
  const selectTarget = useConnectionStore((state) => state.selectTarget);

  const timeoutSeconds = useConnectionStore((state) => state.timeoutSeconds);
  const setTimeoutSeconds = useConnectionStore((state) => state.setTimeoutSeconds);
  const usdToInrRate = useConnectionStore((state) => state.usdToInrRate);
  const setUsdToInrRate = useConnectionStore((state) => state.setUsdToInrRate);

  const themeMode = useThemeStore((state) => state.mode);
  const setThemeMode = useThemeStore((state) => state.setMode);

  const targetNames = Object.keys(targets);
  const target = targets[selectedTarget];

  return (
    <Box
      sx={{
        width: 320,
        flexShrink: 0,
        borderRight: 1,
        borderColor: "divider",
        p: 2,
        height: "100vh",
        overflowY: "auto",
        position: "sticky",
        top: 0,
      }}
    >
      <Typography variant="overline" color="text.secondary">
        Target
      </Typography>
      <FormControl fullWidth size="small" margin="dense">
        <InputLabel id="target-select-label">Environment</InputLabel>
        <Select
          labelId="target-select-label"
          label="Environment"
          value={targetNames.includes(selectedTarget) ? selectedTarget : ""}
          onChange={(event) => selectTarget(event.target.value)}
        >
          {targetNames.map((name) => (
            <MenuItem key={name} value={name}>
              {targets[name].label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      {targetNames.length === 1 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
          Only <code>local</code> is declared. Add <code>AIR_WEB__TARGETS__&lt;NAME&gt;__…</code>{" "}
          entries to the server&apos;s <code>.env</code> to add more.
        </Typography>
      )}

      <Divider sx={{ my: 2 }} />

      {target ? (
        <>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            air-classifier
          </Typography>
          <ServiceStatus
            label="Base URL"
            baseUrl={target.classifierBaseUrl}
            keyed={target.classifierKeyed}
            route="/v1/classify"
          />

          <Divider sx={{ my: 2 }} />

          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
            air-platform
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
            Two channels, one engine. The channel comes from the <b>key</b>, not a header — each
            route uses its own, resolved server-side.
          </Typography>
          <ServiceStatus
            label="Base URL · customer channel"
            baseUrl={target.platformBaseUrl}
            keyed={target.platformCustomerKeyed}
            route="/v1/chat"
          />
          <ServiceStatus
            label="Base URL · business channel"
            baseUrl={target.platformBaseUrl}
            keyed={target.platformBusinessKeyed}
            route="/v1/query"
          />

          <Divider sx={{ my: 2 }} />

          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            air-llm
          </Typography>
          <ServiceStatus label="Base URL" baseUrl={target.llmBaseUrl} keyed={target.llmKeyed} route="/v1/inference" />
        </>
      ) : (
        <Typography variant="caption" color="error">
          No target resolved — check the server&apos;s configuration.
        </Typography>
      )}

      <Divider sx={{ my: 2 }} />

      <Accordion disableGutters elevation={0} sx={{ "&:before": { display: "none" }, border: 1, borderColor: "divider" }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="body2">Request behaviour</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <TextField
            label="Timeout (seconds)"
            type="number"
            size="small"
            fullWidth
            margin="dense"
            value={timeoutSeconds}
            onChange={(event) => setTimeoutSeconds(Number(event.target.value) || 60)}
            slotProps={{ htmlInput: { min: 1, max: 120, step: 5 } }}
            helperText="Clamped server-side to 120s regardless of what's requested here."
          />
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5, mt: 1.5 }}>
            USD → INR rate ({usdToInrRate.toFixed(1)}) — display only, not a live feed.
          </Typography>
          <Slider
            value={usdToInrRate}
            onChange={(_, value) => setUsdToInrRate(value as number)}
            min={1}
            max={200}
            step={0.5}
            size="small"
          />
        </AccordionDetails>
      </Accordion>

      <Divider sx={{ my: 2 }} />

      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Appearance
      </Typography>
      <ToggleButtonGroup
        value={themeMode}
        exclusive
        size="small"
        fullWidth
        onChange={(_, value: ThemeMode | null) => value && setThemeMode(value)}
      >
        <ToggleButton value="auto">Auto</ToggleButton>
        <ToggleButton value="light">Light</ToggleButton>
        <ToggleButton value="dark">Dark</ToggleButton>
      </ToggleButtonGroup>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
        {themeMode === "auto" ? "Following your operating system." : "Overriding for this session."}
      </Typography>

      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2 }}>
        Base URLs and keys are resolved on the server — this app never holds or sends an upstream
        API key.
      </Typography>
    </Box>
  );
}
