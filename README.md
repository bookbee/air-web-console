# AIR Web Console

*(package/directory identifier: `air-web-console`; also written
`AIR-Web-Console` where hyphens read better, e.g. slide titles or log
prefixes — all three names refer to the same project)*

A Next.js console for hand-testing, integrating with, and evaluating the
AIR platform services — **air-classifier-service**, **air-orchestrator-service**, **air-llm** —
individually and as an integrated whole. Send a request, read the decoded
response, copy the cURL that reproduces it exactly.

It also doubles as a **reference BFF pattern**: the way this console talks
to the AIR services — an independent web client authenticating to an API
gateway, which alone holds upstream configuration and credentials — is the
same shape a real production integration should follow, not a shortcut
specific to this tool. Built on Next.js/React/Node so web developers can
pick it up and extend it directly.

Four tabs, one per surface:

| Tab | Service | What it does |
| --- | --- | --- |
| **Classifier** | air-classifier-service | `/v1/classify` (single, batch, tier probes) and `/v1/summary/refresh` (stateless customer-summary rollup) |
| **Orchestrator** | air-orchestrator-service | Both channels: `/v1/chat` and `/v1/query`, including SSE turns |
| **LLM** | air-llm | `/v1/inference` — chat and embeddings, one endpoint |
| **System** | all three | Health, readiness, capabilities, and a log of every call |

## Quickstart

```bash
make install     # npm install
make env         # .env.local from .env.example, if absent
make dev         # http://127.0.0.1:3000
```

The demo gateway token and the `local` target both work as shipped — a
fresh checkout needs no edits to run against sibling AIR services on their
default ports (8081 air-orchestrator-service, 8082 air-classifier-service, 8083 air-llm).

### Two ways to run it

Both run the same app against the same `.env.local`; the only real
difference is what "local" resolves to inside each.

| | Needs | Use it when |
| --- | --- | --- |
| `make dev` | Node ≥20.9 | **Editing** the console. Hot reload on save |
| `make up` | Docker | **Using** the console — nothing to install, works the same everywhere |

`make` needs no install on macOS or most Linux distributions; on Windows,
use `docker compose --env-file .env.local up -d --build` directly, or
`npm run dev` / `npm run build && npm run start` natively.

```bash
make lint / make typecheck / make test / make check   # check = everything CI runs
make build && make start                               # native production build
make logs                                              # tail the Docker container
make down                                              # stop the Docker container
```

`make help` lists every target, including `image` (build the Docker image
without starting it) and `clean` (remove `node_modules`/`.next`).

### In a container

```bash
make up          # build and run; http://127.0.0.1:3000
make logs
make down
```

This console is **local development and testing only**, deliberately not
hardened or optimised for a production deployment. It does not join
air-infra's `air-net` and does not require air-infra to be running — it
reaches whatever AIR services are already up (natively or in their own
containers) through the ports they publish on the host.

Inside a container, `localhost` is the *container*, so `docker-compose.yml`
re-points the `local` target's three base URLs at `host.docker.internal` —
verified end-to-end against a host-run air-classifier-service on `:8082`. On Linux,
`extra_hosts: host.docker.internal:host-gateway` is what makes that
resolve; start the host-side service with `HOST=0.0.0.0` there if it's
bound to loopback only.

The port publishes to loopback only — this console is a tool on your
machine, not a service for the network. `.env.local` is never baked into
the image (see `.dockerignore`); compose passes it at container runtime.
The one exception is `NEXT_PUBLIC_AIR_WEB_GATEWAY_TOKEN`, which — being a
*publishable* client identifier rather than an upstream secret — is passed
as a Docker build arg instead, since Next.js has to inline it into the
client bundle at `next build` time.

## Architecture: the BFF is the trust boundary

None of the three AIR backend services have CORS configured, so a browser
cannot call them directly — this console's Node backend-for-frontend
exists to close that gap. The browser only ever talks to this app's own
origin:

```
Browser (NEXT_PUBLIC gateway token baked in — no upstream secrets, ever)
   │  Authorization: Bearer <gateway token>
   │  X-Target-Name: local | qa | …      X-Target-Channel: customer|business (orchestrator only)
   ▼
Next.js Route Handlers (BFF) — src/app/api/**
   │  1. checks the gateway token (this app's own front door)
   │  2. resolves {baseUrl, apiKey, verifyTls} from server-side .env,
   │     keyed by (service, target name[, channel]) — never from a client header
   ▼
air-classifier-service / air-orchestrator-service / air-llm   (real X-API-Key attached here, server-side only)
```

