# CL-004: T2 reports ready/available while the gateway says its only provider is down

| | |
|---|---|
| **Status** | open — design-level (agreed by origin) |
| **Severity** | Medium |
| **Service** | air-classifier-service @ `d151e5c`, with air-model-gateway @ `1fa80de` |
| **Found** | 2026-11-14, live call (SIT) |
| **Console scenario** | Classifier tab → Capabilities probe shows the mismatch |

## Summary

With Ollama down, the gateway's own `/v1/ready` says `"ollama": false`, but
the classifier's `/v1/ready` and `/v1/capabilities` report `t2_local_llm`
as ready and available. So an operator can't see the outage, and
every escalating request pays a T2 attempt that can't succeed (about 300–700 ms
before the gateway's breaker answers, then T3). A `min_tier=max_tier=t2`
request fails with 503 although capabilities said it would work.

## Reproduce

```bash
curl -sS http://127.0.0.1:8083/v1/ready                       # "ollama": false
curl -sS $CLF/v1/ready | jq '.components[] | select(.name=="t2_local_llm")'   # ready: true
curl -sS -H "X-API-Key: $KEY" $CLF/v1/capabilities | jq '.tiers[] | select(.tier=="t2_local_llm")'  # available: true
curl -sS -X POST $CLF/v1/classify -H "X-API-Key: $KEY" -H 'Content-Type: application/json' \
  -d '{"text":"meh 9f2","options":{"min_tier":"t2_local_llm","max_tier":"t2_local_llm"}}' | jq .status   # 503
```

## Expected

`/v1/capabilities` exists so that a degraded deployment is visible from
outside (`api/v1/system.py` docstring). T2 should read `available: false`
with a detail such as `air-model-gateway: class "local" has no reachable provider`.

## Actual

T2 `ready: true` / `available: true`, `detail: {}`.

## Cause

`providers/model_gateway_provider.py:190` `health()` asks only whether the
gateway's `/v1/ready` returns 200. The gateway answers 200 whenever *any*
provider is up, and lists per-provider state in the body
(`{"providers":{"ollama":false,"anthropic":true,...}}`), which the
classifier ignores. T2 and T3 share this probe, so they always agree even
though they map to different gateway classes (`local` vs `auto`/`cloud`).
The docstring says this was deliberate ("Deliberately not a per-vendor probe").

## Suggested fix

Design-level, so the origin owns it. Options:

1. The gateway exposes per-class readiness (for example `/v1/ready` →
   `"classes": {"local": false, "auto": true, "cloud": true}`, derived from
   each class's chain and the provider map it already computes), and each
   tier probes its own class. This keeps the classifier vendor-agnostic,
   which is the point of the docstring. **Needs an air-model-gateway change
   first.**
2. In the meantime, the classifier marks a tier unavailable for N seconds after
   `provider_unavailable` answers from the gateway (a client-side breaker),
   so the cost is paid once per window, not on every request.

## Verify

With Ollama stopped, T2 reads `available: false` with a reason, the T2-only
repro returns a non-retryable "tier unavailable" answer, and escalating
requests skip T2 without paying the latency.

## Resolution

**Origin:** agrees it's design-level, needing per-class readiness from air-model-gateway. Correction to option 2: it already exists. `T2.is_available()` is false while T2's breaker is open (5 consecutive failures, 30 s cooldown, `RESILIENCE__BREAKER_*`), so the dead T2 is paid about 5× per window, not per request. The remaining gap: `/v1/ready`/`/v1/capabilities` read ready while the breaker is closed.

**Verifier (2026-11-14 ~05:10 UTC):** confirmed: `/v1/ready` now shows `t2_local_llm ready:false, detail: "circuit breaker open for ollama — retries after cooldown"` once the breaker trips. Still open for the gateway-side contract.
