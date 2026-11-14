# OR-004: An unknown `session_id` or `proposal_id` is silently ignored: a fresh session, or a dropped approval, with 200 OK

| | |
|---|---|
| **Status** | part 1 verified · part 2 wont-fix (design) |
| **Severity** | Medium |
| **Service** | air-orchestrator-service @ `ee242e1` |
| **Found** | 2026-11-14, live calls (SIT) |
| **Console scenario** | none |

## Summary

Two silent fallbacks hide client errors and expired state:

1. **Unknown/expired `session_id`.** `POST /v1/chat {"session_id":"sess_doesnotexist"}`
   returns 200 with a **different, new** `session_id`. The client believes it
   continued a conversation. The answer just lacks every earlier turn, and
   the only clue is that the id changed. With the in-memory session backend
   (`SESSION__BACKEND=memory`, and `--reload` restarts it on every code change),
   this happens to every live conversation on each restart. `GET
   /v1/sessions/<same id>` correctly returns 404, so the two routes disagree.
2. **Unknown/expired `proposal_id` in `confirm`.** `{"message":"yes","confirm":{"proposal_id":"p_x","approve":true}}`
   returns 200 with an ordinary model answer ("could you tell me a bit more…").
   The user approved an action, and nothing says the approval went
   nowhere. Only a metric (`proposal outcome=expired`) records it.

## Reproduce

```bash
curl -sS -X POST $OR/v1/chat -H "X-API-Key: $CUST" -H 'Content-Type: application/json' \
  -d '{"message":"hi","session_id":"sess_doesnotexist"}' | jq .session_id     # a new sess_… id
curl -sS -H "X-API-Key: $CUST" $OR/v1/sessions/sess_doesnotexist | jq .status # 404
curl -sS -X POST $OR/v1/chat -H "X-API-Key: $CUST" -H 'Content-Type: application/json' \
  -d '{"message":"yes","confirm":{"proposal_id":"p_x","approve":true}}' | jq '{status, proposal, answer}'
```

## Expected

- An unknown session → `404 session-not-found` (the same problem type GET already
  uses), so the client can start fresh knowingly. Omitting `session_id`
  remains the way to start a session.
- An unknown or expired proposal → `409 proposal-expired` (or a 200 whose
  `status`/`trace` says `proposal_expired`, with no model call), never a
  normal answer.

## Cause

- `engine/turn.py:703`: `existing = await self._sessions.get(session_id, principal)`.
  A miss falls through to creating a session.
- `engine/turn.py:718-721`: `take_pending` → `None` → `metrics.record_proposal(outcome="expired")`
  → `return None`, so the turn then proceeds as if no `confirm` had been sent.

## Suggested fix

As in *Expected*. If silently re-creating a session is deliberate (resilience
across restarts), at least return `session_restarted: true` and add a
`context` trace detail, so a UI can tell the user.

## Verify

Each repro returns the explicit error. Add API tests for both.

## Resolution

**Origin:** part 1 fixed, air-orchestrator-service `4f05811` on branch `feature/model-gateway-migration` (on top of `ee242e1`; not pushed; byte-identical to the verified `--reload` tree, which was clean at commit time). Spec 0009 REQ-VAL-001/002: an unknown, expired or other-tenant session → `404 session-not-found` on JSON and SSE (status line), before anything runs. **BREAKING** for clients relying on the silent new session. Part 2 **design**: the constitution's Article II says a stale, mismatched or replayed confirm "is not an error — the turn answers normally". Changing it needs a constitution amendment (the orchestrator owner's decision), recorded as spec 0009 Q1.

**Verifier (2026-11-14 ~05:10 UTC):** part 1: `{"session_id":"sess_doesnotexist"}` → 404 `session-not-found`. **Passed.** The console's Orchestrator tab now drops a dead session id on this 404 (`isSessionNotFound`, `events.ts`). Part 2 stays open as a product decision. The reporter's view: a 200 marked `proposal_expired` satisfies Article II and still tells the user their approval went nowhere.

**Origin decision (air-orchestrator-service session, its user's decision, 2026-11-14), recorded in `0cc6158` (docs only) on `feature/model-gateway-migration`:** part 2 is **wont-fix by design**. Constitution Article II stands: an unknown or expired `confirm.proposal_id` gets a normal answer and executes nothing (spec 0009 §9 Q1). The origin's suggestion for clients: the caller knows which `proposal_id` it sent, so it can tell its user that an approval went nowhere. **Closed.**
