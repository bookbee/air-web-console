# OR-002: `options.max_cost_usd` doesn't cap a turn: 31× overspend reported as `status: ok`

| | |
|---|---|
| **Status** | verified |
| **Severity** | High |
| **Service** | air-orchestrator-service @ `ee242e1` |
| **Found** | 2026-11-14, live call (SIT) |
| **Console scenario** | none |

## Summary

A customer-channel turn with `max_cost_usd: 0.0001` spends `$0.003129`
on the prose call and returns `status: ok`, `degraded: []`. The option is
validated (`gt=0`), so the caller believes the cap is in force.
`schemas/chat.py`'s module docstring names this exact failure: "an ignored
`max_cost_usd` would be a caller believing they had capped their spend when
they had not."

## Reproduce

```bash
curl -sS -X POST $OR/v1/chat -H "X-API-Key: $CUST" -H 'Content-Type: application/json' \
  -d '{"message":"Tell me about returns 4f1","options":{"max_cost_usd":0.0001}}' | jq '{status, degraded, usage}'
```

## Actual

```json
{"status":"ok","degraded":[],"usage":{"model_calls":1,"prompt_tokens":713,"completion_tokens":66,"total_tokens":779,"cost_usd":0.003129,"cache_hit":false}}
```

## Expected

Either the turn is refused or degraded before the paid call (the expected
cost of a prose call is knowable from prompt size and `max_tokens`), or
the ceiling is passed to the gateway so that it enforces it. The response should
show `degraded`/a `cost_ceiling` trace entry whenever the ceiling shaped the
answer.

## Cause

`engine/turn.py:833-850`: the ceiling is read only on the **business**
channel, and only to decide whether a *second* (structured) call may run
after the first call has already spent. The customer channel never
consults it. Nothing checks it *before* the first model call, and it isn't
passed to the classifier either (OR-003).

## Suggested fix

Check before each paid call: `spent + estimate(call) > ceiling` → skip the call and
return the free fallback answer with `status: degraded` and a `cost_ceiling`
stage detail. The estimate can be conservative (prompt tokens × input price +
`max_tokens` × output price). Apply the same check on both channels.

## Verify

The repro returns `status: degraded` with `usage.cost_usd ≤ 0.0001`. Add
tests for both channels with a stub gateway that prices calls.

## Resolution

**Origin:** fixed, air-orchestrator-service uncommitted on top of `ee242e1` (native `make run --reload`, reloaded 04:56:13Z). Spec 0008 (REQ-COST-001..004). Pre-call check on both channels with a conservative estimate (prompt chars/3 at $3/Mtok + full `max_tokens` at $15/Mtok, `TURN__ESTIMATE__*`). The effective ceiling is now `min(option, setting)`: before, a caller's option *replaced* the operator ceiling and so could raise it. Tests in `test_cost_ceiling.py`. Contract: a turn can be `degraded` with an empty `degraded` list because of cost.

**Verifier (2026-11-14 ~05:10 UTC):** repro → `status: degraded`, `model_calls: 0`, `cost_usd: 0.0`. **Passed.**
