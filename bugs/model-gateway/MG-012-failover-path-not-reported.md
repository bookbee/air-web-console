# MG-012: A response doesn't say which models were tried before the one that answered

| | |
|---|---|
| **Status** | wont-fix (this release; planned) |
| **Severity** | Low (diagnostics; a suggestion more than a defect) |
| **Service** | air-model-gateway @ `4dd28b7` (revision `4dd28b76537b`, clean) |
| **Found** | 2026-10-26, live call and code reading |
| **Console scenario** | none (the shape of the route information is the origin's choice; add a scenario once it's chosen) |

## Summary

Failover is the gateway's main promise, but the caller can't see it
happen. A response names the model that answered, never the ones skipped
or failed before it, or why. So a caller who asked for a provider can't tell
it was skipped, and support can't explain why one call was slower or more
expensive than another without searching the gateway's logs. The fleet-wide
metric counts the failure but can't be tied to one call. The AIR Web Console
works out the route from the published chain (the *Route* grid), but it
can't say why a model didn't answer.

## Reproduce

Prefer a provider that isn't configured. The gateway moves it to the front,
skips it, and answers from the next model:

```bash
export GW=http://127.0.0.1:8083 KEY=air-client-dev   # local: OpenAI not configured
curl -sS -D - -X POST $GW/v1/generate -H "X-API-Key: $KEY" -H 'Content-Type: application/json' \
  -d '{"model":"cloud","provider":"openai","max_tokens":50,"cache":false,
       "messages":[{"role":"user","content":"Say hi."}]}'
```

Stopping Ollama and sending an `auto` call shows the same: Gemini answers,
and nothing says Ollama didn't.

## Expected

Something the caller can read to tell which models were tried, in order,
and what happened to each: answered, or skipped/failed with a reason.
The contract doesn't promise this today, so this is a suggestion for the
owner rather than a broken promise.

## Actual

```
HTTP/1.1 200 OK
content-type: application/json
x-request-id: a6c8f231a460428b80a57f6d5cf2e7da

{"id": "d98ee1f2…", "model_class": "cloud", "model": "gemini-2.5-flash", "provider": "gemini",
 "usage": {...}, "cost_usd": 6.4e-05, "cached": false, "refusal": false,
 "finish_reason": "stop", "provider_finish_reason": "STOP"}
```

The caller asked for OpenAI, and nothing in the body or the headers says it
was skipped. Only the fleet-wide metric moved:
`air_model_gateway_rung_failures_total{model="gpt-4o-mini",provider="openai",reason="not_configured"} 1`.

## Cause

`src/air_model_gateway/gateway/router.py:154` collects every model that
fails during the walk (`failed = _Failed()`, with each one's `reason`). When
a later model answers, `:241` returns `_Served(result, provider_kind)` and
drops that list. It reaches the caller only when *every* model fails, as the
502's `all providers failed: …` detail.

## Suggested fix

Keep the list on success and return it, using the reason codes the metric
already has (`ProviderError.reason`: `auth`, `not_configured`,
`rate_limited`, `rejected`, `not_found`, `timeout`, `unavailable`,
`adapter`, `other`), never raw provider error text. Two shapes:

1. **A response field** on `GenerateSummary`, so it's in both the JSON body
   and a stream's `done` event, for example
   `"attempts": [{"provider": "openai", "model": "gpt-4o-mini", "outcome": "not_configured"},
   {"provider": "gemini", "model": "gemini-2.5-flash", "outcome": "answered"}]`.
   This is a contract addition, so `openapi.json` changes, and existing
   callers ignore the new field.
2. **A response header** such as
   `X-Gateway-Route: openai:gpt-4o-mini=not_configured, gemini:gemini-2.5-flash=answered`.
   No schema change, but a stream would have to send it before the first
   token, which it can do since the route is settled by then.

A cache hit should say so (for example `cache`), not repeat the original
route. Add the same to the audit line, so logs and responses agree.

## Verify

- The repro returns the route with OpenAI as `not_configured` and Gemini as
  `answered`.
- A plain call that the first model answers returns a one-entry route.
- A gateway test for each shape: a failover, a cache hit, a stream.
- This console: add a contract scenario for the chosen shape, and have
  the *Route* grid read it instead of working it out from the chain.

## Resolution

Not in this release, by the owner's decision (2026-10-26): it is a contract
addition, Low severity, and shouldn't hold up the release candidate. Recorded as
future work in air-model-gateway `docs/00-plan.md` §6 item 8, in the shape suggested
here: an `attempts` list of `provider`, `model` and the reason code (never provider
text) in the JSON body and the stream's `done` event, `cache` on a hit, and the same
on the audit line. Until then, a failover is visible fleet-wide in
`air_model_gateway_rung_failures_total{reason}` and per call in the gateway's logs by
`request_id` (`provider.failed` lines). Reopen this report, or file a new one, when
the plan item is scheduled.
