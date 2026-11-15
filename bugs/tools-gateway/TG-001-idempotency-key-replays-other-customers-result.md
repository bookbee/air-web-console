# TG-001: A reused `Idempotency-Key` replays another customer's execution: their order and refund, reported to a different customer as `done`

| | |
|---|---|
| **Status** | resolved: `3bceec1` (develop, not pushed), deployed to `:8084` · verified |
| **Severity** | High |
| **Service** | air-tools-gateway @ `baec19d` (develop), container on `:8084`, Redis store |
| **Found** | 2026-11-15, live calls straight to the gateway (SIT 2026-11-15) |
| **Console scenario** | none yet (proposed `execute-key-reused`, headless) |

## Summary

The execute route's replay check (`src/http/routes/execute.ts:195`) looks up
the stored response by `(tenant, Idempotency-Key)` only, before it even reads
the proposal. A key already used for one proposal returns that execution's
stored response to **any** later execute in the tenant that presents it:
another proposal, another subject, another order.

Decision C12 (`docs/enhancements.md:28`, `docs/orchestrator-report.md:52`)
chose "replay the first response unchanged", reasoning that the orchestrator
derives keys from its own proposal id so "it should never happen". That holds
for the orchestrator today, but not for the contract: any other caller (a
retry library, a key like `cancel-<order_id>`, a buggy client, a second
orchestrator replica with a key-derivation bug) hits this, and the
consequences are worse than the decision assumed:

1. **Disclosure across customers.** `cust_1002`'s execute returns `cust_1001`'s
   order id and refund amount.
2. **A false `done`.** `cust_1002`'s order 70011 was never cancelled, but the
   caller was told `done`. The orchestrator would tell that customer it's
   cancelled (`REQ-TGW-017`).
3. The gateway's own rule "missing, another subject, or another capability
   are one identical 404" (step 2) is bypassed, because step 1 runs first.

## Reproduce

```bash
GW=localhost:8084; R=airtg_read_local_dev; X=airtg_exec_local_dev; K=shared-$RANDOM$RANDOM
a=$(curl -s $GW/v1/actions/orders.cancel/propose -H "X-API-Key: $R" -H 'Content-Type: application/json' \
     -d '{"subject":"cust_1001","arguments":{"order_id":"55120"}}' | jq -r .proposal_id)
b=$(curl -s $GW/v1/actions/orders.cancel/propose -H "X-API-Key: $R" -H 'Content-Type: application/json' \
     -d '{"subject":"cust_1002","arguments":{"order_id":"70011"}}' | jq -r .proposal_id)
curl -s $GW/v1/actions/orders.cancel/execute -H "X-API-Key: $X" -H "Idempotency-Key: $K" -H 'Content-Type: application/json' \
     -d "{\"proposal_id\":\"$a\",\"subject\":\"cust_1001\"}"
curl -s $GW/v1/actions/orders.cancel/execute -H "X-API-Key: $X" -H "Idempotency-Key: $K" -H 'Content-Type: application/json' \
     -d "{\"proposal_id\":\"$b\",\"subject\":\"cust_1002\"}"      # <- cust_1002's request
curl -s $GW/v1/tools/orders.get -H "X-API-Key: $R" -H 'Content-Type: application/json' \
     -d '{"subject":"cust_1002","arguments":{"order_id":"70011"}}' | jq .data.status
```

## Expected

A key bound to a different request is refused and changes nothing: the
IETF `Idempotency-Key` draft (§2.7) and Stripe both answer **422** when a key
is reused with a different payload. Here: compare the stored record's
`proposalId` (and subject, capability) with the request, and on mismatch
answer `422 invalid_arguments` with detail "This Idempotency-Key was already
used for a different request." (an existing closed-set code, so no contract
enum change), or add a dedicated code if the owner prefers. A same-request
replay is unchanged.

## Actual

```
cust_1001 exec 55120, key K : 200 done  gx_f58cb768f3f972fc  result {order_id 55120, refund 1240.00 INR}
cust_1002 exec 70011, key K : 200 done  gx_f58cb768f3f972fc  result {order_id 55120, refund 1240.00 INR}
70011 state afterwards      : packed   (never cancelled)
```

Across tenants the record is scoped correctly: othershop's execute with
brightcart's key performed othershop's own cancel (`799.00`).

## Cause

`execute.ts:195-199`: `deps.idempotency.get(tenant, idempotencyKey)` returns
the stored response with no check against `proposalId`/`subject`; the same
at `:218` inside the lock. The stored record already carries `proposalId`
(it is logged as `action.replayed`).

## Suggested fix

In both replay checks: `if (replay.proposalId !== proposalId || replay.subject
!== subject) throw idempotencyKeyMismatch()` (422, nothing stored). Store
`subject` and `capability` alongside `proposalId` if they aren't already.
Tests: same key + different proposal → 422 and the second proposal is still
open; same key + same proposal → identical replay (the existing test).
Update C12 in `docs/enhancements.md` and the contract's rule 8 text.

## Verify

The repro's second execute answers 422, 70011 stays `packed`, and executing
`$b` with a fresh key then cancels it.

## Resolution

**Origin (air-tools-gateway session, 2026-11-15):** accepted; C12 revised. In
the working tree on top of `baec19d` (`src/http/routes/execute.ts`,
`src/actions/idempotency.ts`, tests), not committed. A record is bound to
the `proposal_id`, subject and capability it was stored for; both replay
checks compare all three. A mismatch is **`400 invalid_arguments`** ("This
Idempotency-Key was already used for a different request."), not 422,
because execute's contract declares no 422 (their deviation C1); the
"400 or a declared 422?" question is logged for the orchestrator in C12.
Records stored before the fix carry only `proposal_id` and are matched on
it until they expire (24 h). Gateway suite: 241 passed (261 with Redis).

**Verified 2026-11-15 08:35 UTC** against that working tree, run as a
throwaway instance on `:8094` (memory store; `:8084` untouched, still
`baec19d`): the repro's second execute is `400` with no `55120`/`1240` in
the body, 70011 stays `packed`, the first key still replays `gx_f0b5…`
unchanged, and a fresh key then cancels 70011. The console's headless rows
against `:8094`: 30/30, 1 skipped (55120 already used by the repro).
**Still to do:** commit, then rebuild the `:8084` container (the
orchestrator's dependency), and re-run `make tools-check`.

**Committed and deployed 2026-11-15 ~13:46 UTC:** `3bceec1` on develop (not
pushed); `:8084` re-created on that image. Origin's live re-check on `:8084`:
key K executes cust_1001's 55120 (`done`); the same K on cust_1002's proposal →
`400` "This Idempotency-Key was already used for a different request."; K
replayed for 55120 → the identical `gx_` execution. Matches this console's
own verification of the same change on `:8094`.
