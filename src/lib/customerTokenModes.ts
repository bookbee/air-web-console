/**
 * The customer-token vocabulary the browser may use, with no server-only
 * dependency: the SIT test modes the client may *name* (the BFF applies them,
 * from this fixed list, only where test modes are allowed), and the display
 * summary the BFF attaches to an `Exchange` in place of the token itself.
 */

export const CUSTOMER_TOKEN_MODES = ["valid", "expired", "wrong-tenant", "tampered"] as const;
export type CustomerTokenMode = (typeof CUSTOMER_TOKEN_MODES)[number];

export const MODE_LABELS: Record<CustomerTokenMode, string> = {
  valid: "valid",
  expired: "expired",
  "wrong-tenant": "wrong tenant",
  tampered: "tampered",
};

/** An unknown or missing value means `valid`. */
export function parseMode(raw: string | null | undefined): CustomerTokenMode {
  return (CUSTOMER_TOKEN_MODES as readonly string[]).includes(raw ?? "") ? (raw as CustomerTokenMode) : "valid";
}

/** What the response pane shows about who a request was for. Never the token. */
export interface CustomerTokenClaims {
  sub: string;
  tenant: string;
  issuer: string;
  kid: string;
  /** ISO 8601. */
  expiresAt: string;
  mode: CustomerTokenMode;
}

/** "as customer cust_1001 (token minted by the console, expires in 10 min)". */
export function describeCustomer(claims: CustomerTokenClaims | undefined, now: number = Date.now()): string {
  if (!claims) return "as an anonymous customer";
  const minutes = Math.round((Date.parse(claims.expiresAt) - now) / 60_000);
  const expiry = minutes >= 0 ? `expires in ${minutes} min` : `expired ${-minutes} min ago`;
  const mode = claims.mode === "valid" ? "" : `, test mode: ${MODE_LABELS[claims.mode]}`;
  return `as customer ${claims.sub} (token minted by the console, ${expiry}${mode})`;
}
