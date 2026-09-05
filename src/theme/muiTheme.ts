/**
 * The console's skin, in light and dark. The brief is Postman/Insomnia,
 * not a landing page: one accent
 * colour, flat surfaces, status carried by a single unmissable pill,
 * information density over whitespace, and a typeface split — Inter for
 * chrome, JetBrains Mono for anything a developer copies verbatim (URLs,
 * keys, JSON).
 *
 * Both palettes are first-class: QA sessions run for hours, so nothing
 * below hardcodes a colour outside `LIGHT_TOKENS`/`DARK_TOKENS`. The
 * `air` theme extension carries the tokens `DashboardGrid`, the target bar
 * and the status pill read directly, so every one of those components
 * stays a thin consumer of one palette rather than hardcoding its own.
 */
import { createTheme, type Theme, type ThemeOptions } from "@mui/material/styles";

export interface AirTokens {
  surfaceWarn: string;
  codeBg: string;
  kind: Record<"ok" | "warn" | "err" | "muted", string>;
  badge: Record<
    "positive" | "negative" | "neutral" | "mixed" | "unknown",
    { bg: string; line: string; ink: string }
  >;
  chip: {
    local: string;
    remote: string;
    unset: string;
    key: string;
    nokey: string;
    localBg: string;
    remoteBg: string;
  };
  fontMono: string;
}

declare module "@mui/material/styles" {
  interface Theme {
    air: AirTokens;
  }
  interface ThemeOptions {
    air?: AirTokens;
  }
}

const FONT_UI = "var(--font-inter), system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const FONT_MONO =
  "var(--font-jetbrains-mono), ui-monospace, SFMono-Regular, Menlo, monospace";

const LIGHT_TOKENS: AirTokens = {
  surfaceWarn: "#fffaf2",
  codeBg: "#f1f3f4",
  kind: { ok: "#188038", warn: "#b06000", err: "#c5221f", muted: "#5f6368" },
  badge: {
    positive: { bg: "#e6f4ea", line: "#ceead6", ink: "#188038" },
    negative: { bg: "#fce8e6", line: "#f6cbc9", ink: "#c5221f" },
    neutral: { bg: "#f1f3f4", line: "#dadce0", ink: "#5f6368" },
    mixed: { bg: "#fef7e0", line: "#feefc3", ink: "#b06000" },
    unknown: { bg: "#f1f3f4", line: "#dadce0", ink: "#5f6368" },
  },
  chip: {
    local: "#1a73e8",
    remote: "#b06000",
    unset: "#c5221f",
    key: "#188038",
    nokey: "#c5221f",
    localBg: "#e8f0fe",
    remoteBg: "#feefc3",
  },
  fontMono: FONT_MONO,
};

const DARK_TOKENS: AirTokens = {
  surfaceWarn: "#1e1a12",
  codeBg: "#161a21",
  kind: { ok: "#81c995", warn: "#fdd663", err: "#f28b82", muted: "#9aa0a6" },
  badge: {
    positive: { bg: "rgba(129,201,149,.15)", line: "rgba(129,201,149,.38)", ink: "#81c995" },
    negative: { bg: "rgba(242,139,130,.15)", line: "rgba(242,139,130,.38)", ink: "#f28b82" },
    neutral: { bg: "rgba(154,160,166,.14)", line: "#2c313a", ink: "#9aa0a6" },
    mixed: { bg: "rgba(253,214,99,.14)", line: "rgba(253,214,99,.36)", ink: "#fdd663" },
    unknown: { bg: "rgba(154,160,166,.14)", line: "#2c313a", ink: "#9aa0a6" },
  },
  chip: {
    local: "#8ab4f8",
    remote: "#fdd663",
    unset: "#f28b82",
    key: "#81c995",
    nokey: "#f28b82",
    localBg: "rgba(138,180,248,.18)",
    remoteBg: "rgba(253,214,99,.18)",
  },
  fontMono: FONT_MONO,
};

function baseOptions(mode: "light" | "dark", tokens: AirTokens): ThemeOptions {
  const isDark = mode === "dark";
  return {
    air: tokens,
    palette: {
      mode,
      primary: { main: isDark ? "#8ab4f8" : "#1a73e8" },
      error: { main: isDark ? "#f28b82" : "#c5221f" },
      warning: { main: isDark ? "#fdd663" : "#b06000" },
      success: { main: isDark ? "#81c995" : "#188038" },
      background: {
        default: isDark ? "#0e1117" : "#ffffff",
        paper: isDark ? "#171a21" : "#f8f9fa",
      },
      text: {
        primary: isDark ? "#e6e8eb" : "#202124",
        secondary: isDark ? "#9aa0a6" : "#5f6368",
      },
      divider: isDark ? "#2c313a" : "#dadce0",
    },
    shape: { borderRadius: 8 },
    typography: {
      fontFamily: FONT_UI,
      fontSize: 13.5,
      button: { textTransform: "none", fontWeight: 600 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: { colorScheme: mode },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: { borderRadius: 7, paddingInline: 14 },
        },
      },
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: { backgroundImage: "none" },
        },
      },
      MuiTabs: {
        styleOverrides: {
          root: { minHeight: 38, borderBottom: `1px solid ${isDark ? "#2c313a" : "#dadce0"}` },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            minHeight: 38,
            fontWeight: 500,
            textTransform: "none",
          },
        },
      },
      MuiTextField: {
        defaultProps: { size: "small" },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: { borderRadius: 7 },
        },
      },
    },
  };
}

export function buildMuiTheme(mode: "light" | "dark"): Theme {
  return createTheme(baseOptions(mode, mode === "dark" ? DARK_TOKENS : LIGHT_TOKENS));
}
