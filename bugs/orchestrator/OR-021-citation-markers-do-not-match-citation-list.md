# OR-021: A client can't match the answer's `[n]` markers to the `citations` list

| | |
|---|---|
| **Status** | open |
| **Severity** | Medium |
| **Service** | air-orchestrator-service @ `31838b0` |
| **Found** | 2026-11-16, live call through the console's BFF |
| **Console scenario** | none |

## Summary

An answer marks its sources as `[1]`, `[2]`… using the number each passage had **in
the prompt**. The response's `citations` array lists only the passages that were
cited, in order of first use, and a citation carries no number. When the model cites
passage 2 and not passage 1, the answer says `[2]` and `citations` has one entry. A
client that renders footnotes has nothing to tie `[2]` to: by position it would look
for a second citation that isn't there.

## Reproduce

Needs the integrated local stack (planner on, RAG and tools enabled) and a customer
token, so it is easiest from the console: Orchestrator tab, Customer `cust_1001`,
message:

```
What is the status of order 48213, and how long do refunds take?
```

## Expected

`REQ-RAG-009` (spec 0011) promises "one `citation` for each passage the final answer
cites by a valid `[n]`". For that to be usable, each marker in the answer must
identify one entry in `citations`: either the markers are renumbered to match the
list, or each citation says which marker it answers.

## Actual

```json
"answer": "Order 48213 is currently in transit. …\n\nRefunds typically take 5 to 7 business days to process once the returned item passes inspection [2].\n\n…",
"citations": [
  {"source_id": "returns-refunds#0", "title": "Returns and refunds",
   "uri": "https://help.brightcart.example/returns", "snippet": "Most items bought from Brightcart can be returned within 30 days…"}
]
```

One citation, and the only marker in the text is `[2]`. In the same pass, a turn that
cited the first passage came back with `[1]` and one citation, so the mismatch
depends on which passage the model happens to use.

## Cause

`src/air_orchestrator_service/engine/turn.py:1766` `_citations`: for each marker it
takes `self._sources[index - 1]` and appends a `Citation` with `source_id`, `title`,
`uri` and `snippet`. The marker's number is dropped, and the answer text is left as
the model wrote it. `schemas/chat.py:150` `Citation` has no field for it.

## Suggested fix

Either, and the spec should say which:

1. **Renumber on the way out.** After choosing the cited passages, rewrite the
   answer's markers to `[1]…[k]` in order of first citation, so position in
   `citations` is the number. No schema change. The streamed `answer.delta` events
   are provisional and the final `answer` event already replaces them, so the
   renumbered text has a place to go.
2. **Add the number to the citation** (`marker: 2`). An additive schema change;
   clients match on it.

## Verify

The repro's answer and `citations` agree: every `[n]` in `answer` names exactly one
citation. Add a unit test with two sources where only the second is cited.

## Resolution

_Filled in by the origin: commit or PR, date, notes. Then by the verifier:
date, build, result._
