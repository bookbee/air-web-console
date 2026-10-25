# AIR Web Console

*(package/directory identifier: `air-web-console`; also written
`AIR-Web-Console` where hyphens read better, e.g. slide titles or log
prefixes — all three names refer to the same project)*

A Next.js console for hand-testing, integrating with, and evaluating the
AIR platform services — **air-classifier-service**, **air-orchestrator-service**, **air-model-gateway** —
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
| **Model Gateway** | air-model-gateway | `/v1/generate` (text, structured, streamed) and `/v1/embed` |
| **System** | all three | Health, readiness, capabilities, and a log of every call |

## Quickstart

```bash
make install     # npm install
make env         # .env.local from .env.example, if absent
make dev         # http://127.0.0.1:3000
```

The demo gateway token and the `local` target both work as shipped — a
fresh checkout needs no edits to run against sibling AIR services on their
default ports (8081 air-orchestrator-service, 8082 air-classifier-service, 8083 air-model-gateway).

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
make gateway-check [GATEWAY_TARGET=qa]                 # every Model Gateway scenario, headless, against a live gateway
```

`make gateway-check` needs the console serving and a running gateway. It
writes `bugs/model-gateway/last-run-<target>.txt` and fails on any contract
scenario failure. It's kept out of `make check` and CI because it calls live
services, including a few small paid cloud calls. Bugs found in the AIR
services are written up under [`bugs/`](bugs/README.md), and the gateway's
release/handover gate is
[`bugs/model-gateway/READINESS.md`](bugs/model-gateway/READINESS.md).

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
air-classifier-service / air-orchestrator-service / air-model-gateway   (real X-API-Key attached here, server-side only)
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
bugs/                            bug reports for the AIR services, one file each (see bugs/README.md)
tests/                           test setup, and live suites (tests/live/*.live.test.ts) run by make gateway-check
src/
  app/
    api/
      classifier/[...path]/route.ts     proxy to air-classifier-service
      orchestrator/[...path]/route.ts   proxy to air-orchestrator-service (JSON + SSE)
      llm/[...path]/route.ts            proxy to air-model-gateway (JSON, collected SSE, or live NDJSON)
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
    http/          Exchange type, cURL rendering, the server-side proxy transport, the live-stream wire (live.ts)
    format.ts      dashboard value formatters + USD→INR display
  store/           Zustand: connection (target selection only), theme, call history
```

## Notes

- Every proxied call resolves to an `Exchange` — network failures, timeouts
  and missing base URLs all come back as data for the response pane to
  render, never a thrown error from the BFF. A 401 from the gateway itself
  (bad/missing bearer token) is the one exception, and renders through the
  same problem-detail UI a real upstream 401 would.
- **Streaming.** Streamed calls are real SSE end to end on the upstream
  side (the `Accept: text/event-stream` request, the `event:`/`data:`
  framing). Between the console's server and your browser there are two
  modes:
  - **Live** (Model Gateway tab, `stream: true` with **Render live** ticked,
    the default): the answer appears as the gateway generates it. The
    server passes each frame on the moment it arrives, as NDJSON, then
    sends the finished call, so history and cURL are the same as before.
    Closing the tab or navigating away mid-answer disconnects the gateway
    too, so it stops generating.
  - **Collected** (Render live unticked, the Orchestrator tab's turn
    stream, the contract scenarios and `make gateway-check`): the server
    waits for the stream to close and returns it in one piece. Each frame
    still carries when the server received it, so the summary shows time
    to first token and flags a stream that something along the way
    buffered.

  For live rendering to reach the browser through a proxy, the proxy must
  not buffer. The console sends `X-Accel-Buffering: no` and `Cache-Control:
  no-cache, no-transform`. Check any other proxy or CDN in front of it.
- The server-side timeout a client requests is clamped to `[1, 120]`
  seconds regardless of what's asked for — a request header influences
  behavior, but never past a server-owned bound.
- **Demoing the Model Gateway tab.** The status line at the top names the
  gateway's build, its environment and which providers are configured. The
  **Try:** presets fill the form for one feature each, and the request body
  preview shows exactly what will be sent. A run that tells the story:
  1. **Local & private**: answered on our own servers, cost 0.
  2. **Cloud**: a cloud model answers, with its cost. Send it again: a cache
     hit in milliseconds, at no cost.
  3. **Prefer Anthropic**: the preferred provider moves to the front of the
     chain; the **Route** grid shows which model answered.
  4. **Structured JSON**: the answer is JSON, and the summary checks it
     parses.
  5. **Streaming**: the answer renders as it's generated.
  6. **Embed → Similar meanings**: the similarity grid puts the two
     late-delivery complaints closest.
  7. **Failover:** stop the Ollama server (quit the Ollama app, or stop
     `ollama serve`), then send a new question with `model` left at its
     default (`auto`). Ask something new, or untick the cache; a question
     asked before comes back from the cache instead. The Route grid shows
     the local model didn't answer and a cloud one did, and the caller still
     got one answer. Start Ollama again afterwards.

  Then, under **Contract scenarios**, use **Run all** to show every contract
  check passing, and use **Show policy** to show per-service grants and
  budgets. Cloud presets make real paid calls (a fraction of a cent each).
  Outside `local`, presets this console isn't granted are greyed out, with
  the reason shown on hover.
- The Model Gateway tab's generate mode includes a **Conversation builder**: air-model-gateway is
  stateless per call (no `session_id`), so a genuine multi-turn exchange
  means resending the whole transcript every time — this mode builds that
  array by appending messages in the UI instead of hand-writing JSON.
- The Classifier tab's **Summary** mode (`/v1/summary/refresh`) is stateless
  the same way: the service stores nothing, so the response pane's "Use as
  existing_summary for next call" button carries the returned `summary`
  forward into the next request's box, one click at a time, instead of
  hand-copying JSON between them.
