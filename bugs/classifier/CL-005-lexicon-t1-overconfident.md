# CL-005: Lexicon-only T1 answers with uncapped confidence and the response doesn't say the scorer is degraded

| | |
|---|---|
| **Status** | verified |
| **Severity** | Medium |
| **Service** | air-classifier-service @ `d151e5c` |
| **Found** | 2026-11-14, live call (SIT) |
| **Console scenario** | none |

## Summary

When the ONNX artifact is missing (here `./models` is empty, and
`/v1/capabilities` shows `scorer_kind: lexicon, onnx_loaded: false`), T1
runs on its word list. It labels obvious sarcasm `positive` with 0.92
confidence, which clears the T1 floor, so the ladder never escalates, and the
response says `degraded: false`. A caller gets a confidently wrong answer
with no signal. The same deployment escalates other ambiguous texts correctly,
so the failure only shows up on texts the lexicon misreads with confidence.

## Reproduce

```bash
curl -sS -X POST $CLF/v1/classify -H "X-API-Key: $KEY" -H 'Content-Type: application/json' \
  -d "{\"text\":\"Oh great, another 'premium' delivery that took two weeks. Just fantastic. 7c1\"}" \
  | jq '{decided_by, s: .sentiment.label, c: .sentiment.confidence, degraded, model}'
```

## Expected

A fallback scorer should either be confidence-capped below T1's floor (so
anything it isn't certain about escalates), or at least make the fallback
visible in the response (`degraded: true`, or `model.name` plus a
`degraded_reason`), so a caller can tell that the answer came from the
emergency backend.

## Actual

```json
{"decided_by":"t1_classifier","s":"positive","c":0.92,"degraded":false,"model":{"name":"lexicon-1.0","version":"0.1.0"}}
```

## Cause

`pipeline/tiers/t1_classifier.py:122`: the lexicon score's confidence is
used as-is. The lexicon is documented as a fallback (`t1_classifier.py:61-80`),
but nothing caps it or marks it as one. The sarcasm/negation complexity
features (`policy.py` rule 9) didn't fire for this text.

## Suggested fix

When `scorer_kind == lexicon`, cap T1 confidence at, say, `floor - ε`
unless T0 corroborates, and set `degraded: true` so the answer is attributed
to the fallback. Also consider a sarcasm cue (`"oh great"`, `"just fantastic"`,
scare quotes) as a complexity reason that forces escalation.

## Verify

The repro escalates to T2/T3 (or returns `degraded: true` if capped at T1).
Add a golden-set case for sarcasm under the lexicon backend.

## Resolution

**Origin:** fixed, air-classifier-service `8f258fc` on `fix/sit-2026-11-14`, on top of `d151e5c` (container rebuilt ~10:30 local). With no ONNX artifact, T1's confidence is held at floor − 0.01 (0.79) unless T0 committed to the same label. A lexicon-decided verdict carries `fallback` → `degraded`. Tests in `test_t1_classifier.py`, `test_ladder_wiring.py`.

**Verifier (2026-11-14 ~05:10 UTC):** sarcasm repro → T1 0.79 `low_confidence` → T3 `negative` 0.88. **Passed.** Side effect: on this lexicon-only deployment nearly every text now reaches T3 (about $0.004 each). Shipping the ONNX artifact into `./models` is what restores T1 as a cheap rung. See the regression note in CL-006.
