# OR-015: When the planner times out, the answer asks the customer to confirm a change that was never proposed, or says a lookup is running

| | |
|---|---|
| **Status** | fixed (REQ-PLN-017, working tree) · verified by origin (forced timeout); policy figure split to OR-016 |
| **Severity** | High |
| **Service** | air-orchestrator-service @ `8ed74d7` + working tree, `planner:v2`, `customer_care:v4`; air-model-gateway @ `6e78609` (Gemini answering the planner) |
| **Found** | 2026-11-15 ~14:03 UTC, live calls through the console (first run of the OR-014 verify, right after the gateway restart) |
| **Console scenario** | none |

## Summary

The planner has a 4.5 s budget. Right after the gateway restart, its Gemini
calls took 5.5–9.3 s (gateway log: `gemini-2.5-flash … ms=8515`, `9303`,
`8709`, `6934`, `5557`), so 8 of 10 turns ran with `plan:degraded:planner
call timed out after 4.50s`. Such a turn has no tool results and no proposal,
but `customer_care:v4` still writes the answer as if it had them:

| Message | Answer, with no proposal and no read |
|---|---|
| "Cancel order 55120. Also, where is my other order 48213 right now?" (twice) | "I can help with cancelling order 55120 and checking on order 48213. **Could you please confirm that you wish to cancel order 55120?**" |
| "Cancel order 55120, and also how long does a refund take to reach my card?" | "**Please confirm that you would like to cancel order 55120.** … it usually takes **5 to 10 working days**" (the policy is 3 business days; RAG returned nothing) |
| "What's the status of order 70011?" (another customer's) | "**The system is checking on order 70011 for you now.**" |
| "I want a refund for order 48213, what do I do?" (second run, planner timed out again) | "**To start your refund** for order 48213, could you tell me why you'd like to return it?" |

A customer who answers "yes" sends a plain message (no `confirm` object
exists to send), so nothing is cancelled and nothing says so. That is the
OR-009 failure in reverse: the customer believes a change is under way when
none was prepared. The turn is marked `degraded: ["air-model-gateway"]`, but
the customer doesn't see that.

With the planner in time (second run), the same messages are all correct:
see OR-014.

## Expected

A turn whose plan failed never asks for a confirmation, never says a lookup
or change is happening, and never states a policy figure it wasn't given.
For example: "I couldn't look that up just now. Please try again in a moment;
nothing on your order has changed." Or the fixed degraded text the turn
already uses when synthesis fails.

## Suggested fix

1. When `plan` is degraded on a customer turn that the classifier flags as an
   action intent (`cancellation`, `refund_request`, …) or that names an order,
   answer with fixed text instead of synthesising. Or tell synthesis "no
   lookups or changes ran this turn; don't ask for confirmation and don't say
   anything is being checked".
2. Revisit the 4.5 s planner budget against Gemini's observed latency (5–9 s
   cold, about 1 s warm), or retry the planner once inside the turn deadline.
3. Eval: a planner-timeout fixture with "Cancel order N"; the answer must not
   contain "confirm" or "checking".

## Reproduce

`scratchpad/verify_or014.py` straight after a gateway restart, or force the
planner to time out (for example with a 0.1 s planner budget) and send "Cancel
order 55120. Also, where is my other order 48213 right now?" as cust_1001.
Results: `scratchpad/results/verify_or014.txt`.

## Resolution

**Origin (2026-11-15):** REQ-PLN-017. When the round-1 plan fails or times out
on a turn offered tools, the answer prompt carries the "lookups could not be
made" and "change could not be prepared, nothing changed" notices (the same
pattern as a round-2 failure and REQ-TGW-031). The user kept the 0.3 planner
budget share. Live check with the planner forced to time out (share 0.01):
both cancel messages answered "I couldn't cancel order 55120 … Nothing has
been changed", with no confirm request and no "checking" claim. Deployed to
`:8081`. Working tree, not committed.

**Console re-check 2026-11-15 ~14:22 UTC:** 12 turns of the four messages
after the redeploy; the planner answered in time on all of them, so the
degraded path wasn't reached naturally. No answer asked for a confirmation
without a proposal or claimed a lookup was running. The invented refund figure
(a different cause) is [OR-016](OR-016-unsourced-policy-figures.md).
