# OR-018: A turn with an order lookup never searches the knowledge base, so "my orders, and how do refunds work?" loses its policy half

| | |
|---|---|
| **Status** | fixed (working tree, uncommitted; `REQ-PLN-015` revised by the product owner) · verified |
| **Severity** | Medium |
| **Service** | air-orchestrator-service @ `c92c2ae`, planner on, RAG seeded (29 chunks) |
| **Found** | 2026-11-16, end to end through the console BFF (first noted 2026-11-15, SIT §2a) |
| **Console scenario** | none |

## Summary

`REQ-PLN-015` (2026-11-15) stopped a plan with lookups from retrieving. A
message that needs both got only the lookup, and the policy half was answered
"the exact terms are in your order confirmation or on our help pages". The
same happened to a follow-up such as "Can I return it once it arrives?" when
the planner chose to re-read the order.

## Reproduce

Customer `cust_1001`, through the console or directly with a customer token:

```
What are my recent orders, and how long do refunds take?
```

## Actual (before)

```
routes ["tools"]   gather: orders.list_recent ok
"… Regarding refunds, the exact terms are in your order confirmation or on our help pages.
 A member of our team can confirm the details for you."
```

## Resolution

Decision 2026-11-16 (product owner, in this SIT): retrieve too. Fixed in the
working tree:

- `engine/plan.py`: a model plan with reads retrieves; a plan with a proposal
  still does not (its turn is fixed text).
- `engine/turn.py`: beside lookups the knowledge base is *supplementary*. If
  it fails or the deadline is too close, the turn is not `degraded`, the
  prompt is not told it was unavailable, and `GATHER`'s detail ends
  `knowledge base not consulted: <reason>`. This keeps what `REQ-PLN-015`
  was written for (a RAG outage must not degrade an order answer).
- `docs/specs/0013-planner/spec.md`: `REQ-PLN-015` and §9 Q3 rewritten;
  tests `test_a_plan_with_lookups_also_retrieves`,
  `test_a_knowledge_base_failure_does_not_degrade_a_turn_with_lookups`.
  `make trace`: links intact.

Verified 2026-11-16 on the rebuilt container:

```
routes ["rag","tools"]   gather: sources=4 dropped=0; orders.list_recent ok
"Your recent orders are: … Refunds typically go back to the original payment method within
 5 to 7 business days once the returned item passes inspection [1]."   citation: Returns and refunds
```

A plain order question now reads `gather: no relevant sources; orders.get ok`
and costs one embedding call more (retrieval runs beside the lookup, so no
added latency).
