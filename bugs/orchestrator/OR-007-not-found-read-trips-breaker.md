# OR-007: A lookup of an order that isn't the customer's counts as a gateway failure, and five of them switch lookups off for every customer

| | |
|---|---|
| **Status** | fixed (working tree, not committed) · verified |
| **Severity** | High |
| **Service** | air-orchestrator-service @ `8ed74d7` (+ uncommitted spec 0013 work), container on `:8081`, planner on, air-tools-gateway @ `baec19d` |
| **Found** | 2026-11-15, live calls through the console (SIT 2026-11-15) |
| **Console scenario** | none (needs the planner; repro below) |

## Summary

A read capability answered `404 not_found` (an order that doesn't exist, or
belongs to another customer or tenant: the gateway deliberately answers the
same 404 for all three) is handled as a **gateway failure**:

1. The turn is `status: "degraded"` with `degraded: ["air-tools-gateway"]`,
   and the customer is told the lookup *is broken* and to try again later,
   instead of "I can't find an order 99999 on your account". One answer even
   says "I can't look up orders or account details in this chat".
2. It counts toward the client's circuit breaker. The breaker is per client,
   so **one customer typing five wrong order numbers opens it for every
   customer of every tenant** for `breaker_cooldown_s` (30 s). Repeating it
   keeps tools off indefinitely: a free denial of service on order lookups,
   which the gateway itself (which answered every call in ~10 ms) never saw.
3. Monitoring is misled: `capability_calls_total{outcome="error"}`, the
   `GATHER` stage and `degraded` all report an outage that isn't one.

Propose already treats `not_found` as a refusal (`REQ-TGW-028`); reads don't.

## Reproduce

Through the console BFF (it mints the customer token):

```bash
H=(-H 'Authorization: Bearer air-web-console-dev-gateway-token' -H 'Content-Type: application/json'
   -H 'Accept: application/json' -H 'X-Target-Name: local' -H 'X-Target-Channel: customer')
for i in 0 1 2 3 4; do
  curl -s localhost:3000/api/orchestrator/v1/chat "${H[@]}" -H 'X-Target-Customer: cust_1001' \
    -d "{\"message\":\"Where is my order 9999$i?\"}" | jq -r '.responseJson.status'
done
# a different customer, a real order
curl -s localhost:3000/api/orchestrator/v1/chat "${H[@]}" -H 'X-Target-Customer: cust_1002' \
  -d '{"message":"Where is my order 70011?"}' | jq '.responseJson | {status, answer, trace: [.trace[] | select(.stage=="gather")]}'
```

## Expected

- A `not_found` (and the other closed-set refusals) on a read is the
  gateway *answering*, not failing: no breaker count, outcome `refused`, the
  turn `ok`, and the synthesis prompt says the order wasn't found for this
  customer (without saying whether it exists elsewhere).
- Spec 0012 `REQ-TGW-010`: "*Any failure* reports `GATHER` as `degraded`":
  a 404 for a wrong order number isn't a failure of the gateway.
- `REQ-TGW-028` already states this for propose; reads need the same rule.

## Actual

```
0 degraded  gather:degraded: orders.get failed     (gateway: 404 not_found, 10 ms)
1..4 degraded  (same)
downstream.breaker  closed -> open  consecutive_failures=5  subject_hash=a64a0b07c303 (cust_1001)
victim cust_1002: degraded  gather:degraded: orders.get circuit open
answer: "I'm not able to pull up order details like tracking status right now, so I can't
         check where order 70011 is at the moment. You're welcome to try again in a little while…"
```

Single not-found turns (`Where is order 99999?`, another customer's 70011,
the other tenant's 90001):

```
status degraded · degraded ['air-tools-gateway']
"I can't pull up order details right now since the lookup isn't working. Could you try again…"
```

## Cause

`src/air_orchestrator_service/clients/tools_gateway.py`, `read()` calls
`_call()` without `refusal_codes`, so `post_json` raises a plain
`DownstreamError(reason="error")` for a 404 problem, which `clients/base.py`
counts as a breaker failure. `propose()` passes `REFUSAL_CODES`; `read()`
doesn't. The tools stage then reports every `DownstreamError` as a failed
lookup (`REQ-TGW-011` notice: "could not be looked up").

## Suggested fix

1. Pass `refusal_codes=REFUSAL_CODES` (at least `not_found`; arguably
   `not_permitted`) on `read()`, so a refusal is a breaker success and outcome
   `refused`.
2. In the tools stage, distinguish a refused read from a failed one: a
   refused read leaves `GATHER` `ok`, keeps the turn `ok`, and puts a
   "*no matching order for this customer*" fact (not the "could not be
   looked up" notice) in the lookups message.
3. Test: five `not_found` reads leave the breaker closed and the next
   customer's lookup is sent.

## Verify

The repro's five turns are `ok`, each answer says the order wasn't found on
this account, and the sixth (cust_1002, 70011) answers "packed". No
`downstream.breaker` line.

## Resolution

**Origin (air-orchestrator-service session, 2026-11-15):** REQ-TGW-029 (spec 0012): a read answered `not_found` or `not_permitted` is a refusal, not a failure: no breaker count, `GATHER` `ok` with detail `orders.get found nothing`, turn `ok`, and the synthesis prompt says nothing matching was found on this customer's account (never whether it exists elsewhere). In the working tree on top of `8ed74d7`, not committed (the user reviews and pushes); `make check` 549 passed, 3 skipped. Redeployed to the `:8081` container.

**Verified 2026-11-15 ~08:40 UTC** against `:8081` ("8ed74d7 + working tree"): the repro's five turns are each `ok` with `degraded: []` and `gather: orders.get found nothing`, and each answer says "I couldn't find order 9999x on your account". No `downstream.breaker` line. The sixth turn (cust_1002, 70011) is `ok` with `orders.get ok`. cust_1001 asking about 70011 gets "I couldn't find order 70011 on the account": isolation unchanged.

