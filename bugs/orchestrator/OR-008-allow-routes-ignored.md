# OR-008: `options.allow_routes` is accepted but never applied: a turn limited to `["rag"]` still looks up orders

| | |
|---|---|
| **Status** | fixed (working tree, not committed) · verified |
| **Severity** | Medium |
| **Service** | air-orchestrator-service @ `8ed74d7` (+ uncommitted spec 0013 work), planner on |
| **Found** | 2026-11-15, live call through the console, then code reading |
| **Console scenario** | none |

## Summary

`TurnOptions.allow_routes` is documented as "Restrict the planner to these
routes" and validated (`REQ-VAL-005` refuses `[]`), but nothing in `src/`
reads it. It has been inert since the initial commit (`git log -S allow_routes
-- src` finds only `2f140a0`). Before the planner that was harmless; now a
caller that narrows a turn to the knowledge base (for example a widget with no
order access, or a test isolating RAG) still gets order lookups, and could get
a proposal. The schema's own docstring names this exact failure: "an ignored
`max_cost_usd` would be a caller believing they had capped their spend".

## Reproduce

```bash
curl -s localhost:3000/api/orchestrator/v1/chat -H 'Authorization: Bearer air-web-console-dev-gateway-token' \
  -H 'Content-Type: application/json' -H 'Accept: application/json' -H 'X-Target-Name: local' \
  -H 'X-Target-Channel: customer' -H 'X-Target-Customer: cust_1001' \
  -d '{"message":"Where is my order 48213?","options":{"allow_routes":["rag"]}}' \
  | jq '.responseJson | {routes, answer, gather: [.trace[] | select(.stage=="gather")]}'
```

## Expected

`routes: ["rag"]`, no `orders.get` request at the gateway, and the answer
says it can't check the order in this conversation. With `["tools"]`, no
proposal; with `["action"]` alone, no read.

## Actual

```
routes ['rag', 'tools']
gather:ok: sources=2 dropped=0; orders.get ok     (gateway log: brightcart-read orders.get 200)
answer: "Your order 48213 is currently in transit with BlueDart …"
```

## Cause

`schemas/chat.py:83` defines the field; no module in `src/` reads it
(`grep -rn allow_routes src` → only the schema).

## Suggested fix

Intersect the turn's live routes with `allow_routes` before planning: no
`tools` means the planner is offered no `read` capability; no `action` means no
`write` capability (and no proposal); no `rag` means no retrieval. Add a test
per route, and one asserting no gateway request with `["rag"]`.

## Verify

The repro shows `routes: ["rag"]` and the tools gateway logs no request.

## Resolution

**Origin (air-orchestrator-service session, 2026-11-15):** REQ-TGW-030: `allow_routes` narrows the turn before planning (no `tools` means no read offered, no `action` means no write or `/propose`, no `rag` means no retrieval); the plan's routes and steps are filtered too, so the `route` event never names an excluded route. A confirm turn's execute is not narrowed. In the working tree on top of `8ed74d7`, not committed (the user reviews and pushes); `make check` 549 passed, 3 skipped. Redeployed to the `:8081` container.

**Verified 2026-11-15 ~08:40 UTC** against `:8081` ("8ed74d7 + working tree"): `["rag"]` gives `routes: ["rag"]`, `plan: skipped`, and no gateway request. `["rag","tools"]` looks up 48213 normally. "Please cancel order 55120" with `["rag","tools"]` reads the order but makes no proposal (`round 2: no change`, no `orders.cancel` request at the gateway).

