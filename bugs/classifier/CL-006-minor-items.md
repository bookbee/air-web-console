# CL-006: Minor items (auth status codes, PII labels, summary trust, cached usage, `degraded` semantics)

| | |
|---|---|
| **Status** | verified (a–d, h, i) · fixed, not live-verified (e, f, g) |
| **Severity** | Low |
| **Service** | air-classifier-service @ `d151e5c` |
| **Found** | 2026-11-14, live calls (SIT) unless marked |
| **Console scenario** | none |

Each item is small. Close them one by one in *Resolution*.

**a. Invalid key → 403 "Insufficient scope", not 401.** An unknown key is an
authentication failure. 403 tells a caller its key is valid but under-scoped,
so they go looking at scopes instead of the key.
```bash
curl -sS -X POST $CLF/v1/classify -H 'X-API-Key: nope' -H 'Content-Type: application/json' -d '{"text":"x"}' | jq '{status,title}'
# {"status":403,"title":"Insufficient scope"}
```

**b. Malformed JSON is answered 422 before auth.** An unauthenticated caller
learns the endpoint parses bodies. Same class as air-model-gateway's MG-007
(fixed there). The detail `"1: JSON decode error"` also doesn't help.
```bash
curl -sS -X POST $CLF/v1/classify -H 'Content-Type: application/json' --data '{bad' | jq .status   # 422, expected 401
```

**c. An IBAN is redacted but reported as `phone`.**
`"IBAN DE89 3704 0044 0532 0130 00"` → `pii_findings: [{"kind":"phone"}]`.
Redaction works, but the finding's kind is wrong, which skews any PII metrics.

**d. `aspects: [""]` is accepted.** An empty aspect name should be a 422,
like an empty `text`.

**e. A topic can be emitted with `confidence: 0.0`.**
`"Support resolved my issue quickly, thanks"` → `topics:[{"label":"product_quality","confidence":0.0}]`.
A zero-confidence topic is noise, and it gets counted in summary `topic_counts`.

**f. `/v1/summary/refresh` trusts an internally inconsistent `existing_summary`.**
Negative counts are rejected, but `total_items: 1` alongside
`counts_by_source_type: {"review": 999}`, `average_rating: 50` on a 5-point
scale, or `first_seen_at > last_seen_at` are all accepted and merged. The
inverted dates are silently replaced with *now*, which loses the history.
Validate the rollup's cross-field invariants, or return `422 summary_inconsistent`.

**g. A narrative that fails gives no reason.** With `SUMMARY_MODEL=local` and
Ollama down, every refresh returns `narrative: ""` and `degraded: true`,
with no detail and no fallback class. Say why (`degraded_reason`), and
consider falling back to `auto` the way the ladder does.

**h. A cached verdict reports the original call's cost.** A cache hit
(`cached: true`, 5 ms) returns `usage.est_cost_usd: 0.0148, tiers_run: 3`,
the spend of the first call, not of this one. A caller summing `est_cost_usd`
for billing double-counts every hit. Report zero (or a separate
`original_cost_usd`) on a hit.

**i. `degraded` means different things for the same outage.** When T2's
gateway call fails, the response has `degraded: true` and a
`t2_local_llm … tier_failed` step. When T2 is skipped because it reads
unavailable, `degraded: false` and T2 is missing from the trace
(`pipeline/orchestrator.py:109` vs `:115` lookahead). Pick one meaning:
"the answer is worse than thresholds allow" or "a tier failed".

## Resolution

**Origin:** air-classifier-service uncommitted on top of `d151e5c` (branch `feature/model-gateway-rename`; container rebuilt ~10:30 local). a: unknown key → 401. b: auth before body validation; unparseable JSON with a valid key → 400 `malformed-request`. c: new PIIKind `iban` (mod-97). d: blank aspects → 422. e: zero-confidence topics dropped. f: rollup cross-field invariants validated → 422 at `existing_summary.rollup` (an internally consistent average of 50 on a 5-point scale isn't caught: the rollup doesn't store the scale). g: new `degraded_reason` on summary responses (no `auto` fallback: that's a cost decision, already configurable via `MODEL_GATEWAY__SUMMARY_MODEL`). h: a cache hit reports zero usage. i: a hopped dead rung sets `degraded`, like a failed one. All contract changes regenerated into `docs/openapi.json`.

**Verifier (2026-11-14 ~05:10 UTC):** a 401, b 401 (no key), c `iban`, d 422: **passed**. e–i are covered by the origin's tests, not re-run live. **Regression from i:** `pipeline/service.py:568` never caches a degraded result. With T2 down, every verdict is degraded, so identical requests pay T3 every time ("I love it, works great…" twice → `cached:false` twice, $0.0039 + $0.0037; this was a 5 ms hit before). That also stops h being verified live. Sent back to the origin.

**Origin, regression fix (reported 2026-11-14):** `OrchestrationResult.settled` is true when the deciding verdict is the last rung that ran, isn't the lexicon fallback, didn't stop on `next_tier_unavailable`, and meets its own rung's floors. A degraded but *settled* result is cached at full TTL, with `degraded` cleared in the stored copy; unsettled degraded results still aren't stored. Tests: `test_analysis_service.py::test_a_settled_answer_reached_past_a_dead_rung_is_cached`, `::test_an_unsettled_degraded_answer_is_not_cached`, plus four in `test_orchestrator.py`. pytest 1096 passed (the 5 golden T1 failures are pre-existing, lexicon backend). No API contract change.

**Verifier (2026-11-14 ~05:20 UTC):** "I love it, works great, fast delivery <nonce>" twice: 1st T3, `degraded: true`, $0.0033; 2nd `cached: true`, `degraded: false`, 6 ms, all usage 0. **Regression fixed. Item h verified.**
