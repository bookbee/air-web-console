/**
 * Where a base URL points, relative to this machine.
 *
 * Shared between the server (config loading) and the client (every
 * "LOCAL"/"REMOTE" indicator in the UI), so it lives on its own rather than
 * inside the server-only config module.
 */

export type Location = "local" | "remote" | "unset";

export const LOCAL_HOSTS: ReadonlySet<string> = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "0.0.0.0",
  "host.docker.internal",
]);

/** `"local"`, `"remote"` or `"unset"` for one base URL. Errs towards "remote":
 * a URL that cannot be parsed is not this machine. */
export function locationOf(baseUrl: string): Location {
  const trimmed = baseUrl.trim();
  if (!trimmed) return "unset";
  let host = "";
  try {
    host = new URL(trimmed).hostname.toLowerCase();
  } catch {
    return "remote";
  }
  if (!host) return "remote";
  if (LOCAL_HOSTS.has(host) || host.endsWith(".local")) return "local";
  return "remote";
}
