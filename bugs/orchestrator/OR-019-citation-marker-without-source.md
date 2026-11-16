# OR-019: An answer cites `[1]` when the turn carried no sources

| | |
|---|---|
| **Status** | fixed (working tree, uncommitted) · verified · residual: the unsourced claim itself (OR-016a) |
| **Severity** | Medium |
| **Service** | air-orchestrator-service @ `c92c2ae` |
| **Found** | 2026-11-16, through the console BFF |
| **Console scenario** | none |

## Summary

With retrieval excluded (`options.allow_routes: ["tools"]`) the answer to
"What is the return policy?" was a policy written from nothing, with a
citation marker: "You can return any item within 30 days of purchase, as long
as it's still in its original condition and packaging [1]." `citations` was
empty and `GATHER` was `skipped`. The policy is 30 days from *delivery*. The
customer sees a citation that leads nowhere, on a figure no source gave.

## Reproduce

```json
{"message": "What is the return policy?", "options": {"allow_routes": ["tools"]}}
```

## Cause

`engine/turn.py` `_citations` ignores a marker past the last source when it
builds `citations`, but the marker stays in the text.

## Resolution

Fixed 2026-11-16 in the working tree: on the customer channel the output
step removes any `[n]` that names no source this turn carried
(`_without_dangling_markers`), before citations are built and the answer is
stored. Streamed deltas may already have shown it; the `answer` event is
authoritative. Tests: `test_a_marker_that_names_no_source_is_removed_from_the_answer`,
`test_a_marker_is_removed_when_the_turn_had_no_sources`.

Verified on the rebuilt container: the repro now asks which item the customer
means, with no marker.

**Residual (open, with OR-016a):** removing the marker does not stop the model
stating a policy with no source. Seen in this pass: "What is your policy on
cryptocurrency payments?" → "We don't accept cryptocurrency payments at the
moment." (one unrelated source in the prompt, no citation). That needs the
grounding check `REQ-RAG-014` describes; `answer.grounded` is still hard-coded
`false` (`engine/turn.py`, the `AnswerEvent`), even on fully cited answers.
