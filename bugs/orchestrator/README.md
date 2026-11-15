# air-orchestrator-service: bug reports

Found during the platform SIT on 2026-11-14 (see [../SIT-2026-11-14.md](../SIT-2026-11-14.md)).
Process, statuses and severities are in [../README.md](../README.md).

| | |
|---|---|
| **Build tested** | `air-orchestrator-service` @ `ee242e1` (clean), native `uvicorn --reload` on `:8081`, one worker |
| **Fixes** | branch `feature/model-gateway-migration`: `1bacfe5` (OR-001), `616709b` (OR-002, OR-003), `4f05811` (OR-004 part 1, OR-005 a/b/c/e), `0cc6158` (design decisions, docs); not pushed; verified ~05:10 UTC |
| **Dependencies** | air-model-gateway @ `1fa80de`, air-classifier-service @ `d151e5c`, air-infrastructure-service on `:8080`; session and cache backends `memory` |

## Index

| ID | Severity | Status | Title |
|---|---|---|---|
| [OR-001](OR-001-card-numbers-not-masked.md) | High | verified | Card numbers aren't masked on input: stored and sent to the classifier, the gateway and the cloud LLM |
| [OR-002](OR-002-turn-cost-ceiling-not-enforced.md) | High | verified | `options.max_cost_usd` doesn't cap a turn: 31× overspend reported `ok` |
| [OR-003](OR-003-classifier-spend-invisible.md) | Medium | verified | Classify-stage spend left out of `usage`, uncapped, and allowed to use the whole deadline |
| [OR-004](OR-004-unknown-session-and-proposal-silent.md) | Medium | part 1 verified · part 2 wont-fix (design) | An unknown `session_id`/`proposal_id` is silently ignored with 200 |
| [OR-005](OR-005-minor-items.md) | Low | verified (a,b,c,e) · d wont-fix | Minor: blank message billed, invalid `output_schema`, `allow_routes: []`, readiness, auth order |
| [OR-006](OR-006-brand-name-defaults-to-air.md) | Low | open | Customer replies call the business "AIR" while answering from Brightcart's knowledge base |
| [OR-007](OR-007-not-found-read-trips-breaker.md) | High | fixed (working tree) · verified | A read's `404 not_found` counts as a gateway failure: wrong answer, degraded turn, and five of them open the breaker for every customer |
| [OR-008](OR-008-allow-routes-ignored.md) | Medium | fixed (working tree) · verified | `options.allow_routes` is accepted but never applied: `["rag"]` still looks up orders |
| [OR-009](OR-009-assistant-disowns-completed-cancel.md) | High | fixed (`customer_care:v3`) · verified (residuals in OR-014) | After a confirmed cancellation the next turn says it wasn't done |
| [OR-010](OR-010-proposing-turn-drops-rest-of-message.md) | Medium | open (design-level) | A proposing turn answers only the proposal; the rest of the message is dropped |
| [OR-011](OR-011-gateway-down-not-degraded.md) | Low | fixed (working tree) · verified · "always degraded?" awaiting the user | With air-tools-gateway down, turns report `ok` and `degraded: []` (AC-9) |
| [OR-012](OR-012-memory-sessions-with-two-workers.md) | High | fixed (working tree) · verified | Default config runs two workers on the in-memory session store: half of all follow-ups get `404 No such session` |
| [OR-013](OR-013-minor-validation-items.md) | Low | a, b fixed (working tree) · verified · c by design | Minor: `confirm.approve` accepts `"yes"`, malformed JSON is a 422 naming field "16", oversize body 400 |
| [OR-014](OR-014-v3-residuals.md) | Medium | fixed (planner:v2, customer_care:v4) · verified | `customer_care:v3` residuals: a cancel plus a question loses the cancel and says it can't change orders; invented cancellation dates; one injection reply |
| [OR-015](OR-015-degraded-planner-answers-claim-actions.md) | High | fixed (REQ-PLN-017) · verified by origin | When the planner times out, the answer asks to confirm a change never proposed, or says a lookup is running |
| [OR-016](OR-016-unsourced-policy-figures.md) | Medium | b closed · a deferred (waits on RAG sources) · c open, unscheduled | Unsourced refund times ("5 to 10 working days"); an already-cancelled order gets a vague "not possible, e.g. once shipped" |

## Test setup

```bash
export OR=http://127.0.0.1:8081 CUST=airo_local_customer_key BIZ=airo_local_business_key
```

Both are the development keys from the orchestrator's `.env.example`.

## What was checked and works

Auth (401 for missing/invalid keys); channel enforcement (403
`channel-mismatch` both ways); validation (empty, 32k cap, unknown fields,
deadline 100–300000, `max_cost_usd > 0`, route enum); 404/405 problem+json;
the answer cache is keyed with conversation history (no cross-session
leak); names, emails and phones masked in stored history; the input guardrail blocks
"ignore previous instructions"; role-play, fake-delimiter and off-topic
prompts declined by the model; business structured output masked; SSE
stream event order `turn.start → stage… → answer.delta… → answer → usage →
turn.end`; deadline degrades softly with a trace; request id propagated to
the classifier.
