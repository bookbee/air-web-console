# MG-011: Gemini's thinking uses up `max_tokens`, so capped answers are cut off and uncached, and uncapped ones cost several times more

| | |
|---|---|
| **Status** | fixed, uncommitted |
| **Severity** | Medium |
| **Service** | air-model-gateway @ `4dd28b7` (revision `4dd28b76537b`, clean) |
| **Found** | 2026-10-26, live calls (demo preparation in the console) |
| **Console scenario** | `gap-gemini-thinking-cap` (Model Gateway tab, *known gaps*) |

## Summary

`gemini-2.5-flash` is a thinking model, and the gateway passes `max_tokens`
straight through as Gemini's `max_output_tokens`, which counts thinking too.
At any cap a caller is likely to pick, the thinking takes almost all of it.
The answer comes back cut off (`finish_reason: length`), is still billed, and
isn't cached, so a retry pays again. Without a cap, a one-sentence answer
uses about 850 output tokens. This affects every service that calls `cloud`
or `auto` (Gemini is the first cloud model in both chains). The integration
guide's advice, "leave `max_tokens` at 300 or more", doesn't avoid it.

## Reproduce

```bash
export GW=http://127.0.0.1:8083 KEY=air-client-dev
for mt in 120 300 600; do
  curl -sS -X POST $GW/v1/generate -H "X-API-Key: $KEY" -H 'Content-Type: application/json' \
    -d "{\"pin\":\"gemini:gemini-2.5-flash\",\"max_tokens\":$mt,\"cache\":false,
         \"messages\":[{\"role\":\"user\",\"content\":\"In one sentence, why might a customer's parcel arrive late?\"}]}"
  echo
done
# and once more without max_tokens
```

`model: "cloud"` shows the same, since Gemini is its first model. The pin
just keeps the repro on Gemini.

## Expected

A one-sentence answer under the integration guide's own advice
(`docs/04-integration.md` §4 "Structured output": "leave `max_tokens` at
300 or more, because thinking models spend part of it before answering"):
`finish_reason: stop`. More generally, `max_tokens` should bound the
*answer*, as it does on every non-thinking model in the same chains
(Anthropic, OpenAI, Ollama). Callers choose a class, not a model, so they
can't tune it per model.

## Actual

| `max_tokens` | `finish_reason` | completion tokens | `cost_usd` | content |
|---|---|---|---|---|
| 120 | `length` (`MAX_TOKENS`) | 116 | 0.000295 | `"A customer's parcel"` |
| 300 | `length` (`MAX_TOKENS`) | 296 | 0.000745 | `"A customer's parcel might arrive late due to unforeseen circ…"` |
| 600 | `length` (`MAX_TOKENS`) | 596 | 0.001494 | `"A customer's parcel might arrive late due to unforeseen weat…"` |
| unset | `stop` | 850 | 0.002129 | a full sentence |

All four are billed; the first three aren't cached (cut-off answers never
are), so each retry pays again. For comparison, `claude-haiku-4-5` answered
the same prompt in full for about $0.0002 earlier the same day.

## Cause

`src/air_model_gateway/gateway/providers/gemini_provider.py:108` sets
`config = {"max_output_tokens": req.max_tokens}` and nothing else. No
`thinking_config` is sent, so Gemini 2.5 Flash uses its default dynamic
thinking budget, and its thinking tokens count against `max_output_tokens`.

## Suggested fix

The owner's choice. Options, roughly in order of preference:

1. **A thinking budget per model in `routing.yaml`** (for example
   `thinking_budget: 0` or a small number for `gemini-2.5-flash`), sent as
   `thinking_config.thinking_budget`. The owner decides per model whether
   thinking is worth paying for. `0` turns it off on 2.5 Flash, which suits
   chat, classification and extraction.
2. **Make `max_tokens` mean visible output for thinking models:** send
   `max_output_tokens = max_tokens + thinking_budget`, with a fixed budget,
   so the caller's cap means what it means on other providers.
3. At minimum, **fix the guide:** the "300 or more" advice is wrong for
   2.5 Flash. Say that a capped Gemini answer may be cut off, and what to do
   about it.

Whichever you choose, keep `usage.completion_tokens` honest (thinking
included, since it's billed) and price it as today.

## Verify

- The repro at `max_tokens: 300` returns `finish_reason: stop` with a
  complete sentence, and a cost close to the uncapped answer or lower.
- Console scenario `gap-gemini-thinking-cap` passes (pin
  `gemini:gemini-2.5-flash`, `max_tokens: 300`, expects
  `finish_reason: stop`). It's a paid call, well under a cent.
- A gateway test that the Gemini request carries the configured thinking
  budget.

## Resolution

Fixed in air-model-gateway on top of `4dd28b7`, **not yet committed** (the owner
commits and tags; add the commit here when it lands). Option 1, as suggested:

- **Config.** `deploy/routing.yaml` has a new `model_settings` section keyed
  `provider:model`, so it applies wherever the model runs (any chain, an override, a
  pin). `gemini:gemini-2.5-flash` has `thinking_budget: 0` (thinking off). The
  schema (`schemas/gateway.py::ModelSettings`) rejects a misspelt field, a malformed
  key, a negative budget, and a budget for a provider whose adapter wouldn't send it.
- **Adapter.** `gemini_provider.py` sends `thinking_config.thinking_budget` for a
  model with a budget, and adds the budget to `max_output_tokens`, so `max_tokens`
  bounds the visible answer. Both the plain and the streamed call. A model with no
  budget keeps Gemini's default. Usage still includes thinking, priced as before.
- **Docs.** The integration guide's "300 or more" advice is replaced; the LLD,
  handover operating notes, `AGENTS.md` (a new thinking model needs a budget
  decision) and the classifier's migration note (its timeout) are updated.
- **Tests.** `tests/test_gemini_provider.py::test_a_configured_thinking_budget_is_sent_and_added_to_the_cap`
  (off, added to the cap, uncapped; plain and stream),
  `::test_a_model_without_a_budget_keeps_geminis_default`;
  `tests/test_gateway_config.py::test_shipped_routing_turns_thinking_off_on_gemini_flash`,
  `::test_model_settings_that_would_be_ignored_fail_at_load`,
  `::test_the_gemini_adapter_gets_the_routing_files_budgets`. `make verify` passes
  (354 tests, 95.21%).

**Live, 2026-10-26,** revision `4dd28b76537b-dirty` (one listener on `:8083`), the
repro above:

| `max_tokens` | `finish_reason` | completion tokens | `cost_usd` |
|---|---|---|---|
| 120 | `stop` | 26 | 0.000069 |
| 300 | `stop` | 25 | 0.000067 |
| 600 | `stop` | 27 | 0.000072 |
| unset | `stop` | 27 | 0.000072 (was 0.002129) |

Each a full sentence. `model: "cloud"` at 300: Gemini, `stop`. Streamed at 120:
`done` with `finish_reason: stop`. A structured `cloud` classification took ~1.1 s
(was 7–12 s with thinking). This console's `make gateway-check`: contract 42/42,
`gap-gemini-thinking-cap` passing (reported as "now passing").

_Verifier: after the commit lands, re-run on the tag, then move
`gap-gemini-thinking-cap` out of known gaps._
