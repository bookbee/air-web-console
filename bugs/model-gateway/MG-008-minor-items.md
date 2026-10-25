# MG-008: Minor items: streamed refusal, OpenAI params, cache-write pricing, budget race, stale `.env`

| | |
|---|---|
| **Status** | verified |
| **Severity** | Low |
| **Service** | air-model-gateway @ `29fc4aa` |
| **Found** | 2026-10-25, **code reading, not reproduced live** (except where noted) |
| **Console scenario** | none |

Five small items, grouped because each is a one-line fix or a decision. If
one turns out to be larger, give it its own MG number and strike it out
here.

## a. A streamed refusal sends the refused text, then says it was empty

On a refusal, the non-streamed answer has `refusal: true` and empty
`content`. A stream has already sent the model's text as `delta`s before
`done` arrives with `refusal: true`. So a streaming client shows text the
non-streamed path would have hidden.

**Fix:** document that clients must discard deltas when `done.refusal` is
true. Or, for providers that signal a refusal early, end the stream with an
`error` event instead.

## b. The OpenAI adapter always sends `max_tokens` and `temperature`

`src/air_model_gateway/gateway/providers/openai_provider.py:54-55,83-84`.
gpt-5 and o-series models reject `max_tokens` (they take
`max_completion_tokens`) and any non-default `temperature`. A pin to one of
them would fail with a provider 400 (and then a 502; see
[MG-005](MG-005-client-errors-as-retryable-502.md)). It isn't reproduced
because this gateway had no OpenAI key.

**Fix:** send `max_completion_tokens`. Leave out `temperature` when the
caller didn't set it, and for models that don't support it.

## c. Anthropic 5-minute cache writes are priced at the 1-hour rate

`src/air_model_gateway/gateway/cost.py:31` sets `cache_write_ratio=2.0`,
which is applied to every cache-write token at `:93`. Anthropic charges
1.25× for 5-minute writes and 2× for 1-hour writes. So `cost_usd`
over-states 5-minute writes by 60%. That's the safe direction, but the
reported cost is wrong.

**Fix:** price by the TTL the adapter requested, or document the
over-estimate in `pricing.yaml`.

## d. The daily budget check isn't atomic

`src/air_model_gateway/policy/budget.py`: spend is read before the call and
added after, so concurrent calls can all pass the check and overshoot
`daily_budget_usd`. The module docstring (`:9`) admits that calls already in
flight complete. This is about how far over it can go: with high
concurrency, it can exceed the cap by roughly concurrency × the cost of one
call.

**Fix:** reserve an estimated cost atomically (Redis `INCRBYFLOAT` with a
check) before the call, then settle up after. Or document the overshoot
bound.

## e. A stale local `.env` (cleanup, not a code bug)

A developer `.env` copied from an older `.env.example` still has
`AIR_MODEL_GATEWAY_GATEWAY__DEFAULT_PROVIDER` / `__DEFAULT_MODEL`, which
are no longer read, and `OLLAMA__BASE_URL=http://ollama:11434`, which only
resolves inside Docker. The tracked `.env.example` is already correct
(`localhost:11434`, no default keys). Extra keys are ignored, so the only
symptom is that every local rung fails until the URL is overridden.
*(Observed directly on the test machine.)*

**Fix:** none in the repo. Consider logging unknown `AIR_MODEL_GATEWAY_*`
keys at startup so a stale `.env` is easy to spot. Tell developers to
re-copy `.env.example`.

## Verify

Each item: confirm the fix or the documented decision, then mark it here
(e.g. ~~b~~ fixed in `<commit>`). Close this report when all five are
resolved.

## Resolution

Fixed in air-model-gateway `6357b7a` (on top of `29fc4aa`). `make verify` passes (343 tests).

- ~~a~~ Documented: if `done` has `refusal: true`, discard the deltas. This is in the
  integration guide's streaming section, the OpenAPI description and the reference
  client's `generate_stream` docstring. The verdict only arrives with the final item,
  so the gateway can't withhold the text without buffering the whole stream.
- ~~b~~ The OpenAI adapter sends `max_completion_tokens` and leaves out `temperature`
  and the token cap when the caller didn't set them. A caller who sets a temperature
  for a fixed-temperature model gets the provider's 400 as `422 provider_rejected`
  (MG-005). Test: `tests/test_openai_provider.py`.
- ~~c~~ `cache_write_ratio` is now 1.25, Anthropic's 5-minute rate, which the adapter
  requests: `ephemeral` with no `ttl`. Changed in `pricing.yaml` and the built-in
  table, with comments tying it to the adapter. Tests: `tests/test_gateway_config.py`.
- ~~d~~ Documented, not reserved: the overshoot is at most the service's concurrent
  paid calls times the cost of one. This is in `policy/budget.py`, the LLD and a new
  "Budgets" section in the integration guide. A reservation would add two Redis round
  trips per paid call and still guess the cost.
- ~~e~~ At boot the gateway logs `config.unknown_keys` with the names (never the
  values) of any `AIR_MODEL_GATEWAY_*` variable no setting reads. Live, it flags the
  test machine's `…__DEFAULT_MODEL` and `…__DEFAULT_PROVIDER`. The stale
  `OLLAMA__BASE_URL` value can't be detected: re-copy `.env.example`. Test:
  `tests/test_config.py::test_unknown_keys_names_retired_and_misspelt_settings_only`.

**Verifier, 2026-10-25 10:24:** `make gateway-check` against the uncommitted tree passes nothing automatically (code reading); the a–e changes were read in the diff, and the console scenarios now match the chosen fix. Set `verified` after the commit lands and the run is repeated against it.

**Verifier, 2026-10-26** (run by the gateway session at the owner's request) against `4dd28b7` (revision `4dd28b76537b`, clean; `src/` identical to `6357b7a`), one listener on `:8083`: a, b and d read in the committed docs and code (integration guide, `openai_provider.py::_optional`, `policy/budget.py`); c: `deploy/pricing.yaml` `cache_write_ratio: 1.25`; e: the boot log lists `config.unknown_keys` with this machine's two retired keys. The gateway suite passes (343 tests). Status set to `verified`.
