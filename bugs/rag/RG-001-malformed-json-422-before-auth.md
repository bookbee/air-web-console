# RG-001: Malformed JSON is a 422 naming field "9", and is answered before the key is checked

| | |
|---|---|
| **Status** | open |
| **Severity** | Low |
| **Service** | air-rag-service @ `f5f2882`, container `air-rag-service:local` on `:8087` |
| **Found** | 2026-11-14, live call (RAG tab SIT) |
| **Console scenario** | `gap-malformed-400`, `gap-malformed-before-auth` (RAG tab, *known gaps*; headless, `make rag-check`) |

## Summary

A body that isn't JSON gets `422 validation-error` with `errors[0].field: "9"`
(the byte offset of the parse error, presented as a field name). The service
defines `MalformedRequestError` (`400 malformed-request`) in
`api/errors.py` but nothing raises it. The body is also parsed before the
key is checked, so a caller with no key gets the 422 instead of a 401. That
lets an anonymous caller probe the request schema, the same class as MG-007
and CL-006b, both fixed.

## Reproduce

```bash
curl -s -X POST $RAG/v1/retrieve -H "X-API-Key: $KEY" -H 'Content-Type: application/json' -d '{"query":'
curl -s -X POST $RAG/v1/retrieve -H 'Content-Type: application/json' -d '{"query":'     # no key
```

## Expected

`400 malformed-request` (the slug the service's own error catalogue
defines), and `401 missing-api-key` when there's no valid key, since
authentication comes before reading the body.

## Actual

Both calls:

```json
{"type":"https://air.dev/problems/air-rag-service/validation-error","title":"Request validation failed","status":422,
 "detail":"9: JSON decode error","instance":"/v1/retrieve","errors":[{"field":"9","code":"json_invalid", …}]}
```

## Cause

FastAPI parses the JSON body while it resolves the route's parameters, before
the `require_scope` dependency runs, and reports a decode failure as a
`RequestValidationError` (`loc: ["body", 9]`). `_validation_error_handler`
maps every one of those to 422.

## Suggested fix

In `_validation_error_handler`, map an error with `type == "json_invalid"` to
`MalformedRequestError` (400, no `errors[]` field named after an offset). To
authenticate first, either take the body as `Request` and validate it after
`require_scope`, or check the key in middleware ahead of routing, as
air-classifier-service did for CL-006b.

## Verify

Both known-gap rows pass in `make rag-check`. Then move them out of *known
gaps*, and change the `malformed-json` row to expect 400 only.

## Resolution

_Filled in by the origin._
