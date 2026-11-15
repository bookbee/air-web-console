/**
 * air-tools-gateway's two key scopes, and the one request header the BFF
 * passes through to it.
 *
 * Each gateway tenant has a `read` key (capabilities, tools, propose) and an
 * `execute` key (execute, and nothing else). The BFF picks which one to
 * attach from the *route being called*, never from a client header: the
 * browser can't ask for the execute key on a read route, or the other way
 * round. That's why a scope mismatch (a 403 from the gateway) is a
 * `make tools-check` headless row, not something the UI can send.
 *
 * `Idempotency-Key` is part of the execute request under test (the gateway
 * validates it: 16–128 characters of `[A-Za-z0-9_.:-]`), so the BFF forwards
 * the client's value rather than inventing one. It is neither a credential
 * nor a destination, so forwarding it leaves the trust boundary where it
 * was. The BFF only refuses what could never be a header value it should
 * write: over 256 characters, or anything outside visible ASCII. A value
 * that is merely invalid for the gateway (15 characters, a `/`) still goes
 * through, so the gateway's own 400 is what gets tested.
 *
 * No `server-only` import, so it is unit-tested directly.
 */

export type ToolsScope = "read" | "execute";

export const IDEMPOTENCY_HEADER = "Idempotency-Key";
export const IDEMPOTENCY_MAX_FORWARDED = 256;

/** `execute` for `/v1/actions/{name}/execute`, `read` for every other route. */
export function toolsScopeFor(segments: readonly string[]): ToolsScope {
  return segments.length === 4 && segments[0] === "v1" && segments[1] === "actions" && segments[3] === "execute"
    ? "execute"
    : "read";
}

/** The Idempotency-Key to forward: absent, a value, or a refusal. */
export function forwardedIdempotencyKey(raw: string | null): { value?: string; error?: string } {
  if (raw === null) return {};
  if (raw.length > IDEMPOTENCY_MAX_FORWARDED) {
    return { error: `Refused: Idempotency-Key is over ${IDEMPOTENCY_MAX_FORWARDED} characters.` };
  }
  if (!/^[\x21-\x7e]*$/.test(raw)) {
    return { error: "Refused: Idempotency-Key holds a space, a control or a non-ASCII character." };
  }
  return { value: raw };
}
