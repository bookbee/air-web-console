# MG-002: A pin to a paid model missing from `pricing.yaml` costs $0 and bypasses the daily budget

| | |
|---|---|
| **Status** | verified |
| **Severity** | High |
| **Service** | air-model-gateway @ `29fc4aa` |
| **Found** | 2026-10-25, live call |
| **Console scenario** | `unpriced-pin` (rejections; was `gap-unpriced-pin`) |

## Summary

`pin` accepts any `provider:model`, but the PriceBook only knows the models
in `deploy/pricing.yaml`. A pinned paid model that isn't listed is priced at
`0.0`. The provider still bills it, but `daily_budget_usd` never counts it,
so a caller with a `pin` grant can spend without limit. The console's own
key holds `pin` in staging and prod.

## Reproduce

```bash
curl -sS $GW/v1/generate -H "X-API-Key: $KEY" -H 'Content-Type: application/json' \
  -d '{"pin": "anthropic:claude-sonnet-4-5", "messages": [{"role": "user", "content": "hi"}], "max_tokens": 5, "cache": false}'
```

## Expected

Any call that returns 200 from a paid provider reports a `cost_usd` above
zero and counts towards the caller's daily budget. Otherwise, the call is
refused.

## Actual

`200`, `provider: anthropic`, `model: claude-sonnet-4-5`, `cost_usd: 0.0`.
The only signal is the counter `air_model_gateway_model_unpriced_total`.
(`pricing.yaml` lists `claude-sonnet-5`, not `claude-sonnet-4-5`.)

## Cause

`src/air_model_gateway/gateway/cost.py:81-87`: `PriceBook.price` returns
`0.0` for an unknown model. By design that's a metric, not an error (see the
docstring at `:56`), which is fine for chain rungs the owner chose but not
for a model the caller names.

## Suggested fix

Do one of these:

- Reject a pin to a paid provider whose model has no price, with
  `422 invalid_request` and the detail "model not priced".
- Restrict pins to models that appear in some chain or in `pricing.yaml`.

Also consider failing startup when a chain rung for a paid provider has no
price.

## Verify

- The repro returns either a 422 or a `cost_usd` above zero that shows up in
  the budget.
- The console scenario `gap-unpriced-pin` passes. Its check is
  `cost_usd > 0`, so if the fix is a 422, change the scenario's expectation
  to match.

## Resolution

Fixed in air-model-gateway `develop` on top of `29fc4aa`, **not yet committed** (the owner commits; add the commit here when it lands). `make verify` passes (324 tests); the repro was re-run live against the fixed build on 2026-10-25.

- A pin to a paid provider whose model isn't in the price table is now
  `422 invalid_model_choice` ("… has no price here, so its spend can't be counted"),
  before any provider call. Local models stay pinnable.
- Outside local, startup also refuses a routing file that names a paid model pricing
  doesn't list (`ConfigError`).
- Tests: `tests/test_governance.py::test_a_pin_to_a_paid_model_without_a_price_is_refused`,
  `::test_outside_local_a_paid_rung_without_a_price_stops_startup`.
- **Console scenario change needed:** `gap-unpriced-pin` should expect
  `422 invalid_model_choice` instead of `cost_usd > 0`.

**Verifier, 2026-10-25 10:24:** `make gateway-check` against the uncommitted tree passes `gap-unpriced-pin` (now expects 422), and the console scenarios now match the chosen fix. Set `verified` after the commit lands and the run is repeated against it.

**Verifier, 2026-10-25 12:13: verified** against air-model-gateway `6357b7a` ("Unit test and fixes."). `/v1/health` reports revision `6357b7a992e6-dirty`; the uncommitted files are docs, tests and `.env.example`, none under `src/`. Exactly one listener on `127.0.0.1:8083`, started 12:05, after the commit. Console `make gateway-check`: contract 42/42 passed, including `unpriced-pin`. Each one has moved out of *known gaps* into *rejections*, where it now guards against a regression. See [last-run-local.txt](last-run-local.txt).
