# CL-003: A "no verdict" caused by the caller's own options comes back as a retryable 503

| | |
|---|---|
| **Status** | verified |
| **Severity** | Medium |
| **Service** | air-classifier-service @ `d151e5c` |
| **Found** | 2026-11-14, live call (SIT) |
| **Console scenario** | none |

## Summary

`max_tier: t0_rules` (or `max_cost_usd: 0`, CL-002) on any text without a
rules shortcut returns `503 no-verdict` with `retryable: true`. The outcome
is fixed by the request itself: the same request fails the same way
every time. A client honouring `retryable` (air-orchestrator-service's
Phase 3 retry layer is planned to) will spin on it, and a load balancer
counting 5xx will page someone over caller input.

## Reproduce

```bash
curl -sS -X POST $CLF/v1/classify -H "X-API-Key: $KEY" -H 'Content-Type: application/json' \
  -d '{"text":"fine, nothing special","options":{"max_tier":"t0_rules"}}' | jq '{status, retryable}'
```

In a burst of 800 such calls during SIT, 647 returned this 503 (the rest
were rate-limited), all `retryable: true`.

## Expected

`api/errors.py` (the class comment near line 210) argues `NoVerdictAvailableError` is
retryable because "every enabled tier failed or abstained, almost always
because a dependency was down". That reasoning doesn't hold when the ladder
was *capped* by the caller before any tier failed.

## Actual

`503`, `retryable: true`, no `Retry-After`.

## Cause

`api/errors.py:215` sets `retryable = True` unconditionally. The ladder doesn't
distinguish "stopped by ceiling/option with no usable verdict" from "every
tier failed".

## Suggested fix

When the ladder stops because of `max_tier`, `max_cost_usd` or the latency
budget, and no tier *failed*, answer `422` (for example `no-verdict-within-limits`,
`retryable: false`) naming the limit, or `503` with `retryable: false`. Keep
the retryable 503 for real outages.

## Verify

The repro returns a non-retryable answer that names the limiting option.
An outage case (T3 forced, gateway unreachable) still returns a retryable 503.

## Resolution

**Origin:** fixed, air-classifier-service uncommitted on top of `d151e5c` (branch `feature/model-gateway-rename`; container rebuilt ~10:30 local). A limit-caused empty ladder → 422 `no-verdict-within-limits`, `retryable: false`, naming the option. 503 `no-verdict` kept for real failures, `retryable: true`, now also in batch items (was false). Golden `t0-no-match` and `demo-tiers.sh` T0-e now expect 422.

**Verifier (2026-11-14 ~05:10 UTC):** `max_tier: t0_rules` → 422 `no-verdict-within-limits`, `retryable: false`. **Passed.**
