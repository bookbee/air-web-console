# air-orchestrator-service: bug reports

Found during the platform SIT on 2026-11-14 (see [../SIT-2026-11-14.md](../SIT-2026-11-14.md)).
Process, statuses and severities are in [../README.md](../README.md).

| | |
|---|---|
| **Build tested** | `air-orchestrator-service` @ `ee242e1` (clean), native `uvicorn --reload` on `:8081`, one worker |
| **Fixes** | uncommitted on top of `ee242e1`, reloaded 04:56:13Z, verified ~05:10 UTC |
| **Dependencies** | air-model-gateway @ `1fa80de`, air-classifier-service @ `d151e5c`, air-infrastructure-service on `:8080`; session and cache backends `memory` |

## Index

| ID | Severity | Status | Title |
|---|---|---|---|
| [OR-001](OR-001-card-numbers-not-masked.md) | High | verified | Card numbers aren't masked on input: stored and sent to the classifier, the gateway and the cloud LLM |
| [OR-002](OR-002-turn-cost-ceiling-not-enforced.md) | High | verified | `options.max_cost_usd` doesn't cap a turn: 31× overspend reported `ok` |
| [OR-003](OR-003-classifier-spend-invisible.md) | Medium | verified | Classify-stage spend left out of `usage`, uncapped, and allowed to use the whole deadline |
| [OR-004](OR-004-unknown-session-and-proposal-silent.md) | Medium | part 1 verified · part 2 design (pending) | An unknown `session_id`/`proposal_id` is silently ignored with 200 |
| [OR-005](OR-005-minor-items.md) | Low | verified (a,b,c,e) · d wont-fix | Minor: blank message billed, invalid `output_schema`, `allow_routes: []`, readiness, auth order |

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
