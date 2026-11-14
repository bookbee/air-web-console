# OR-003: The classify stage's spend and latency are invisible: not in turn `usage`, not capped, and allowed to use the whole deadline

| | |
|---|---|
| **Status** | verified |
| **Severity** | Medium |
| **Service** | air-orchestrator-service @ `ee242e1`, with air-classifier-service @ `d151e5c` |
| **Found** | 2026-11-14, live calls (SIT) |
| **Console scenario** | none |

## Summary

Every chat turn calls air-classifier, which on ambiguous text climbs to its
T3 cloud LLM (a paid call of about $0.004–$0.015, 1.7–4.6 s). The orchestrator:

1. **Leaves that spend out of the turn's `usage`.** A turn reports
   `model_calls: 1, cost_usd: 0.0030` while the classifier separately spent
   more than that on the same turn. Real turn cost is under-reported by about 2–4×,
   and no ceiling (OR-002, the session ceiling) can see it.
2. **Doesn't cap it.** It sends only `latency_budget_ms`, never
   `max_cost_usd` or `max_tier`, so the classifier's default 5-cent per-call
   ceiling applies (and that ceiling isn't enforced either, CL-001).
3. **Lets it consume the turn deadline.** The budget is "whatever is left of the
   turn, less headroom", so with `deadline_ms: 2000` classify took 1,759 ms,
   synthesis got 244 ms and degraded, and the turn blamed
   `degraded: ["air-model-gateway"]`. Classify is enrichment; the answer is
   the product.

## Reproduce

```bash
# 1. spend: compare the turn's usage with what the classifier reports for the same text
M='Well, the app works I guess, but I expected more after paying for premium 8e2'
curl -sS -X POST $OR/v1/chat -H "X-API-Key: $CUST" -H 'Content-Type: application/json' \
  -d "{\"message\":\"$M\"}" | jq '{usage, classify: [.trace[]|select(.stage=="classify")]}'
curl -sS -X POST http://127.0.0.1:8082/v1/classify -H 'X-API-Key: airc_local_dev_key' -H 'Content-Type: application/json' \
  -d "{\"text\":\"$M x\"}" | jq '.usage'
# 2. deadline starvation
curl -sS -X POST $OR/v1/chat -H "X-API-Key: $CUST" -H 'Content-Type: application/json' \
  -d '{"message":"My parcel is damaged, what now? 3d1","options":{"deadline_ms":2000}}' \
  | jq '{status, degraded, trace: [.trace[]|{stage,status,latency_ms}]}'
```

## Actual

```
turn usage: {"model_calls":1,"cost_usd":0.002976}   classify stage: 4646 ms, T0→T1→T2→T3
deadline 2000: classify ok 1759 ms · synthesise degraded 244 ms · degraded=["air-model-gateway"]
```

## Cause

- `clients/classifier.py:94`: `Classification` deliberately parses only the
  label fields, so the classifier's `usage` is dropped.
- `clients/classifier.py:155` `bound_s` plus the `budget_ms` computation (around line 165):
  the classify budget is the remaining turn time, and the request body carries only
  `latency_budget_ms`.
- The `degraded` attribution names the service whose call ran out of time,
  not the stage that used the time up.

## Suggested fix

- Parse `usage.est_cost_usd`/tokens from the classifier response and add them
  to turn `usage` (a separate `classifier` sub-object is fine), and count them
  against both ceilings.
- Give classify a fixed share of the deadline (for example ≤ 25%, capped at
  800 ms) and send `max_cost_usd` (what's left of the turn ceiling) and,
  configurably, `max_tier` (`t2_local_llm` keeps chat text on-prem and free).
- Attribute deadline-caused degradation to `deadline`, not to the next service.

## Verify

Repro 1: turn `usage` includes the classifier's cost. Repro 2: synthesis
gets the larger share and the turn isn't degraded at `deadline_ms: 2000`.

## Resolution

**Origin:** fixed, air-orchestrator-service uncommitted on top of `ee242e1` (native `make run --reload`, reloaded 04:56:13Z). Spec 0008 REQ-COST-005/006, spec 0005 REQ-CLS-014..017, spec 0003 REQ-MGW-018. Classifier `est_cost_usd` is added to `usage.cost_usd` and the session total, and broken out as the new `usage.classifier_cost_usd`. Classify gets at most `deadline_share` (0.25) of the deadline and is sent `max_cost_usd` (ceiling minus the synthesis estimate); `max_tier` only if `DOWNSTREAM__CLASSIFIER__MAX_TIER` is set (unset by default). A gateway timeout on a call that got less than half the deadline is reported as "turn deadline reached". Contract: additive.

**Verifier (2026-11-14 ~05:10 UTC):** `usage.classifier_cost_usd` present; `deadline_ms: 2000` → classify ok 261 ms, synthesise ok 1286 ms, turn `ok`. **Passed.** Note: `max_tier` for chat classification is still unset; whether to keep chat text on-prem (`t2_local_llm`) is an operator decision.
