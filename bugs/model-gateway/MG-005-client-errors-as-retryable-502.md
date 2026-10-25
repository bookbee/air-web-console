# MG-005: Non-retryable provider 4xx errors come back as retryable `502 provider_unavailable`; inputs are uncapped

| | |
|---|---|
| **Status** | verified |
| **Severity** | Medium |
| **Service** | air-model-gateway @ `29fc4aa` |
| **Found** | 2026-10-25, live calls |
| **Console scenario** | `pin-unknown-model`, `embed-too-many`, `too-many-messages` (rejections; was `gap-pin-unknown-model`, `gap-embed-too-many`, `gap-too-many-messages`) |

## Summary

When every rung fails, the gateway answers `502 provider_unavailable`, and
the docs tell clients to retry a 502. That's also the answer when every rung
failed because the **request** was bad: the provider returned 400 or 404,
which will fail the same way every time. Clients following the docs will
retry a request that can never succeed. Separately, `/v1/embed` `input` and
`/v1/generate` `messages` have no maximum. One oversized request ties up a
provider for a long time before it fails.

## Reproduce

Pin a model that doesn't exist:

```bash
curl -sS -i $GW/v1/generate -H "X-API-Key: $KEY" -H 'Content-Type: application/json' \
  -d '{"pin": "ollama:no-such-model", "messages": [{"role": "user", "content": "hi"}], "max_tokens": 5}'
```

Embed 3,000 inputs:

```bash
python3 -c 'import json; print(json.dumps({"model": "local-768-v1", "input": ["text %d" % i for i in range(3000)]}))' \
  | curl -sS -i $GW/v1/embed -H "X-API-Key: $KEY" -H 'Content-Type: application/json' -d @-
```

## Expected

- A request that fails on every rung for a non-retryable client reason is a
  4xx (e.g. `422 invalid_request`), not a 502 the docs say to retry.
- Size limits are enforced up front with a 422.

## Actual

- **Pin:** `502 provider_unavailable`, with detail
  `all providers failed: ollama: Client error '404 Not Found' for url 'http://localhost:11434/api/chat' ...`.
- **3,000 inputs:** `502 provider_unavailable` after about 18 s, because
  Ollama returned `400 Bad Request`.

## Cause

`src/air_model_gateway/api/errors.py:55` maps every all-rungs-failed outcome
to 502 whatever the rungs' own failures were. The adapters already mark
each `ProviderError` with `retryable`, but that isn't used when choosing the
final status. `schemas/embed.py:31` (`input`) and `schemas/generate.py:79`
(`messages`) set `min_length=1` and no `max_length`.

## Suggested fix

- When every rung failed with a non-retryable, non-auth 4xx from the
  provider, return `422` with a new code (e.g. `provider_rejected`) and the
  provider's message. Keep 502 for anything transient.
- A pin to a model the provider doesn't know should be a 422 naming the
  model.
- Add `max_length` to `input` and `messages`, and a per-text or total
  character cap, sized to what the chains can serve. Document the limits in
  the OpenAPI.

## Verify

- The pin repro returns a 4xx naming the model.
- The embed repro returns a 422 immediately.
- Add gateway tests for both. Once the behaviour is defined, add console
  scenarios under *rejections*.

## Resolution

Fixed in air-model-gateway `develop` on top of `29fc4aa`, **not yet committed** (the owner commits; add the commit here when it lands). `make verify` passes (324 tests); the repro was re-run live against the fixed build on 2026-10-25.

- Provider errors now carry the provider's HTTP status. When every rung refused the
  request as invalid (400, 413 or 422), the answer is `422 provider_rejected` with the
  providers' reasons, not a retryable 502. Any mix with an outage stays 502.
- A pin whose provider answers 404 is `422 invalid_model_choice` naming the model. A
  404 on a class's chain stays 502, because that is the owner's misconfiguration, not
  the caller's.
- Size limits, enforced up front as `422 validation_error`:
  - `/v1/embed`: at most 2,048 texts (OpenAI's limit; Ollama crashed at 3,000), each
    at most 32,000 characters.
  - `/v1/generate`: at most 500 messages and 800,000 characters in total.
  - Documented in the OpenAPI and the integration guide.
- Tests:
  - `tests/test_gateway.py::test_a_chain_every_provider_rejects_is_rejected_not_an_outage`
    and `::test_a_chain_with_one_rejection_and_one_outage_is_an_outage`;
  - `tests/test_routes.py::test_a_request_every_provider_rejected_is_the_callers_422_not_a_502`,
    `::test_a_model_the_provider_doesnt_have_is_the_callers_only_when_pinned` and
    `::test_oversized_requests_are_refused_before_any_provider_call`.
- Live: the pin repro returns 422 naming the model; 3,000 inputs return 422 in 6 ms.
- Suggested console scenarios under *rejections*: an unknown pinned model (422
  `invalid_model_choice`) and 2,049 embed inputs (422 `validation_error`).

**Verifier, 2026-10-25 10:24:** `make gateway-check` against the uncommitted tree passes the new `gap-pin-unknown-model`, `gap-embed-too-many` and `gap-too-many-messages`. **See MG-009:** the 400 → `provider_rejected` rule also catches Google's invalid-key 400, and the console scenarios now match the chosen fix. Set `verified` after the commit lands and the run is repeated against it.

**Verifier, 2026-10-25 12:13: verified** against air-model-gateway `6357b7a` ("Unit test and fixes."). `/v1/health` reports revision `6357b7a992e6-dirty`; the uncommitted files are docs, tests and `.env.example`, none under `src/`. Exactly one listener on `127.0.0.1:8083`, started 12:05, after the commit. Console `make gateway-check`: contract 42/42 passed, including `pin-unknown-model`, `embed-too-many`, `too-many-messages`. Each one has moved out of *known gaps* into *rejections*, where it now guards against a regression. See [last-run-local.txt](last-run-local.txt).
