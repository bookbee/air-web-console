# MG-003: 404 and 405 bodies aren't problem+json (no `code`, no `request_id`)

| | |
|---|---|
| **Status** | verified |
| **Severity** | Medium |
| **Service** | air-model-gateway @ `29fc4aa` |
| **Found** | 2026-10-25, live call |
| **Console scenario** | `404-problem`, `405-problem` (contract edges; was `gap-404-problem`, `gap-405-problem`) |

## Summary

The contract says every error body is `application/problem+json` with a
stable `code` and a `request_id`. Routing errors break that. An unknown path
(including the removed `/v1/inference`, which every migrating consumer will
hit) and a wrong method return FastAPI's default `{"detail": ...}` as
`application/json`. A client that branches on `code` gets nothing, and the
error can't be matched to a log line.

## Reproduce

```bash
curl -sS -i -X POST $GW/v1/inference -H "X-API-Key: $KEY" -d '{}'
curl -sS -i        $GW/v1/generate  -H "X-API-Key: $KEY"        # GET on a POST route
```

## Expected

`application/problem+json` with `type`, `title`, `status`, a stable `code`
(e.g. `not_found` and `method_not_allowed`) and `request_id`, the same shape
as every other error.

## Actual

```
HTTP/1.1 404 Not Found
content-type: application/json
{"detail":"Not Found"}

HTTP/1.1 405 Method Not Allowed
content-type: application/json
{"detail":"Method Not Allowed"}
```

## Cause

`src/air_model_gateway/api/errors.py:93-107` registers handlers for
`AppError`, `RequestValidationError` and `Exception`. Starlette's
`HTTPException` (raised by the router for 404 and 405) has none, so FastAPI's
default handler answers.

## Suggested fix

Register a `starlette.exceptions.HTTPException` handler that builds the body
with `problem_response` (`errors.py:58`). Map the status to a code (404 →
`not_found`, 405 → `method_not_allowed`, anything else → a generic code), and
keep the `Allow` header on 405. Add both codes to the error table in the
OpenAPI description and the integration guide.

## Verify

- Both repros return `application/problem+json` with `code` and
  `request_id`.
- The console scenario `gap-404-problem` passes.
- Add a gateway test for an unknown path and a wrong method.

## Resolution

Fixed in air-model-gateway `develop` on top of `29fc4aa`, **not yet committed** (the owner commits; add the commit here when it lands). `make verify` passes (324 tests); the repro was re-run live against the fixed build on 2026-10-25.

- `api/errors.py` handles Starlette's `HTTPException`: 404 is `not_found`, 405 is
  `method_not_allowed` (the `Allow` header is kept), anything else `http_error`, all
  `application/problem+json` with `request_id`.
- Documented in the OpenAPI description, the integration guide's error table and the
  LLD.
- Tests: `tests/test_routes.py::test_routing_errors_are_problem_documents`.
- Live: both repros return problem+json with `code` and `request_id`.

**Verifier, 2026-10-25 10:24:** `make gateway-check` against the uncommitted tree passes `gap-404-problem` and the new `gap-405-problem`, and the console scenarios now match the chosen fix. Set `verified` after the commit lands and the run is repeated against it.

**Verifier, 2026-10-25 12:13: verified** against air-model-gateway `6357b7a` ("Unit test and fixes."). `/v1/health` reports revision `6357b7a992e6-dirty`; the uncommitted files are docs, tests and `.env.example`, none under `src/`. Exactly one listener on `127.0.0.1:8083`, started 12:05, after the commit. Console `make gateway-check`: contract 42/42 passed, including `404-problem`, `405-problem`. Each one has moved out of *known gaps* into *contract edges*, where it now guards against a regression. See [last-run-local.txt](last-run-local.txt).
