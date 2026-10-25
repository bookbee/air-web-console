# MG-001: Gemini structured output crashes on a nullable field; `cloud` silently fails over at ~7× cost

| | |
|---|---|
| **Status** | verified |
| **Severity** | High |
| **Service** | air-model-gateway @ `29fc4aa` |
| **Found** | 2026-10-25, live call and traceback |
| **Console scenario** | `gemini-nullable-schema` (happy path; was `gap-gemini-nullable-schema`) |

## Summary

A `json_schema` that uses a JSON Schema union type, such as
`"type": ["string", "null"]` (the usual way to write an optional field),
crashes the Gemini adapter. A pin to Gemini returns a 502. Under
`model: cloud` or `auto`, the chain fails over to Anthropic without telling
anyone. The answer is correct, but it costs about 7× more and is slower.
Any consumer whose schema has an optional field pays this on every call.

## Reproduce

```bash
curl -sS $GW/v1/generate -H "X-API-Key: $KEY" -H 'Content-Type: application/json' -d '{
  "pin": "gemini:gemini-2.5-flash",
  "messages": [{"role": "user", "content": "Classify the sentiment: I love this product!"}],
  "json_schema": {"type": "object",
    "properties": {"label": {"type": "string"}, "reason": {"type": ["string", "null"]}},
    "required": ["label", "reason"], "additionalProperties": false},
  "schema_name": "sentiment", "max_tokens": 400, "cache": false}'
```

Then send the same body with `"model": "cloud"` instead of `pin`.

## Expected

Integration guide §3: Gemini constrains decoding to the schema. A valid
JSON Schema is either honoured or, if unsupported, handled by the adapter's
documented fallback. It should never crash.

## Actual

- **Pin:** `502 provider_unavailable`. The gateway log shows an unexpected
  `AttributeError: 'list' object has no attribute 'upper'`, raised from
  google-genai's `Type` enum while it builds the request.
- **`cloud`:** `200` with `provider: anthropic`, `model: claude-haiku-4-5`,
  `cost_usd: 0.00097`. The same prompt served by Gemini costs about
  `0.000135`. The response doesn't say a rung failed.

## Cause

`src/air_model_gateway/gateway/providers/gemini_provider.py:119-120` passes
the schema as `config["response_schema"]`. That field takes Gemini's own
OpenAPI-subset `Schema`, in which `type` is a single enum value, so a list
breaks it. `_schema_is_supported` (`:190`) rejects only `$defs` and `$ref`,
so union types get through.

## Suggested fix

Preferred: pass the schema as `response_json_schema`, which takes standard
JSON Schema including union types. The installed google-genai 2.33.0
supports it, though `pyproject.toml` only requires `>=1.0`, so raise that
floor as well.

Alternative: have `_schema_is_supported` also reject list-valued `type`,
`anyOf`/`oneOf` and `nullable`, so those schemas use the prompt-and-validate
fallback.

Either way, an unexpected exception inside an adapter should be logged as
an adapter bug (a metric or alert), not counted as an ordinary rung failure.

## Verify

- The pin repro returns `200`, `provider: gemini`, and `content` is JSON
  matching the schema.
- The `cloud` repro is served by Gemini.
- The console scenario `gap-gemini-nullable-schema` passes.
- Add a gateway test with a nullable property that doesn't mock the SDK's
  config build.

## Resolution

Fixed in air-model-gateway `develop` on top of `29fc4aa`, **not yet committed** (the owner commits; add the commit here when it lands). `make verify` passes (324 tests); the repro was re-run live against the fixed build on 2026-10-25.

- `gemini_provider.py` sends the schema as `response_json_schema` (standard JSON
  Schema) instead of `response_schema`. Checked live: union types, `anyOf` and
  `$defs`/`$ref` are all accepted by gemini-2.5-flash, so the `$defs` prompt fallback
  was removed too. `pyproject.toml` now requires `google-genai>=1.22`, the first
  version with that field.
- An unexpected exception inside an adapter now increments
  `air_model_gateway_adapter_errors_total{provider,model}`, listed as a first alert in
  the deployment runbook.
- Test: `tests/test_gemini_provider.py::test_every_schema_is_enforced_at_decode_time_unchanged`
  (flat, nested, nullable), built with the real SDK config types.
- Live: the pin repro returns `200`, `provider: gemini`, valid JSON; `model: cloud` is
  served by Gemini (`cost_usd` 0.000266).

**Verifier, 2026-10-25 10:24:** `make gateway-check` against the uncommitted tree passes `gap-gemini-nullable-schema`, and the console scenarios now match the chosen fix. Set `verified` after the commit lands and the run is repeated against it.

**Verifier, 2026-10-25 12:13: verified** against air-model-gateway `6357b7a` ("Unit test and fixes."). `/v1/health` reports revision `6357b7a992e6-dirty`; the uncommitted files are docs, tests and `.env.example`, none under `src/`. Exactly one listener on `127.0.0.1:8083`, started 12:05, after the commit. Console `make gateway-check`: contract 42/42 passed, including `gemini-nullable-schema`. Each one has moved out of *known gaps* into *happy path*, where it now guards against a regression. See [last-run-local.txt](last-run-local.txt).
