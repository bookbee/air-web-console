# MG-007: An unauthenticated request with malformed JSON gets 422, not 401

| | |
|---|---|
| **Status** | fixed |
| **Severity** | Low |
| **Service** | air-model-gateway @ `29fc4aa` |
| **Found** | 2026-10-25, live call |
| **Console scenario** | none (manual repro) |

## Summary

A request with no `X-API-Key` and a broken JSON body gets a validation
error instead of `401`. So an anonymous caller gets the request parsed and
learns about the API's validation before being authenticated. The detail is
also confusing: it's a character offset, not a field.

## Reproduce

```bash
curl -sS -i -X POST $GW/v1/generate -H 'Content-Type: application/json' -d '{"messages": ['
```

## Expected

`401` (no key), the same as an anonymous request with a valid body.

## Actual

```
HTTP/1.1 422 Unprocessable Entity
{"type":"about:blank","title":"Unprocessable Entity","status":422,"code":"validation_error","detail":"14: JSON decode error","request_id":"..."}
```

## Cause

FastAPI parses and validates the body before running the route's
`require_principal` dependency (`src/air_model_gateway/api/deps.py:22`), so
a JSON decode error is raised first.

## Suggested fix

Check the API key in middleware, or in a router-level dependency that runs
before body parsing, on every `/v1/*` route except health and ready. Also
reword the decode-error detail (e.g. "body is not valid JSON (at character
14)"). If the team accepts the ordering, mark this `wont-fix` with that
reason.

## Verify

The repro returns `401`. With a valid key, it returns `422` with the
clearer detail.

## Resolution

Fixed in air-model-gateway `develop` on top of `29fc4aa`, **not yet committed** (the owner commits; add the commit here when it lands). `make verify` passes (324 tests); the repro was re-run live against the fixed build on 2026-10-25.

- `api/deps.py::AuthenticatedRoute` (on every `/v1` router) checks `X-API-Key` before
  FastAPI reads the body, but only for routes that depend on `require_principal`.
  Health, readiness and unknown paths are unchanged.
- A body that isn't JSON now reads `body is not valid JSON (at character N)`.
- Test: `tests/test_routes.py::test_no_key_is_401_even_when_the_body_is_not_json`.
- Live: the repro returns 401; with a valid key it returns 422 with the clearer
  detail.

**Verifier, 2026-10-25 10:24:** `make gateway-check` against the uncommitted tree passes nothing automatically (the BFF always sends a key); the manual repro returned 401, and the console scenarios now match the chosen fix. Set `verified` after the commit lands and the run is repeated against it.
