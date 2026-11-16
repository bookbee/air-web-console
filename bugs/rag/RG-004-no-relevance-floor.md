# RG-004: No relevance floor: nonsense queries return a full `top_k` at scores indistinguishable from genuine matches

| | |
|---|---|
| **Status** | fixed (working tree, uncommitted) · verified |
| **Severity** | Medium |
| **Service** | air-rag-service @ `705f871` (develop), container on `:8087`, seeded from `sit/corpus` (29 chunks), embeddings `local-768-v1` |
| **Found** | 2026-11-15, live calls straight to the service (SIT 2026-11-15) |
| **Console scenario** | none yet (proposed `gap-nonsense-query`) |

## Summary

RG-003 covers a *blank* query. The same weakness applies to any query with
no relevant content: the service always returns `top_k` citations, and their
scores sit in the same band as a real match. A caller (the orchestrator's
`GATHER`) has no way to tell "nothing relevant" from "this is the answer",
so a grounded answer can cite an unrelated document.

| Query | Top citations (score) |
|---|---|
| "How long do I have to return an item?" (genuine, `\u0000` in it) | returns-refunds#0 **0.549**, exchanges#0 0.503, cancellations#0 0.495 |
| `"a" × 2000` | tumbler-chai-cafe#0 **0.476**, basmati-rice-royal#0 0.460, international-shipping#0 0.457 |
| `📦↩️?` | tumbler-chai-cafe#0 **0.533**, international-shipping#0 0.465 |
| `' OR 1=1 --` | loyalty-program#0 **0.450**, express-delivery#0 0.428 |
| Hindi: "how many days to return goods?" | express-delivery#0 **0.512**, international-shipping#0 0.504 (returns-refunds not in top 5) |

The emoji query's top score (0.533) is within 0.02 of the genuine question's.
The Hindi row is a second, related gap: a supported customer language
retrieves shipping documents instead of the returns policy.

## Reproduce

```bash
for q in "How long do I have to return an item?" "📦↩️?" "' OR 1=1 --"; do
  jq -n --arg q "$q" '{query:$q}' | curl -s localhost:8087/v1/retrieve -H 'X-API-Key: airr_local_dev_key' \
    -H 'Content-Type: application/json' -d @- | jq -c '[.citations[] | [.source_id, .score]]'
done
```

## Expected

Either (or both):

1. A configurable `min_score` (server default plus an optional request field
   that can only *raise* it), below which a chunk is not returned; an empty
   `citations` list is the honest answer to a query with no relevant content.
2. A calibrated relevance signal alongside the raw cosine, for example a
   per-response `max_score` and a documented threshold, or rescoring with a
   cross-encoder, so callers can decide.

For the Hindi row: document that retrieval is English-only for
`local-768-v1`, or embed queries through a multilingual model.

## Actual

Always five citations, top scores 0.45–0.55 regardless of relevance.

## Cause

`nomic-embed-text` cosine similarities are compressed into a narrow band on
this corpus, and retrieval returns the k nearest with no floor
(`grep -rn 'min_score\|threshold' src` finds nothing).

## Verify

The nonsense queries above return `citations: []` (or scores flagged below
the threshold), and the genuine question still returns returns-refunds#0
first.

## Resolution

_Filled in by the origin._

## Resolution

Fixed 2026-11-16 in the air-rag-service working tree. `config.py` `retrieval.min_score` (default 0.5, `AIR_RAG_SERVICE__RETRIEVAL__MIN_SCORE`, 0 turns it off), applied in `api/v1/retrieval.py`. Calibrated on the SIT corpus for `local-768-v1`: the weakest correct top hit is 0.545; "aaaa", SQL, "hi", "capital of France" and "Where is order 48213?" now return nothing. Still returned: three emoji (one hit, 0.52), "What are my recent orders?" (five hits, 0.50–0.54), a crypto question (one, 0.54). The Hindi refund query still misses the returns policy (one unrelated hit, 0.52): a multilingual embedding model is the real fix, and the floor is a threshold on one model's cosine, so recalibrate it when the model changes. Unit tests added
in `tests/unit/test_retrieval_route.py`; `docs/openapi.json` regenerated;
ruff, mypy and all tests pass.

Verified 2026-11-16 on the rebuilt container: `make rag-check` 56/56, and
this report's rows moved out of *known gaps* in `src/components/rag/data.ts`.
