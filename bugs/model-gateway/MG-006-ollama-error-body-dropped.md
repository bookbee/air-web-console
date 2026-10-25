# MG-006: The Ollama adapter drops Ollama's error message

| | |
|---|---|
| **Status** | fixed |
| **Severity** | Low |
| **Service** | air-model-gateway @ `29fc4aa` |
| **Found** | 2026-10-25, live call and gateway log |
| **Console scenario** | none (visible in the [MG-005](MG-005-client-errors-as-retryable-502.md) repros) |

## Summary

When Ollama answers with a 4xx or 5xx, its JSON body says why (e.g.
`{"error": "model 'no-such-model' not found"}`). The adapter throws that
away and reports only httpx's generic message, so QA and on-call see
"404 Not Found" or "400 Bad Request" with nothing to act on.

## Reproduce

Run the pin repro from MG-005 and read the `detail`.

## Expected

The detail includes the provider's own reason, trimmed to a sensible
length.

## Actual

```
all providers failed: ollama: Client error '404 Not Found' for url 'http://localhost:11434/api/chat'
For more information check: https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/404
```

## Cause

`src/air_model_gateway/gateway/providers/ollama_provider.py:111-114` builds
the `ProviderError` from `str(exc)`, which is httpx's message and doesn't
include `exc.response.text`. The streaming path (`:38`) has the same
problem.

## Suggested fix

In the `HTTPStatusError` branch, read `exc.response.json().get("error")`,
falling back to `exc.response.text[:500]`, and put it in the detail. Drop
the MDN link. Check the other adapters for the same pattern
(`_common.py` may be the place to share it).

## Verify

The MG-005 pin repro's detail reads like
`ollama: 404 model 'no-such-model' not found`.

## Resolution

Fixed in air-model-gateway `develop` on top of `29fc4aa`, **not yet committed** (the owner commits; add the commit here when it lands). `make verify` passes (324 tests); the repro was re-run live against the fixed build on 2026-10-25.

- `_common.http_error_detail` puts the backend's own reason into the detail:
  Ollama's `error` field, or up to 500 characters of the body, with no MDN link. Ollama
  uses it on both the plain and the streamed path.
- The cloud adapters already include the provider's message (their SDK errors carry
  it). They now build errors through the shared `provider_error`.
- Tests: `tests/test_ollama_provider.py::test_an_error_keeps_ollamas_own_reason_and_status`
  (plain and stream), `::test_an_error_body_that_is_not_json_is_trimmed_into_the_detail`.
- Live: the detail reads `ollama: 404 model 'no-such-model' not found`.

**Verifier, 2026-10-25 10:24:** `make gateway-check` against the uncommitted tree passes `gap-pin-unknown-model`, which checks that Ollama's reason is in the detail, and the console scenarios now match the chosen fix. Set `verified` after the commit lands and the run is repeated against it.
