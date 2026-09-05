/**
 * Pure bearer-token parsing/comparison — no `server-only` guard, so it's
 * directly unit-testable (unlike `gatewayAuth.ts`, which wraps this with
 * `NextRequest`/`NextResponse` and does carry that guard).
 */
import { timingSafeEqual } from "node:crypto";

/** `"Bearer xyz"` → `"xyz"`; anything else (missing header, wrong scheme,
 * empty token) → `null`. */
export function parseBearerToken(header: string | null): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

/** Constant-time string comparison, so a wrong-length or wrong-content
 * guess can't be distinguished by response timing. */
export function tokensMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // Buffers of different lengths would make timingSafeEqual throw; the
  // length check itself leaks only the expected token's length, which is
  // not sensitive.
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
