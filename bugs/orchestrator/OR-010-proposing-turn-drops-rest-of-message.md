# OR-010: A turn that proposes a change answers only the proposal; the rest of the customer's message is silently dropped

| | |
|---|---|
| **Status** | open (design-level: the owner decides) |
| **Severity** | Medium |
| **Service** | air-orchestrator-service @ `8ed74d7` (+ uncommitted spec 0013 work), planner on |
| **Found** | 2026-11-15, live calls through the console |
| **Console scenario** | none |

## Summary

By design (spec 0012 §7, `engine/turn.py:215`), a proposing turn's answer is
fixed text: the gateway's summary plus "Nothing has been changed yet… please
confirm." No model is called, which keeps injected text out of a proposal.
The side effect: anything else the customer asked in the same message is
neither answered nor acknowledged.

| Message | What the customer got |
|---|---|
| "Cancel order 55120, and also how long does a refund take to reach my card?" | only the 55120 proposal (the summary happens to mention 3 days) |
| "Cancel order 55120. Also, where is my other order 48213 right now?" | only the proposal. The plan had `reads=1`, but no `orders.get` was sent and nothing says so |
| "Cancel both my orders 55120 and 48213" | a proposal for 55120 only. Both were looked up, and 48213 (in transit, not cancellable) isn't mentioned |

The last row is the risky one: the customer may believe both cancellations
are pending.

## Reproduce

Any of the messages above, as `cust_1001`, through `/v1/chat`.

## Expected

The answer is honest about scope, at minimum. Options for the owner:

1. Keep the fixed text but append a fixed line whenever the plan held more
   than the proposal: "I've only prepared this one change. Ask me again about
   anything else." For a multi-order request, list which orders weren't
   included.
2. Synthesise the non-proposal part normally (with the read results) and
   append the fixed proposal block after it, so the model never writes the
   proposal itself.
3. Let the planner refuse to combine: a message holding a change plus
   anything else gets the reads answered and the change proposed on the next
   turn.

## Actual

The fixed proposal text only; `GATHER` detail `orders.cancel proposed`; the
planned read for 48213 is never sent and isn't reported as dropped.

## Cause

`engine/turn.py:688` ("A proposing turn's answer is fixed text, so it needs no
model") and `:1827` (`outcome.text = self._proposal_answer`). The planned reads
on a proposing plan are discarded without a `GATHER` note.

## Verify

The three messages above each tell the customer what wasn't handled.

## Resolution

_Filled in by the origin._
