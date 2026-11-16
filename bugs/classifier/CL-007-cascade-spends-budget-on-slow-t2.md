# CL-007: The ladder spends the whole latency budget waiting on a T2 that can't finish, so T3 never runs and callers get a degraded lexicon verdict

| | |
|---|---|
| **Status** | fixed (working tree, uncommitted) · verified |
| **Severity** | Medium |
| **Service** | air-classifier-service @ `335e649` (develop), container on `:8082`; air-model-gateway `cb8a1d2`, Ollama `llama3.2:3b` on CPU |
| **Found** | 2026-11-15, live calls (direct and from air-orchestrator-service) |
| **Console scenario** | none |

## Summary

T2's local model can't answer within its 4 s timeout on this host (CPU
Ollama, see the 2026-11-14 SIT environment notes). The ladder still waits
the full timeout on every escalation, and because T2's timeout is clamped to
the *remaining* budget, a caller with a budget under about 8 s never reaches
T3:

- **Every air-orchestrator-service turn** (it allows the classifier about
  3.5 s) waits 3.4 s on T2, gets `budget_exhausted`, and receives T1's lexicon
  verdict at ~0.48 confidence, `intent: null`, `degraded: true`. The
  orchestrator's `classify` detail reads `classifier_degraded` on every turn,
  and 3.5 s is added to every reply for nothing.
- **With default options** (8 s budget), T2's 4 s timeout plus T3's ~4 s
  overruns: 5 of 9 default-option texts in this run ended `t3_cloud_llm
  unknown`, decided by T1 lexicon (e.g. the prompt-injection complaint,
  the PII refund request, the rating mismatch).
- When T2 *does* answer quickly (a gateway cache hit, ~80 ms), it's often
  wrong (`negative 0.92` for "Where is my order 48213?"), so the orchestrator
  sometimes gets `urgency=high requires_human` for a neutral question.

This is not CL-004 (readiness) though it shares the cause: nothing in the
ladder learns that T2 is slow, so it pays the full timeout every time.

## Reproduce

```bash
# as the orchestrator calls it: ~3.5 s budget
curl -s localhost:8082/v1/classify -H 'X-API-Key: airc_local_dev_key' -H 'Content-Type: application/json' \
  -d '{"text":"Where is my order 48213, it is late?","options":{"latency_budget_ms":3500}}' \
  | jq '{decided_by, degraded, sentiment: .sentiment.label, conf: .sentiment.confidence, trace: [.escalation_trace[] | [.tier,.label,.escalated_because]]}'
```

## Expected

A budget-aware ladder: when the remaining budget can't cover T2's expected
latency *and* still leave room for T3, skip T2 (or run T2 and T3 concurrently
and take T3 if T2 isn't back). The `01-hld.md` cost/latency rationale for the
ladder assumes T2 is fast; when it measurably isn't, the classifier should
stop paying for it on every request.

## Actual

```
classifier log, request from the orchestrator:
  t0_rules  unknown  no_shortcut_matched
  t1_classifier neutral 0.4754 low_confidence
  tier.timeout t2_local_llm timeout_s=3.41
  t2_local_llm unknown budget_exhausted          -> decided_by t1_classifier, degraded
```

## Cause

`pipeline/orchestrator.py:278` `_timeout_s` takes min(rung timeout, remaining
budget) and the ladder runs rungs strictly in order, with no latency
history and no breaker per rung.

## Suggested fix

1. Track T2 latency (EWMA or p90 over recent calls); skip T2 when
   `expected_t2 + expected_t3 > remaining`, recording `escalated_because:
   "skipped_slow"`.
2. Alternatively a per-tier breaker: after N consecutive T2 timeouts, skip T2
   for a cooldown and go straight to T3 (within `max_tier`/`max_cost_usd`).
3. Report it in `/v1/ready` (`t2_local_llm` ready but `slow`), which also
   answers CL-004's decision.

## Verify

The repro returns `decided_by: t3_cloud_llm` in under ~4 s with `t2_local_llm`
skipped; orchestrator turns stop showing `classifier_degraded`.

## Resolution

_Filled in by the origin._

## Resolution

Fixed 2026-11-16 in the working tree (`pipeline/orchestrator.py`), as
suggested fixes 1 and 2 combined. The ladder keeps a little latency history
per rung (`_Pace`). A rung is stepped over, only ever for a servable rung
above it, when:

- it has timed out twice in a row: skipped for 300 s, then probed by one
  request (`tier.skipped reason=slow_tripped`, response `degraded: true`,
  like any rung the ladder could not use); or
- its last run timed out and its usual latency plus the next rung's does not
  fit the request's remaining budget (`reason=slow_for_budget`, not
  `degraded`: the caller's budget chose the shorter ladder).

A rung that answered last time is never skipped, and a timeout cut short by
a nearly spent budget does not count against the rung. The history is per
worker process, so each worker pays two slow requests to learn it. Seven
tests in `tests/unit/test_orchestrator.py` ("A rung that keeps timing out").

Verified 2026-11-16 on the rebuilt container (host Ollama on an Intel CPU,
where `llama3.2:3b` cannot answer in 4 s): at the orchestrator's 3.5 s
budget, calls 1–2 are `t1_classifier` degraded, every later one is
`t3_cloud_llm` in 1.5–3.3 s with an intent. Orchestrator turns now show
`classify: ok (… intent=order_tracking …)`.

Not done: `/v1/ready` still reports `t2_local_llm` ready while it is being
skipped (CL-004's decision). Related: CL-009.

Pre-existing on clean `develop`, unrelated: `ruff format --check` fails on 5
files, and `tests/eval/test_golden_set.py` fails its T1 cases on a host with
no ONNX model (`/opt/models` is empty in the container too, so T1 is the
lexicon and nearly every text escalates to a paid tier).
