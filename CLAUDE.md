# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Naming

Three forms of the same name are in use, deliberately: **AIR Web Console**
(display caption — page title, in-app header, README top line; also written
`AIR-Web-Console` where a hyphenated form reads better, e.g. slide titles or
log-line prefixes) and **`air-web-console`** (the code-identifier form —
`package.json` name, Docker image name, Zustand storage-key prefixes, this
file's own references). Use the display caption in prose and UI text; use
the hyphenated lowercase form in anything identifier-shaped. Don't invent a
fourth variant.

## Project

air-web-console is a Next.js (App Router) console for hand-testing,
integrating with, and evaluating the AIR platform services —
**air-classifier**, **air-platform**, **air-llm** — individually and as an
integrated whole, against any environment (local/QA/staging).

It is meant as a **reference BFF pattern** web developers can extend: an
independent web client authenticating to an API gateway that alone holds
upstream configuration and credentials — the shape a real production
integration should follow. That framing (see "The BFF is the trust
boundary" below) is the most important thing to preserve when touching this
code. **The repo directory is still named `air-web` on disk** (a rename to
`air-web-console` at the filesystem/repo level is a separate, deliberate
step taken outside this codebase) — in-repo identity (`package.json`,
storage-key prefixes, this file) already says `air-web-console`.

## Commands

```bash
make dev             # or: npm run dev        — dev server, http://127.0.0.1:3000
make up / make down  # Docker: build+run / stop (local dev only, see Dockerfile)
make check           # or: npm run lint && npm run typecheck && npm run test
npx vitest           # vitest watch mode
npx vitest run path/to/file.test.ts   # a single test file
```

`make help` lists every target. There is no `.env` in this repo — `make env`
(or `cp .env.example .env.local`) creates one before first run. Both the
demo gateway token and the `local` target work with zero edits (pre-wired to
the sibling services' own development keys/ports) whether run natively
(`make dev`) or in Docker (`make up`).

## Architecture

**Why a BFF at all:** none of the three AIR backend services have CORS
configured, so a browser cannot call them directly. This console resolves
that by putting a Node backend-for-frontend in front of every call. The
browser only ever talks to this app's own origin.

**The BFF is the trust boundary — this is the load-bearing design decision
in the whole repo.** An earlier iteration let the browser hold every
target's base URL and API key and send them to the BFF per request via
`X-Target-Base-Url`/`X-Target-Api-Key` headers. A security review found
that design let any caller of the BFF turn it into an open SSRF proxy
(client-supplied URL, no allow-list) and leaked every upstream API key
through an unauthenticated `GET /api/config`. The fix, now in place:

- **The browser never holds, sends, or receives an upstream API key or an
  arbitrary base URL.** `src/lib/config.ts`'s `resolveService(defaults,
  targetName, service, channel?)` is the *only* place a base
  URL/key/TLS-setting is resolved, entirely server-side, from `.env`
  (parsed by `loadDefaults()`). `toPublicDefaults()` is what
  `GET /api/config` actually returns to the browser — base URLs stay (not
  secret, needed so the UI can state its destination plainly), every key
  becomes a `*_keyed: boolean`.
- **The client names a target and, for air-platform, a channel — nothing
  else.** `X-Target-Name` (+ `X-Target-Channel: customer|business`) are the
  only connection-shaped headers `src/app/api/_lib/serviceProxy.ts` reads.
  An unrecognized target name falls back to the server's configured
  default rather than erroring — never to a client-supplied host.
  Client-requested timeout is honored but clamped server-side to
  `[1, 120]` seconds; TLS verification is a per-target *server* setting
  (`Target.verifyTls`), never a per-request client choice.
- **The browser does authenticate to this app's own gateway.**
  `src/lib/auth/gatewayAuth.ts`'s `assertGatewayAuthorized(request)` is
  called first by every route under `src/app/api/**` (including
  `/api/config`) and checks an `Authorization: Bearer <token>` header
  against server-side `AIR_WEB__GATEWAY_TOKEN`. The client sends
  `NEXT_PUBLIC_AIR_WEB_GATEWAY_TOKEN` — the same value, baked into the
  bundle at build time. **This is not the same kind of secret as an
  upstream air-* API key** — it's a publishable client identifier (the
  Stripe-publishable-key pattern), whose job is demonstrating the
  client→gateway auth step and gating anonymous traffic, not protecting a
  credential. Don't conflate the two when extending this: upstream keys
  must never reach `NEXT_PUBLIC_*`; the gateway token is supposed to.
  Missing/misconfigured server-side token fails closed (401), never
  implicit-allow.
- Comparison is constant-time (`src/lib/auth/token.ts`'s `tokensMatch`,
  via `node:crypto`'s `timingSafeEqual`) to avoid a timing side-channel on
  the gateway token.

**One Next.js app is both the frontend and the BFF.** `src/app/api/**` are
Route Handlers acting as the proxy; everything else under `src/app`/
`src/components` is the console UI. Three catch-all routes —
`api/classifier/[...path]`, `api/platform/[...path]`, `api/llm/[...path]` —
each pass their own `ServiceKind` literal into the one shared handler,
`src/app/api/_lib/serviceProxy.ts`, built on `src/lib/http/proxy.ts`'s
`forwardRequest`/`forwardStreamRequest`. Those two functions are the only
place `undici`'s `fetch`/`Agent` are used directly (needed for the
per-target TLS-verify setting and the SSE stream), and they are forced onto
the Node.js runtime (`export const runtime = "nodejs"`), not Edge.

**Every proxied call always resolves to an `Exchange`, never a thrown
error** — with one deliberate exception. `src/lib/http/exchange.ts` defines
the shared type (also used to mask secrets and render cURL, isomorphically,
in the response pane); a network failure, timeout, or missing base URL
becomes `exchange.error` instead of an HTTP-level error from the BFF route
itself. The exception is gateway auth: a 401 from `assertGatewayAuthorized`
*is* a real HTTP-level error (it's about this server's own front door, not
the upstream call), which `src/lib/http/client.ts`'s `sendViaProxy` catches
and reshapes into an `Exchange` anyway so it still renders through the
existing problem-detail UI. `ResponseView`
(`src/components/shared/ResponseView.tsx`) is the one component every tab's
response pane is built from; `DashboardGrid`
(`src/components/shared/DashboardGrid.tsx`) is the one component every
response *summary* is built from — extend a summary by adding rows to a
`DashboardGrid`, not by inventing a new layout.

**air-platform's SSE stream is collected, not piped live.** When a caller
asks for the stream transport, `forwardStreamRequest` performs the real SSE
request (`Accept: text/event-stream`, `event:`/`data:` frame parsing) but
waits for the stream to close and returns one `Exchange` with all frames in
`events` — the response pane has no incremental-render plumbing that a live
stream would actually benefit from, so collecting once and rendering once
is simpler than building that plumbing for no payoff. Client-side,
`src/components/platform/events.ts`'s `foldEvents` reassembles those events
into the same shape a non-streamed `TurnResult` already has, so
`TurnSummary` renders either identically.

**Options editors implement tick-to-omit semantics deliberately.** The AIR
services' request schemas set `additionalProperties: false` and, for
several optional fields, treat "field absent" and "field explicitly set to
its default" as different requests (an API key scoped to force
`redact_pii: true` rejects an *explicit* `redact_pii: false` but accepts the
same value arriving unspoken). So every `OptionsEditor` (classifier/
platform/llm, one per tab) tracks an enabled-flag *and* a value per
optional field; an unticked field is left out of the request body entirely
rather than sent at its default. Do not "simplify" this into a plain form
with default values — it changes what the real API sees.

**Docker is a local-dev-only convenience, not a deployment artifact.**
`Dockerfile`/`docker-compose.yml` exist so a developer with no Node
toolchain can still `make up`. Inside the container `localhost` means the
container, so `docker-compose.yml`'s `environment:` block re-points the
`local` target's three base URLs at `host.docker.internal` (with
`extra_hosts: host.docker.internal:host-gateway` for Linux) — verified
end-to-end against a host-run air-classifier. `next.config.ts`'s `output:
"standalone"` is what makes the runtime image copy only a traced
`node_modules` subset instead of the full tree. The one Docker-specific
subtlety: `NEXT_PUBLIC_AIR_WEB_GATEWAY_TOKEN` must be a **build arg**, not
just a runtime env var — Next.js inlines `NEXT_PUBLIC_*` into the client
bundle during `next build`, which happens inside the `builder` stage before
any `docker-compose.yml` `environment:`/`env_file:` value would exist.
`src/app/api/health/route.ts` is deliberately ungated (no bearer-token
check) — it's what the container's own `HEALTHCHECK` polls, and an infra
liveness probe shouldn't need real credentials.

**Notable product details, easy to accidentally regress:** call history and
theme preference persist across a reload (`localStorage`, via Zustand's
`persist` middleware); the selected target and timeout persist
per-tab-session via `sessionStorage`; the LLM tab has a real multi-turn
conversation builder (`src/components/llm/ChatFields.tsx`) alongside the
raw-JSON "Advanced" mode, since air-llm is stateless per call and a
hand-written transcript is easy to get wrong; Vitest + a GitHub Actions CI
workflow (`.github/workflows/ci.yml`) run lint/typecheck/test/build/Docker
build on every push and PR.

## Working in this repo

- Pure/testable logic lives deliberately separated from anything that
  imports `"server-only"` — `src/lib/location.ts`, `src/lib/format.ts`,
  `src/lib/http/exchange.ts`, `src/lib/validators.ts`, and
  `src/lib/auth/token.ts` have no server-only dependency and are
  unit-tested under `__tests__/` alongside them. `src/lib/config.ts` and
  `src/lib/auth/gatewayAuth.ts` both import `"server-only"` and will throw
  if pulled into a Vitest run directly — `gatewayAuth.ts` is a thin wrapper
  around `token.ts` for exactly this reason; `config.ts` is exercised via
  `/api/config` instead.
- `src/lib/types.ts` holds `Target`/`Defaults`/`PublicTarget`/
  `PublicDefaults` with no dependencies, so client-side code can import the
  public shapes without pulling in `src/lib/config.ts`'s `server-only`
  guard. Never widen `PublicTarget`/`PublicDefaults` to include a raw key —
  that's the exact leak the security review fixed.
- MUI theme tokens (light/dark palettes, the dashboard's `Kind` colors, chip
  colors) are declared once in `src/theme/muiTheme.ts` as a custom `theme.air`
  extension — read them from there rather than hardcoding a hex value in a
  component.
- `src/lib/config.ts`'s `LOCAL_TARGET_DEV_DEFAULTS.llmApiKey` (value:
  `"air-client-dev"`) looks like a stray reference to a different project —
  it isn't one to remove. That exact string is the caller identity air-llm's
  own local `.env.example` provisions a service token for; changing it here
  would break authentication against a real local air-llm checkout. See the
  docstring on `LOCAL_TARGET_DEV_DEFAULTS` itself for why this whole object
  — despite holding real credentials — never reaches the browser.
- `npm run typecheck` runs `next typegen` first, deliberately — `tsc` alone
  depends on ambient types (`LayoutProps` and friends) that only exist in
  `.next/types/**`, generated by Next.js itself and referenced through the
  gitignored `next-env.d.ts`. `next dev`/`next build` also produce these as
  a side effect, which is why running `tsc --noEmit` right after either of
  those looks like it works standalone — it doesn't, on a genuinely fresh
  checkout or in CI before anything else has run. Don't strip the
  `next typegen &&` back out of this script.
- The Classifier tab has three modes (Single/Batch/Summary), not one route
  per tab — matching the LLM tab's chat/embeddings precedent: a new route on
  an *existing* service's tab becomes another mode there, not a new
  top-level tab. `src/components/classifier/ClassifyItemsList.tsx` renders
  the `ClassifyBatchItem[]` shape shared by `/v1/classify/batch` and
  `/v1/summary/refresh`'s responses — extend it once for both call sites
  rather than forking it if a third route ever returns the same shape.
