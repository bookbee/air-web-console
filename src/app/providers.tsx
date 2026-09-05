"use client";

import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

import { useThemeStore } from "@/store/themeStore";
import { buildMuiTheme } from "@/theme/muiTheme";

/** Resolves the theme mode ("auto" follows the OS) into an actual
 * light/dark palette, and wires up the two providers every part of the
 * console depends on. */
export function Providers({ children }: { children: React.ReactNode }) {
  const mode = useThemeStore((state) => state.mode);
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");
  const resolvedMode = mode === "auto" ? (prefersDark ? "dark" : "light") : mode;

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, refetchOnWindowFocus: false },
          mutations: { retry: false },
        },
      }),
  );

  const theme = buildMuiTheme(resolvedMode);

  return (
    <AppRouterCacheProvider options={{ key: "mui" }}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}
