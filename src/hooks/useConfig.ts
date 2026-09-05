"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import type { PublicDefaults } from "@/lib/types";
import { useConnectionStore } from "@/store/connectionStore";
import { THEME_STORAGE_KEY, useThemeStore } from "@/store/themeStore";

async function fetchConfig(): Promise<PublicDefaults> {
  const response = await fetch("/api/config", {
    headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_AIR_WEB_GATEWAY_TOKEN ?? ""}` },
  });
  if (!response.ok) throw new Error(`GET /api/config failed: ${response.status}`);
  return response.json();
}

/** Loads the server-resolved, redacted target catalogue once and seeds
 * the connection store from it. */
export function useConfig() {
  const query = useQuery({ queryKey: ["config"], queryFn: fetchConfig, staleTime: Infinity });
  const hydrate = useConnectionStore((state) => state.hydrate);
  const hydrated = useConnectionStore((state) => state.hydrated);
  const setThemeMode = useThemeStore((state) => state.setMode);

  useEffect(() => {
    if (!query.data) return;
    hydrate(query.data);
  }, [query.data, hydrate]);

  useEffect(() => {
    if (!query.data) return;
    // AIR_WEB__THEME only seeds a genuinely first visit — once the browser
    // has its own persisted choice, `.env` is no longer consulted; changing
    // the server default after that only affects a fresh browser.
    const hasStoredChoice = window.localStorage.getItem(THEME_STORAGE_KEY) !== null;
    if (!hasStoredChoice) setThemeMode(query.data.theme);
  }, [query.data, setThemeMode]);

  return { ...query, hydrated: hydrated && Boolean(query.data) };
}
