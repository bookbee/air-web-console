# MG-013: `max_tokens` has no upper bound (a retryable 502), and structurally invalid conversations reach a paid provider

| | |
|---|---|
| **Status** | fixed (`fc74171`, branch) · verified |
| **Severity** | Medium |
| **Service** | air-model-gateway @ `1fa80de` |
| **Found** | 2026-11-14, live calls (SIT) |
| **Console scenario** | none yet (proposed: `max-tokens-huge`, rejections group) |

## Summary

1. `max_tokens: 10000000` passes validation. The Anthropic SDK then refuses it
   *client-side* ("Streaming is required for operations that may take
   longer than 10 minutes"), which the gateway maps to **`502
   provider_unavailable`**, the answer the docs tell clients to retry. It
   will fail identically forever. MG-005 fixed this class for provider 4xx
   answers, but an SDK-side refusal isn't a provider 4xx, so it slips past.
2. Conversations the gateway could reject itself are sent to a provider first
   and come back `422 provider_rejected` only after a paid round trip: a
   system message only, an empty `content`, and (model-dependent) an
   assistant message last. When the chain also contains an unhealthy rung
   (an invalid key, an unreachable Ollama), the mix becomes a **502**, as
   MG-005 specifies, so the caller is told to retry a bad request.

## Reproduce

```bash
export GW=http://127.0.0.1:8083 KEY=air-client-dev
curl -sS -X POST $GW/v1/generate -H "X-API-Key: $KEY" -H 'Content-Type: application/json' \
  -d '{"pin":"anthropic:claude-haiku-4-5","messages":[{"role":"user","content":"hi"}],"max_tokens":10000000}' | jq '{status,code}'
curl -sS -X POST $GW/v1/generate -H "X-API-Key: $KEY" -H 'Content-Type: application/json' \
  -d '{"pin":"anthropic:claude-haiku-4-5","messages":[{"role":"user","content":""}],"max_tokens":5}' | jq '{status,code}'
curl -sS -X POST $GW/v1/generate -H "X-API-Key: $KEY" -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"system","content":"be nice"}],"max_tokens":5}' | jq '{status,code}'
```

## Actual

```
max_tokens 1e7, pinned       → 502 provider_unavailable (4 ms)
empty content, pinned        → 422 provider_rejected (294 ms, a provider round trip)
system only, default class   → 502 provider_unavailable (anthropic 400 + gemini key refused)
```

## Expected

422 `validation_error` before routing, for: `max_tokens` above a documented
cap (the largest output any routed model supports, for example 64k), an empty
`content` on a user message, and a conversation with no user message. That's
in line with MG-005's "size limits enforced up front".

## Cause

`schemas/models.py:50`: `max_tokens: int | None = None` has `ge=1` but no `le`.
The message model (`schemas/models.py:23-29`) validates `role` but not
non-empty `content` or the presence of a user turn. SDK-side `ValueError`s
are wrapped like transport failures.

## Suggested fix

Add `le=<cap>` to `max_tokens`, `min_length=1` to user `content`, and a
model validator requiring at least one `user` message. Map SDK-side argument
errors to `422 provider_rejected` rather than 502.

## Verify

All three repros return `422 validation_error` with no provider call (no
`provider.failed` log line). Add the `max-tokens-huge` and `empty-content`
scenarios to the Model Gateway tab's rejections group.

## Resolution

**Origin:** no air-model-gateway session was running, so the SIT reporter (air-web-console session) made the fix. Committed as `fc74171` on branch `fix/sit-2026-11-14-mg-013` (on top of `1fa80de`; not pushed). Verified live against the same tree as revision `1fa80dea1597-dirty`, for the gateway owner to review and merge.
- `schemas/generate.py`: new `MAX_OUTPUT_TOKENS = 64_000`, and `max_tokens` gains `le=MAX_OUTPUT_TOKENS`.
- New `_is_a_conversation` validator: at least one `user` message, and no empty or whitespace-only `user`/`assistant` content. An empty `system` message is still accepted.
- `docs/openapi.json` regenerated (it adds `"maximum": 64000.0`).
- Tests in `tests/test_routes.py`: a `max_tokens: 10_000_000` case in `test_out_of_contract_generate_fields_are_rejected`, `test_a_conversation_no_provider_accepts_is_rejected_up_front` (4 cases), `test_an_empty_system_message_is_still_accepted`.
- Gates (run in `python:3.12.15-slim` from `requirements-dev.lock`; the host has no `.venv`): ruff and format clean, mypy clean, pytest 358 passed, 2 failed.
- **The 2 failures exist at `HEAD` too** (checked against a clean `git archive HEAD`): `test_client_end_to_end.py::test_cloud_call_is_priced_and_then_served_from_cache` and `test_gateway_config.py::test_the_classifier_keeps_its_tier_semantics`. Both still expect Gemini first in the `cloud` chain, which `1fa80de` changed to `claude-sonnet-5`. That's test drift for the owner.
- Not done: mapping other SDK-side argument errors to `422 provider_rejected`. The cap removes the known case.

**Verifier (2026-11-14 ~05:10 UTC):** container rebuilt with `docker compose up -d --build`, `/v1/health` revision `1fa80dea1597-dirty`. `max_tokens: 1e7` → 422 `max_tokens: Input should be less than or equal to 64000`; empty content → 422 `validation_error` in 3 ms with no provider call; system-only → 422 `messages need at least one user message`; the `cloud` happy path is still 200. **Passed.**
