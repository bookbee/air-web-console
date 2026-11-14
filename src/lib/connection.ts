/**
 * What the console is pointed at, right now.
 *
 * One value object per service, held in the client-side connection store and
 * handed to every tab and to the BFF proxy routes. It carries more than the
 * transport strictly needs — the service's name, the target it came from —
 * because the console's most important job is telling you *where* a request
 * is about to go, and that answer has to travel with the request.
 *
 * Deliberately holds no API key: the browser never sees one. `authenticated`
 * is a boolean the server already computed (`GET /api/config`'s
 * `*Keyed` flags) — the client can display "keyed"/"no key" without ever
 * holding the credential itself.
 */

import type { CustomerTokenMode } from "./customerTokenModes";
import { locationOf, type Location } from "./location";

export type ServiceName =
  | "air-classifier-service"
  | "air-orchestrator-service"
  | "air-model-gateway"
  | "air-rag-service";

export interface Connection {
  service: ServiceName;
  target: string;
  targetLabel: string;
  baseUrl: string;
  authenticated: boolean;
  timeoutSeconds: number;
  /** air-orchestrator-service's channel, when the service has one. It belongs to the key
   * rather than the request, so it travels with the connection. */
  channel?: "customer" | "business";
  /** Customer channel only: the customer a request is made "as". A name the
   * target's own config lists; the BFF mints the token, the browser never
   * holds one. Absent: an anonymous customer. */
  customer?: string;
  /** A dev-only SIT mode for that token, applied by the BFF only where the
   * target allows test modes. */
  customerTokenMode?: CustomerTokenMode;
}

export function connectionLocation(connection: Connection): Location {
  return locationOf(connection.baseUrl);
}

export function isRemote(connection: Connection): boolean {
  return connectionLocation(connection) === "remote";
}

export function isAuthenticated(connection: Connection): boolean {
  return connection.authenticated;
}

/** Service name, qualified by channel when there is one. */
export function connectionLabel(connection: Connection): string {
  return connection.channel ? `${connection.service} · ${connection.channel}` : connection.service;
}

/** Host and port, for indicators too narrow to carry the whole URL. */
export function connectionHost(connection: Connection): string {
  try {
    return new URL(connection.baseUrl).host || connection.baseUrl || "—";
  } catch {
    return connection.baseUrl || "—";
  }
}
