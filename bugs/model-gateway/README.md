# air-model-gateway: bug reports

Found while recalibrating the AIR Web Console's Model Gateway tab against the
new `/v1/generate` and `/v1/embed` API, before the gateway went to QA. Process,
statuses and severities are in [../README.md](../README.md).

| | |
|---|---|
| **Gateway build tested** | `air-model-gateway` @ `29fc4aa` ("Design update for Air Model Gateway."), version 0.1.0 |
| **Found** | 2026-10-25 |
| **Environment** | `local` policy; gateway on `127.0.0.1:8083`; Ollama on `:11434`, llama.cpp on `:8181`; Anthropic and Gemini keys set, OpenAI not set |
| **Gateway's own suite** | 297 tests pass at that commit, so none of these bugs is caught by its tests |
| **Re-checked** | 2026-10-25 10:24 against the gateway's uncommitted fixes (52 files on top of `29fc4aa`): its `make verify` passes (324 tests), and this console's `make gateway-check` passes 34/34 contract scenarios and all 8 known-gap scenarios. See [last-run-local.txt](last-run-local.txt) and [READINESS.md](READINESS.md) |

## Index

| ID | Severity | Status | Title | Console scenario |
|---|---|---|---|---|
| [MG-001](MG-001-gemini-nullable-schema.md) | High | fixed, uncommitted | Gemini structured output crashes on a nullable field; `cloud` silently fails over at ~7× cost | `gap-gemini-nullable-schema` |
| [MG-002](MG-002-unpriced-pin-bypasses-budget.md) | High | fixed, uncommitted | A pin to a paid model missing from `pricing.yaml` costs $0 and bypasses the daily budget | `gap-unpriced-pin` |
| [MG-003](MG-003-404-405-not-problem-json.md) | Medium | fixed, uncommitted | 404 and 405 bodies aren't problem+json (no `code`, no `request_id`) | `gap-404-problem`, `gap-405-problem` |
| [MG-004](MG-004-capabilities-lists-unusable-embed.md) | Medium | fixed, uncommitted | `/v1/capabilities` marks `cloud-1536-v1` allowed when its only provider isn't configured | `gap-capabilities-usable` |
| [MG-005](MG-005-client-errors-as-retryable-502.md) | Medium | fixed, uncommitted | Non-retryable provider 4xx errors come back as retryable `502 provider_unavailable`; inputs are uncapped | `gap-pin-unknown-model`, `gap-embed-too-many`, `gap-too-many-messages` |
| [MG-006](MG-006-ollama-error-body-dropped.md) | Low | fixed, uncommitted | The Ollama adapter drops Ollama's error message | `gap-pin-unknown-model` (detail check) |
| [MG-007](MG-007-malformed-json-before-auth.md) | Low | fixed, uncommitted | An unauthenticated request with malformed JSON gets 422, not 401 | none (the BFF always sends a key; manual repro) |
| [MG-008](MG-008-minor-items.md) | Low | fixed, uncommitted | Minor items (streamed refusal, OpenAI params, cache-write pricing, budget race, stale `.env`) | none (code reading) |
| [MG-009](MG-009-invalid-provider-key-silent.md) | High | open | An invalid provider key is silent: cloud traffic moves to a pricier provider, readiness stays green, a pin blames the caller | none (needs a bad key; manual repro) |
| [MG-010](MG-010-no-build-identity.md) | Medium | open | The gateway doesn't report which build it is, so a test run can't prove what it tested | none |

## Test setup

Run the gateway from its own checkout. The explicit Ollama URL covers a
local `.env` copied before `.env.example` switched to `localhost` (see
MG-008e).

```bash
cd ../air-model-gateway
AIR_MODEL_GATEWAY_OLLAMA__BASE_URL=http://localhost:11434 \
  .venv/bin/uvicorn air_model_gateway.main:app --host 127.0.0.1 --port 8083
```

Every repro below uses the gateway's **local development** key, the one the
gateway's `.env.example` maps to the `air-web-console` identity:

```bash
export GW=http://127.0.0.1:8083 KEY=air-client-dev
```

Repros that name `gemini` or `anthropic` need that provider's key in the
gateway's `.env`. They're real paid calls, costing well under a cent each.

### From the console

With the console serving (`make dev`), either:

- **Headless, any harness:** `make gateway-check` (`GATEWAY_TARGET=qa` for
  another target). It runs every scenario through the BFF and writes
  `last-run-<target>.txt` here. It fails if any contract scenario fails.
- **In the UI:** http://127.0.0.1:3000 → **Model Gateway** →
  **Contract scenarios** → **Run all**. The tally counts contract rows
  apart from known gaps. An open gap shows amber with its MG number; one
  that passes shows blue ("fix landed?").

Before trusting a run, check which gateway process answered it. Only one
should be listening (`lsof -nP -iTCP:8083 -sTCP:LISTEN`), and it should have
started after the last code change, or use `--reload`. Until MG-010 is
fixed, the gateway can't tell you this itself.

## What was checked and works

So the origin knows what not to re-investigate:

- request validation and unknown fields (422)
- the old aliases and `task` (422)
- `model: local` with `provider: anthropic` (422)
- pin rules
- failover
- cache hit and `cache: false`
- truncated answers never cached
- one vector per embed input
- `X-Request-ID` echo
- stream headers and event order
- errors before the stream starts come back as plain HTTP errors
- stream cache-hit replay
- generation stops on client disconnect, with an audit
- `/v1/ready` accuracy
