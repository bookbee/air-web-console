# MG-009: An invalid provider key is silent: cloud traffic moves to a pricier provider, readiness stays green, and a pin blames the caller

| | |
|---|---|
| **Status** | open |
| **Severity** | High |
| **Service** | air-model-gateway @ `29fc4aa` plus its uncommitted working tree as of 2026-10-25 09:17 |
| **Found** | 2026-10-25, live calls on a second instance with a deliberately invalid Gemini key |
| **Console scenario** | none (needs a gateway started with a bad key; manual repro below) |

## Summary

If a provider key is wrong, revoked or expired, nothing in the gateway says
so:

- `cloud` and `auto` calls (even with `provider: gemini` preferred) fail
  over to Anthropic and answer 200, at several times the price.
- `/v1/ready` keeps reporting the provider as ready, because it only checks
  that a key is *set*.
- No metric moves. `adapter_errors_total` counts adapter crashes only, and
  there's no per-rung failure counter.
- A pin to that provider returns `422 provider_rejected`, which the docs
  define as "your request is invalid, don't retry". Here the fault is the
  gateway's own configuration.

In production, a revoked Gemini key would quietly multiply the cloud bill
until someone read the logs. The pin part is new: the uncommitted fix for
MG-005 counts every provider 400 as a rejected request, and Google answers
an invalid key with `400 INVALID_ARGUMENT` / `API_KEY_INVALID`, not
401/403.

## Reproduce

```bash
cd ../air-model-gateway
AIR_MODEL_GATEWAY_OLLAMA__BASE_URL=http://localhost:11434 \
AIR_MODEL_GATEWAY_PROVIDERS__GEMINI_API_KEY=AIzaInvalidKeyForTest000000000000000 \
  .venv/bin/uvicorn air_model_gateway.main:app --host 127.0.0.1 --port 8084 &
GW=http://127.0.0.1:8084 KEY=air-client-dev
curl -sS $GW/v1/generate -H "X-API-Key: $KEY" -H 'Content-Type: application/json' \
  -d '{"pin":"gemini:gemini-2.5-flash","messages":[{"role":"user","content":"hi"}],"max_tokens":5,"cache":false}'
curl -sS $GW/v1/generate -H "X-API-Key: $KEY" -H 'Content-Type: application/json' \
  -d '{"model":"cloud","provider":"gemini","messages":[{"role":"user","content":"hi"}],"max_tokens":5,"cache":false}'
curl -sS $GW/v1/ready
curl -sS $GW/metrics | grep -E 'adapter_errors|requests_total'
```

The repro needs a real Anthropic key in `.env` for the failover. Each call
costs a fraction of a cent.

## Expected

- A provider auth failure is the gateway's fault: `502` (or `503`), never a
  caller 422.
- A dead provider is visible. Either readiness reports it, or a metric that
  an alert can watch counts it per provider and reason.

## Actual

- **Pin:** `422 provider_rejected`, with detail
  `gemini: 400 INVALID_ARGUMENT ... 'reason': 'API_KEY_INVALID' ...`.
- **`cloud` with `provider: gemini`:** `200`, `provider: anthropic`,
  `model: claude-haiku-4-5`.
- **`/v1/ready`:** `{"status":"ready","providers":{... "gemini":true ...}}`.
- **`/metrics`:** only `requests_total`, with the 200s and the one 422.
  No adapter error or rung failure is counted.

## Cause

- `gateway/base.py`: `REJECTED_STATUSES = {400, 413, 422}`, so the status
  alone makes a failure "rejected". Google reports auth failures as 400 with
  `reason: API_KEY_INVALID` (or `PERMISSION_DENIED` as 403).
- `api/v1/system.py`: readiness and `providers` reflect whether a key is
  configured, not whether it works.
- `observability/metrics.py`: no counter for rung failures that failover
  hides. `chain_retries_total` counts only whole-chain retries.

## Suggested fix

1. In `_common.provider_error`, classify an auth failure as not rejected
   (status 401/403, or Google's `API_KEY_INVALID` / `PERMISSION_DENIED`
   reasons), so an all-auth-failed chain is a 502 with a clear detail.
2. Add `air_model_gateway_rung_failures_total{provider, model, reason}`,
   with reason one of auth, rejected, rate_limited, timeout, unavailable,
   not_found or adapter. Alert on any `auth`, and on failover rate. Document
   it in the LLD metrics table, which `test_repo_consistency.py` enforces.
3. Optionally, after N consecutive auth failures, mark the provider
   unhealthy in `/v1/ready`'s `providers` map. Keep the overall status
   ready while any chain can still answer.

## Verify

- With the invalid key, the pin repro returns `502` with a detail naming the
  key problem.
- The `cloud` repro still answers (failover is correct) and
  `rung_failures_total{provider="gemini",reason="auth"}` increases.
- Add a gateway test with a faked Google 400 `API_KEY_INVALID`.

## Resolution

_Not yet._
