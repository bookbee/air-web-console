# CL-001: `options.max_cost_usd` is exceeded by up to 4×: the ceiling is only checked after a paid call

| | |
|---|---|
| **Status** | verified |
| **Severity** | High |
| **Service** | air-classifier-service @ `d151e5c` |
| **Found** | 2026-11-14, live call (SIT) |
| **Console scenario** | none yet (Classifier tab has no scenario runner; repro below) |

## Summary

A caller who sets `max_cost_usd: 0.001` to keep a call cheap gets a T3 cloud
call costing `$0.0039`, with `200 OK` and nothing in the response
saying the ceiling was crossed. The ceiling stops the ladder only *after* a
rung has spent, so any ceiling below the price of one T3 call is
decorative. air-orchestrator-service inherits the problem: it never sends a
ceiling (see OR-003).

## Reproduce

```bash
export CLF=http://127.0.0.1:8082 KEY=airc_local_dev_key
curl -sS -X POST $CLF/v1/classify -H "X-API-Key: $KEY" -H 'Content-Type: application/json' \
  -d '{"text":"Well the app works I guess, but I expected more after paying for premium. 1a2b3","options":{"max_cost_usd":0.001}}' \
  | jq '{decided_by, cost: .usage.est_cost_usd, trace: [.escalation_trace[].tier]}'
```

(Change the trailing nonce on each run, or the verdict cache answers.)

## Expected

`schemas/common.py:201` (`max_cost_usd: float = Field(default=0.05, ge=0.0, le=10.0)`)
and `pipeline/policy.py:73` describe it as the caller's spend ceiling. A
ceiling that can be exceeded several times over is not a ceiling. Expected
outcome: T3 is not attempted when its *expected* cost exceeds what's left,
and the best lower-rung verdict comes back with `degraded: true` and a
`cost_ceiling` reason in the trace.

## Actual

```
max_cost 0.001       → 200, decided_by=t3_cloud_llm, est_cost_usd=0.003885, degraded=false
max_cost 0.001, min_tier=t3 → 200, decided_by=t3_cloud_llm, est_cost_usd=0.00385
```

## Cause

- `pipeline/policy.py:75`: `if ctx.cost_spent_usd >= options.max_cost_usd` is the
  only check, and it runs between rungs on money *already spent*. Before T3,
  spent = $0, so it always passes.
- `pipeline/tiers/t3_cloud_llm.py:220`: the arbiter guard has the same shape (it
  only knows the primary's spend after the fact).
- Nothing estimates a rung's cost before calling it. The T3 prompt is large:
  every call reads about 23k–27k cached prompt tokens (`usage.cache_read_tokens`)
  for a 30-character input, so a T3 call never costs less than about $0.004.

## Suggested fix

Give each paid rung a pre-call estimate (prompt tokens are known before the
call; output tokens are bounded by `max_tokens`, priced by the gateway's
`pricing.yaml` or a conservative constant) and refuse the rung when
`spent + estimate > max_cost_usd`. Record `cost_ceiling` as the stop reason.
`min_tier: t3` together with a ceiling that can't cover T3 should be a 422 up front.

This is a policy-shape change (the policy needs the *next* rung's estimate,
not just the spend so far), so the origin owns how it's modelled.

## Verify

The repro returns `decided_by` ≤ `t2_local_llm`, `est_cost_usd ≤ 0.001`,
`degraded: true`, and a `cost_ceiling` step in the trace. Add a test where a
fake T3 has an estimated cost above the ceiling and must not be called.

## Resolution

**Origin (air-classifier-service session, reported 2026-11-14):** fixed, air-classifier-service uncommitted on top of `d151e5c` (branch `feature/model-gateway-rename`; container rebuilt ~10:30 local). Per-rung pre-call estimates in config (`tiers.<rung>.expected_cost_usd`: T0–T2 0, T3 $0.005; `model_gateway.arbiter_expected_cost_usd` $0.015). The policy stops when spent + estimate(next) > ceiling, checked before every rung; trace shows `cost_ceiling,…`. `min_tier=t3` with an unaffordable ceiling → 422 `no-verdict-within-limits`. Deviation: a stop on the caller's own ceiling is **not** `degraded` (LLD §5: degraded = a dependency being down). Tests in `test_policy.py` and `test_orchestrator.py`. `CACHE_SCHEMA_VERSION` v2→v3.

**Verifier (2026-11-14 ~05:10 UTC):** repro → `t1_classifier`, `$0.0`, trace `cost_ceiling,low_confidence,contrastive_conjunction`; `min_tier=t3` → 422. **Passed.** Deviation accepted.
