# MG-014: `1fa80de` made the default `auto` class cloud-only, with a duplicate rung, and left 2 tests failing

| | |
|---|---|
| **Status** | fixed `0ba546c` (branch `fix/restore-routing-order`, pushed) · verified in code, **not yet deployed** |
| **Severity** | Medium |
| **Service** | air-model-gateway @ `1fa80de` ("Minor updates", `deploy/routing.yaml` only) |
| **Found** | 2026-11-14, code reading and the gateway's own test suite (SIT) |
| **Console scenario** | none |

## Summary

`1fa80de` reordered `deploy/routing.yaml`, presumably to work around this
environment's dead Ollama and invalid Gemini key (see the SIT report). Three
side effects:

1. **The default class `auto` no longer tries local first.** The comment
   directly above it still promises "Local first (free and private while the
   local model is healthy), then cloud as fallback". Every caller that relies on
   the default now sends all text to a cloud vendor and pays for it, even once
   Ollama is back.
2. **`auto` lists `anthropic:claude-haiku-4-5` twice** (rungs 1 and 3). When
   Haiku fails, the chain tries Gemini and then the *same* Haiku model again, wasting
   a call and latency during an Anthropic outage. This looks like an edit slip
   (`ollama` replaced by `anthropic` in the first rung).
3. **Two of the gateway's own tests fail at `HEAD`**, because they pin the old
   order:
   - `tests/test_client_end_to_end.py::test_cloud_call_is_priced_and_then_served_from_cache`
     expects `gemini` first in `cloud`.
   - `tests/test_gateway_config.py::test_the_classifier_keeps_its_tier_semantics`
     expects `gemini-3.1-pro-preview` first in the classifier's `cloud` override.

   The comment above `cloud` ("Gemini leads because it is the provider with a
   working key…") is also now wrong.

## Reproduce

```bash
cd ../air-model-gateway
git show 1fa80de -- deploy/routing.yaml
sed -n 36,60p deploy/routing.yaml     # auto: anthropic, gemini, anthropic, openai
make test                              # 2 failed (above), at HEAD with no other change
```

## Expected

Either the old order (local first for `auto`; Gemini first for `cloud` once the
Gemini key is valid), or a deliberate new policy, with comments and tests
updated to say so and no duplicate rung.

## Suggested fix

Owner's decision, since this is routing policy. Options:

- **Revert `1fa80de`** once Ollama and the Gemini key work again, and handle the
  local outage through the breaker and failover the chain already has (a dead
  first rung is skipped).
- **Keep cloud-first deliberately:** remove the duplicate Haiku rung, rewrite
  both comments, and update the two tests to the new order.

The SIT reporter didn't change either the config or the tests, so as not to cement or
override a choice the owner made.

## Verify

`make test` passes with no failures, and `auto` has no duplicate rung. Its first
rung matches its comment.

## Resolution

**Origin:** reverted in `0ba546c` ("Restore routing order: Gemini first in
cloud chains, local first in auto") on `fix/restore-routing-order`.

**Verifier (2026-11-14, integrated pass 2):** at `0ba546c`, `auto` is
`ollama:llama3.2:3b → gemini → anthropic → openai` (no duplicate rung, first
rung matches its comment) and the gateway suite passes, 360/360, including
both tests that failed at `1fa80de`. **Not verified live:** the running
gateway still reports revision `fc741714427b`, and a default `/v1/generate`
was served by `anthropic:claude-haiku-4-5`. Close as `verified` after the
gateway is rebuilt from a build containing `0ba546c` and a default call is
served by Ollama.
