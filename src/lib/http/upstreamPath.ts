/**
 * The upstream path the BFF appends to a target's server-configured base URL.
 *
 * Next.js hands a catch-all route its segments already percent-decoded, so
 * `/api/classifier/..%2F..%2Fadmin` arrives as the single segment
 * `../../admin`. Joined as-is, that reaches `fetch` as `<base>/../../admin`,
 * which URL normalization resolves *above* the base URL's own path. Harmless
 * when a base URL is a bare origin, but a target configured with a path
 * prefix (`https://api.internal/classifier`) would let any caller of the BFF
 * escape that prefix into sibling services on the same host — a narrower
 * form of the SSRF the trust-boundary design exists to close.
 *
 * So a segment that is a dot-segment, or that smuggles a separator, is
 * refused rather than repaired: there is no legitimate AIR route that needs
 * one, and silently rewriting it would send a request the caller didn't ask
 * for. No `server-only` import, so it is unit-tested directly.
 */
export function upstreamPath(segments: readonly string[]): string | null {
  for (const segment of segments) {
    if (segment === "" || segment === "." || segment === "..") return null;
    if (/[/\\]/.test(segment)) return null;
    // Anything still percent-encoded after Next's decode (`%2e%2e`, `%252F`)
    // is a second encoding layer some upstream may decode again.
    if (/%[0-9a-f]{2}/i.test(segment)) return null;
    // Control characters (CR/LF and friends) have no place in a URL path.
    if (/[\u0000-\u001f\u007f]/.test(segment)) return null;
  }
  return `/${segments.map((segment) => encodeURIComponent(segment)).join("/")}`;
}
