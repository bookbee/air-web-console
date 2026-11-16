# CL-009: A slow second opinion throws away the first: T3 times out with Gemini's verdict already in hand

| | |
|---|---|
| **Status** | fixed (working tree, uncommitted) · verified |
| **Severity** | Medium |
| **Service** | air-classifier-service @ `335e649` (develop), container on `:8082`; air-model-gateway `85afed6` (`auto` → `gemini-2.5-flash`, arbiter `cloud` → `gemini-3.1-pro-preview`) |
| **Found** | 2026-11-16, live calls |
| **Console scenario** | none |

## Summary

When T3's first answer is under the arbitration floor (0.65), T3 asks the
arbiter model for a second opinion. The arbiter (`gemini-3.1-pro-preview`,
a thinking model) often needs more than what is left of T3's 8 s window. The
ladder then cancels the whole rung, and the first answer, which T3 already
holds, is lost: the caller waits the full 8 s and gets T1's lexicon verdict
(`intent: null`, confidence ~0.48, `degraded: true`), or a `503 no-verdict`
when `min_tier` is `t3_cloud_llm`. Short, ambiguous texts hit it every time.

## Reproduce

```bash
for t in '12345' 'fine' 'okay'; do
  curl -s -w ' %{time_total}s\n' localhost:8082/v1/classify -H 'X-API-Key: airc_local_dev_key' \
    -H 'Content-Type: application/json' -d "{\"text\":\"$t\"}" \
    | jq -c '{decided_by, degraded, conf: .sentiment.confidence, trace: [.escalation_trace[] | [.tier,.succeeded]]}'
done
curl -s localhost:8082/v1/classify -H 'X-API-Key: airc_local_dev_key' -H 'Content-Type: application/json' \
  -d '{"text":"okay","options":{"min_tier":"t3_cloud_llm"}}' | jq '{status, detail}'
```

## Expected

`pipeline/tiers/t3_cloud_llm.py` says it itself: "A failed second opinion is
not a failed request: the primary answer is unconfident, not unusable, and
returning it beats degrading to a rung that knows less."

## Actual

```
"12345"        200  8008 ms  decided_by t1_classifier  degraded  conf 0.48   t3_cloud_llm succeeded=false
"good\0bad"    200  8006 ms  decided_by t1_classifier  degraded
"okay" min_tier=t3   503 no-verdict after 8020 ms
log: tier.timeout tier=t3_cloud_llm timeout_s=7.97   (the primary call had returned in ~1 s)
```

## Cause

`_arbitrate` catches `TierError` from the arbiter call, but the arbiter's own
timeout is `min(8 s, remaining budget)` counted from when *it* starts, while
the ladder's `asyncio.wait_for` around `analyse` counts 8 s from when the
*rung* started. The ladder's timer always fires first, cancelling `analyse`
and the primary result with it.

## Suggested fix

Bound the arbiter by what is left of the rung's window, and skip it when too
little is left.

## Verify

The repro returns `decided_by: t3_cloud_llm` in every case; the `min_tier`
call is a 200.

## Resolution

Fixed 2026-11-16 in the working tree (`pipeline/tiers/t3_cloud_llm.py`): the
arbiter call runs under `asyncio.wait_for(…, allowance)` where the allowance
is the rung window less the time the primary took less 0.25 s; under 1 s it
is not started (`t3.arbitration_skipped reason=rung_window`). A timeout logs
`t3.arbitration_failed` and returns the primary. Tests:
`test_a_slow_arbiter_does_not_take_the_primary_answer_with_it`,
`test_arbitration_is_not_started_when_the_rung_window_is_nearly_spent`.

Verified 2026-11-16 on the rebuilt container: "12345", "fine", "good\0bad" →
`t3_cloud_llm`; `min_tier: t3_cloud_llm` "okay then" → 200 in 7.8 s with the
primary's verdict (`t3.arbitration_failed error=TimeoutError` in the log).

Left for the origin: the arbiter is slow and about 4× the price of the answer
it reviews ($0.003 against $0.0007 per classification). Consider a faster
arbiter class or a lower floor.
