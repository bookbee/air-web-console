# RG-003: A whitespace-only query is embedded and answered; `user_id` has no length cap

| | |
|---|---|
| **Status** | open |
| **Severity** | Medium |
| **Service** | air-rag-service @ `f5f2882`, container `air-rag-service:local` on `:8087` |
| **Found** | 2026-11-14, live call (RAG tab SIT) |
| **Console scenario** | `gap-blank-query`, `gap-user-id-bounded` (RAG tab, *known gaps*) |

## Summary

Two input bounds are missing from `RetrievalRequest`:

1. **`query: "    "` passes `min_length=1`.** It is sent to air-model-gateway
   to embed (a real call, counted against the service's gateway budget) and
   answered with whatever is nearest to blank. On the seeded SIT index that's
   `tumbler-chai-cafe` at 0.555 and `international-shipping` at 0.543, the
   same range as genuine top hits (SIT case 29's correct answer scores
   0.545), so a caller such as the orchestrator's gather step can't tell
   noise from a match and would ground an answer on it.
   A NUL character (`"a\u0000b"`) is accepted as well.
2. **`user_id` has no `max_length`.** A 100,000-character `user_id` is
   accepted with 200. It isn't used for retrieval yet ("accepted now so the
   wire contract doesn't change"), but it reaches logging and whatever
   scoping lands later, and capping it then is a contract change.

## Reproduce

```bash
curl -s -w ' %{http_code}\n' -X POST $RAG/v1/retrieve -H "X-API-Key: $KEY" -H 'Content-Type: application/json' -d '{"query":"    "}'
python3 -c 'import json;print(json.dumps({"query":"returns","user_id":"u"*100000}))' \
  | curl -s -o /dev/null -w '%{http_code}\n' -X POST $RAG/v1/retrieve -H "X-API-Key: $KEY" -H 'Content-Type: application/json' -d @-
```

## Expected

422 `validation-error` naming `query` for a blank query, and naming
`user_id` past a stated cap (for example 256, like the request-id cap of 128).

## Actual

Seeded index (`top_k: 2`): `[tumbler-chai-cafe#0 0.555, international-shipping#0 0.543]`, 200.
Unseeded: `{"query":"    ","citations":[]}`, 200. The long `user_id`: 200.

## Suggested fix

A `field_validator("query")` that rejects `not value.strip()` (and control
characters), and `user_id: str | None = Field(default=None, max_length=256)`.
Regenerate `docs/openapi.json`.

## Verify

Both known-gap rows pass; then move them out of *known gaps*.

## Resolution

_Filled in by the origin._
