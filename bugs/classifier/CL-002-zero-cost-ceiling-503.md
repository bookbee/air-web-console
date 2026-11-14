# CL-002: `max_cost_usd: 0` answers 503 "No verdict available" instead of the free T1 verdict

| | |
|---|---|
| **Status** | verified |
| **Severity** | Medium |
| **Service** | air-classifier-service @ `d151e5c` |
| **Found** | 2026-11-14, live call (SIT) |
| **Console scenario** | none |

## Summary

`max_cost_usd: 0` is the natural way to say "free tiers only". Instead, every
text that T0 rules can't shortcut fails with 503, although T1 is free and
would answer. Callers can work around it with `max_tier: t1_classifier`, but
nothing tells them to.

## Reproduce

```bash
curl -sS -X POST $CLF/v1/classify -H "X-API-Key: $KEY" -H 'Content-Type: application/json' \
  -d '{"text":"fine, nothing special","options":{"max_cost_usd":0}}' | jq '{status, type, retryable, detail}'
```

## Expected

The comment at `pipeline/policy.py:73` says "`max_cost_usd == 0` pins the
ladder to its first rung by definition". The caller's intent is "spend
nothing", and T0 and T1 cost nothing. A tight *latency* budget already
behaves correctly: `latency_budget_ms: 50` returns the T1 verdict with
`degraded: true`. Expected: 200, `decided_by: t1_classifier`,
`est_cost_usd: 0`.

## Actual

```json
{"status":503,"type":"https://air.dev/errors/no-verdict","retryable":true,"detail":"No tier produced a usable verdict."}
```

## Cause

`pipeline/policy.py:75`: `ctx.cost_spent_usd >= options.max_cost_usd` is
`0 >= 0`, which is true after T0, so the ladder stops at the rules rung. T0 had no
shortcut (`no_shortcut_matched`), so there's no usable verdict, and
`NoVerdictAvailableError` follows.

## Suggested fix

The cost rule should block a *paid* next rung, not every next rung. With
CL-001's per-rung estimate this falls out for free (`spent + estimate(T1)
= 0 ≤ 0`). Short of that, treat T0/T1 as zero-cost in rule 3. Changing `>=`
to `>` alone is wrong: it would let T3 run under a `0` ceiling.

## Verify

The repro returns 200 from `t1_classifier` with `est_cost_usd: 0`. Add a
policy truth-table test: `max_cost_usd=0`, T0 unusable → escalate to T1;
T1 low-confidence → stop with `cost_ceiling`, `degraded: true`.

## Resolution

**Origin:** fixed by CL-001's change, air-classifier-service uncommitted on top of `d151e5c` (branch `feature/model-gateway-rename`; container rebuilt ~10:30 local). Tests: `test_policy.py::test_rule3_a_zero_ceiling_still_reaches_a_free_rung`, `test_orchestrator.py::test_a_zero_ceiling_still_runs_the_free_rungs`.

**Verifier (2026-11-14 ~05:10 UTC):** repro → 200 `t1_classifier`. **Passed.**
