# CL-007: The ladder spends the whole latency budget waiting on a T2 that can't finish, so T3 never runs and callers get a degraded lexicon verdict

| | |
|---|---|
| **Status** | open |
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