- **The browser never holds, sends, or receives an upstream API key.**
  `GET /api/config` returns each target's base URLs (not secret — needed so
  the UI can state its destination plainly, wherever it renders) but
  reduces every key to a `*_keyed: boolean`. The sidebar is a read-only
  target *picker*; there are no Base URL / X-API-Key text fields to edit.
  Adding an environment is a `.env` change on the server, not a runtime
  edit — the server only ever calls hosts it declared itself.
- **The browser does authenticate to this app's own gateway.** Every
  `/api/**` call carries a bearer token
  (`NEXT_PUBLIC_AIR_WEB_GATEWAY_TOKEN`, baked into the bundle at build
  time), checked server-side against `AIR_WEB__GATEWAY_TOKEN`. This token
  is a **publishable client identifier**, not a secret in the same sense as
  an upstream API key — the same role a Stripe publishable key plays. Its
  job is demonstrating the "client authenticates to the gateway" step and
  gating casual/anonymous traffic, not protecting an upstream credential.
  `.env.example` ships a demo value so a fresh checkout works untouched —
  change it (both variables, to the same new value) before pointing this
  console at anything beyond your own machine.
- **No database, no server-side session store.** Call history, the
  selected target, and appearance persist client-side (`sessionStorage` /
  `localStorage`) rather than vanishing on reload, but none of it is a
  security boundary — the boundary is entirely in `src/app/api/**` and
  `src/lib/config.ts`.

**Every request body sends exactly the fields you filled in.** The AIR
services' request schemas set `additionalProperties: false` and, for
several optional fields, treat "field absent" and "field explicitly set to
its default" as two different requests — an API key scoped to force
`redact_pii: true` rejects an *explicit* `redact_pii: false` but silently
accepts the same value arriving unspoken. So every optional field in every
tab's form has its own enable checkbox, and an unticked one is omitted from
the JSON body entirely rather than sent at a default. The "Request body
preview" on each tab shows exactly what will be sent, with nothing invented
on the way.

## Layout

```text
Dockerfile, docker-compose.yml   local-dev-only container; see "In a container"
src/
  app/
    api/
      classifier/[...path]/route.ts     proxy to air-classifier-service
      orchestrator/[...path]/route.ts   proxy to air-orchestrator-service (JSON + SSE)
      llm/[...path]/route.ts            proxy to air-llm
      config/route.ts                 redacted target catalogue, shipped to the client
      health/route.ts                 ungated liveness probe (Docker HEALTHCHECK)
      _lib/serviceProxy.ts            the shared, gateway-token-gated handler behind all three
    layout.tsx, page.tsx, providers.tsx
  components/
    layout/       Header, TargetBar
    sidebar/       Sidebar (read-only target picker + status)
    shared/        DashboardGrid, ResponseView, JsonViewer, SendRow, …
    classifier/    orchestrator/     llm/          system/
  lib/
    config.ts      server-only .env parsing + resolveService()/toPublicDefaults()
    auth/          gatewayAuth.ts (server-only) + token.ts (pure, unit-tested)
    connection.ts  the resolved destination shape every tab reads (no key)
    http/          Exchange type, cURL rendering, the server-side proxy transport
    format.ts      dashboard value formatters + USD→INR display
  store/           Zustand: connection (target selection only), theme, call history
```

## Notes

- Every proxied call resolves to an `Exchange` — network failures, timeouts
  and missing base URLs all come back as data for the response pane to
  render, never a thrown error from the BFF. A 401 from the gateway itself
  (bad/missing bearer token) is the one exception, and renders through the
  same problem-detail UI a real upstream 401 would.
- air-orchestrator-service's SSE turn stream is exercised for real (the `Accept:
  text/event-stream` request, the `event:`/`data:` framing) but collected
  server-side into one `Exchange` before reaching the browser, since the
  response pane has no incremental-render plumbing that a live stream would
  actually benefit from.
- The server-side timeout a client requests is clamped to `[1, 120]`
  seconds regardless of what's asked for — a request header influences
  behavior, but never past a server-owned bound.
- The LLM tab's chat mode includes a **Conversation builder**: air-llm is
  stateless per call (no `session_id`), so a genuine multi-turn exchange
  means resending the whole transcript every time — this mode builds that
  array by appending messages in the UI instead of hand-writing JSON.
- The Classifier tab's **Summary** mode (`/v1/summary/refresh`) is stateless
  the same way: the service stores nothing, so the response pane's "Use as
  existing_summary for next call" button carries the returned `summary`
  forward into the next request's box, one click at a time, instead of
  hand-copying JSON between them.
