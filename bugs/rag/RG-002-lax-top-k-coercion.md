# RG-002: `top_k` accepts `true`, `"5"` and `5.0`, though the contract types it integer

| | |
|---|---|
| **Status** | open |
| **Severity** | Low |
| **Service** | air-rag-service @ `f5f2882`, container `air-rag-service:local` on `:8087` |
| **Found** | 2026-11-14, live call (RAG tab SIT) |
| **Console scenario** | `gap-top-k-bool`, `gap-top-k-string` (RAG tab, *known gaps*) |

## Summary

`RetrievalRequest.top_k` is `int` in Pydantic's default lax mode, so
`true` becomes `top_k: 1`, `"5"` becomes 5 and `5.0` becomes 5, all with 200.
The body is otherwise strict (`extra="forbid"`), and OpenAPI says
`integer`, so a caller's type bug (a boolean from a checkbox, a string
from a form) silently changes how many citations come back instead of
failing.

## Reproduce

```bash
for v in true '"5"' 5.0; do
  curl -s -o /dev/null -w "$v %{http_code}\n" -X POST $RAG/v1/retrieve -H "X-API-Key: $KEY" \
    -H 'Content-Type: application/json' -d "{\"query\":\"returns\",\"top_k\":$v}"
done
```

## Expected

422 `validation-error` naming `top_k` for a boolean or a string. (`5.0` is
debatable; refusing it too keeps the wire type exact.)

## Actual

`true 200`, `"5" 200`, `5.0 200`.

## Suggested fix

`top_k: StrictInt = Field(default=5, ge=1, le=50)`, or
`ConfigDict(extra="forbid", strict=True)` on the model (then `query` and
`user_id` are strict too, which is also what the contract says).

## Verify

Both known-gap rows pass; then move them out of *known gaps*.

## Resolution

_Filled in by the origin._
