# OR-011: With air-tools-gateway down, turns report `ok` and `degraded: []`: the outage never shows in turn telemetry (AC-9)

| | |
|---|---|
| **Status** | fixed (working tree, not committed) · verified · follow-up awaiting the user |
| **Severity** | Low |
| **Service** | air-orchestrator-service @ `8ed74d7` (+ uncommitted spec 0013 work), planner on |
| **Found** | 2026-11-15, live calls with the gateway container stopped |
| **Console scenario** | none |

## Summary

Spec 0012 AC-9: with the gateway unreachable, "`GATHER` is `degraded` naming
`air-tools-gateway`; and the prompt carries the 'could not look up your
orders' notice". §7: "Inventory fetch fails, or circuit open → `GATHER`
detail says the inventory is unavailable". Instead the planner is simply
skipped as if no gateway were configured:

```
"Where is my order 48213?"  -> status ok, degraded [], routes ['rag']
  plan:skipped:no capabilities offered
  gather:ok:sources=2 dropped=0
  A: "I can't look up order details or tracking info from here …"
```

The answer is honest, but a dashboard of turn statuses or `degraded`
services shows nothing while every order question goes unanswered.
`/v1/capabilities` does report `air-tools-gateway reachable: false`
(correct), and `/v1/ready` not probing it is `REQ-CLB-008`.

## Reproduce

`docker stop air-tools-gateway-air-tools-gateway-1`, wait past the inventory
grace, send any order question as `cust_1001`, then `docker start` it.

## Suggested fix

When the gateway is configured and enabled for the tenant but the inventory
is unavailable, say so in the `plan` or `gather` detail ("tools inventory
unavailable: connection failed") and add `air-tools-gateway` to `degraded`.
The plan can't know whether a lookup was needed, so either mark every such
turn degraded, or count it in a metric
(`capability_inventory_unavailable_total`) and degrade only when the message
mentions an order. Whichever: align AC-9 and §7 with it.

## Resolution

**Origin (air-orchestrator-service session, 2026-11-15):** spec 0013
`REQ-PLN-011` gains a skip reason. When the inventory can't be fetched
(gateway down, or circuit open), `PLAN` reads `skipped` "no capabilities
offered: air-tools-gateway inventory unavailable", and the SSE stage event
names `air-tools-gateway` as its `downstream`. No planning call is made. The
failed inventory GET was already counted in
`downstream_calls_total{service="air-tools-gateway"}`. Test
`test_planner.py::test_an_unavailable_inventory_is_named_in_the_plan_stage`;
`make check` 550 passed. Working tree, not committed.

**Verified 2026-11-15 ~08:54 UTC** on `:8081`, with the tools gateway stopped
for longer than the 300 s inventory grace: three turns (both workers) read
`plan: skipped: no capabilities offered: air-tools-gateway inventory
unavailable`, and the SSE `plan` stage event carries `"downstream":
"air-tools-gateway"`. (Inside the grace, a worker still planned and degraded
`GATHER` with "orders.get unreachable" naming `air-tools-gateway`: the
REQ-TGW-010 path, also correct.)

**Awaiting the user:** whether every turn should be `degraded` while the
gateway is down. Spec 0012 §7 says degraded only "when the plan needed one",
and nothing can be planned from an empty menu, so this is a spec change.
