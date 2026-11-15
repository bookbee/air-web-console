# OR-016: The assistant states refund times it wasn't given ("5 to 10 working days"), and tells a customer an already-cancelled order "can't be changed, e.g. once shipped"

| | |
|---|---|
| **Status** | b closed (verified) · a deferred until RAG serves the refund-policy sources · c open, no fix scheduled |
| **Severity** | Medium |
| **Service** | air-orchestrator-service @ `8ed74d7` + working tree, `planner:v2`, `customer_care:v4`, REQ-PLN-017; synthesis on Gemini (Anthropic out of credit) |
| **Found** | 2026-11-15 ~14:03 and ~14:22 UTC, live calls through the console (split out of OR-015 at the orchestrator session's request) |
| **Console scenario** | none |

## a. Policy figures with no source

"Cancel order 55120, and also how long does a refund take to reach my card?"
on a turn where RAG returned nothing (`gather:ok:no relevant sources`):

> … once it's processed, it usually takes **5 to 10 working days** to reach your card.

The deployment's refund window is 3 business days (the proposal summary
says so, from the gateway). There was no RAG citation and no tool result
with a figure. This is the standing "do not describe typical rules" rule
failing on Gemini. Per the orchestrator session, it also offered to "try to
cancel again in a little while" on a refund turn. A customer told 5–10 days
will chase on day 4, or wait past a real problem.

## b. An already-cancelled order gets a vague "not possible"

With 55120 already cancelled, "Cancel order 55120. Also, where is my other
order 48213 right now?" (three times, `plan:ok:reads=1 propose=yes`) and the
refund variant both answer:

> That change isn't possible in the order's current state, for example once
> it has shipped. If you need more help, you can ask to speak to a person.

The gateway's `not_cancellable` carries the status (`cancelled`). The answer
should say "Order 55120 is already cancelled", not hint at shipping and
send the customer to a person. The rest of the message (48213's location, or
the refund question) is also dropped, though no proposal is pending (the
REQ-TGW-032 deferral applies only to a proposal).

## Expected

- a: a figure (days, amounts, windows) only from a citation, a tool result or
  the proposal; otherwise "I don't have that detail".
- b: a refused proposal answers from its reason: "already cancelled" for
  `cancelled`, "it has shipped" for `in_transit`. The rest of the message is
  answered, since nothing is waiting for a confirmation.

## Suggested fix

- a: a guardrail or eval check that a number with a time unit in the answer
  appears in the turn's sources; a Gemini eval row with no RAG.
- b: map the `not_cancellable` status into the fixed text, and continue to
  synthesis for the rest of the message when no proposal is made.

## Reproduce

cust_1001 through the console BFF. For a: RAG unseeded or not relevant. For b:
cancel 55120 first, then send the messages above.
Results: `scratchpad/results/verify_or014.txt`, `scratchpad/results/verify_or015.txt`.

## c. The invented cancellation date is back, in a fresh session

On `customer_care:v5`, a new session (cust_1002, 70011 cancelled earlier in a
different session), "Cancel order 70011 please, and what's in it?", planned
`reads=1 propose=no needs_results=yes` and answered:

> Order 70011 was cancelled **on November 13, 2026**. So you're all set there.

2026-11-13 is `placed_at` again (OR-014b). v4's rule ("a date only when the
conversation states it for that event") held in the session that did the
cancel, but not where the status came only from `orders.get`. The other run of
the same message refused the proposal and said "It has already been
cancelled" with no date, which is right. So this is the same unsourced-fact
family as a, and the same deterministic check would catch both: a date in the
answer must appear in the turn's sources *for that event*.

## Resolution

**Origin (2026-11-15):** b is fixed by REQ-TGW-033. When a planned change is
refused, fails or is dropped, the plan's reads still run and the rest of the
message is synthesised after the fixed refusal text. The text no longer says
"for example once it has shipped". Saying "already cancelled" needs a
closed-set `state` on the gateway's `invalid_state` problem, which has been
proposed to air-tools-gateway as a contract change. a is not fixed: v5 forbids
unsourced figures and removes the v2–v4 citation example ("5 to 10 working
days [2]", the likely source of Gemini's figure), but Gemini still invents
it. A deterministic output check is with the user.

**Verified 2026-11-15 ~14:35 UTC** (`customer_care:v5`, 2 rounds × 4 messages,
55120 and 70011 cancelled):
- b: every refusal is "That change isn't possible in the order's current
  state …" with no "shipped", followed by the rest of the message (48213's
  delivery date, 70011's items). Status ok, no proposal, nothing executed.
- a: still open. "how long does a refund take to reach my card?" →
  "usually takes 5 to 10 business days" in both rounds. The same turn also
  says "I couldn't cancel that order this time" after the refusal: "this
  time" invites a retry of something that can't happen.
- c: new, above.
Results: `scratchpad/results/verify_or016.txt`.

**Decision (the user, relayed by the orchestrator session, 2026-11-15):** no
output guardrail for now. **a** waits for air-rag-service to serve the real
refund-policy sources: re-check it once RAG is fixed and seeded. **b** is
closed as verified. **c** stays open with no fix scheduled, because real
sources don't address it. The "this time" wording after a refusal is noted
for the next prompt version.
