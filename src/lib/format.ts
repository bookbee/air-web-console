/**
 * Small, deliberately dumb value formatters shared by every summary panel —
 * so "—" renders the same way for the same kind of absence everywhere,
 * rather than each call site inventing its own fallback.
 */

/** A cell's color. "" is the neutral ink every value defaults to; the rest
 * are reserved for state actually worth a second look — a failure, a
 * ceiling reached, a flag raised — not for routinely differentiating
 * "positive" from "neutral". "muted" is for a value that is present but
 * uninteresting. */
export type Kind = "" | "ok" | "warn" | "err" | "muted";

export function yn(value: unknown): string {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "—";
}

export function num(value: unknown, digits?: number): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return digits === undefined ? String(value) : value.toFixed(digits);
}

export function pct(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${Math.round(value * 100)}%`;
}

export function text(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

/** Illustrative only, not fetched live — the sidebar's Currency control can
 * override it for the session. */
export const DEFAULT_USD_TO_INR_RATE = 87.0;

/** `$0.00042 · ~₹0.04` for one cost figure — USD first, since that is what
 * every provider actually bills in. */
export function formatCost(amount: number, rate: number, precision = 5): string {
  const usd = amount.toFixed(precision);
  const inr = (amount * rate).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `$${usd} · ~₹${inr}`;
}
