# MG-004: `/v1/capabilities` marks `cloud-1536-v1` allowed when its only provider isn't configured

| | |
|---|---|
| **Status** | fixed |
| **Severity** | Medium |
| **Service** | air-model-gateway @ `29fc4aa` |
| **Found** | 2026-10-25, live call |
| **Console scenario** | `gap-capabilities-usable` |

## Summary

`GET /v1/capabilities` is how a consumer finds out what it can call. It
returns `"allowed": true` for `cloud-1536-v1` even though that name's one
provider (OpenAI) has no key on this gateway, so every call to it is a 502.
An embed name never fails over, so there is no other provider to serve it.
A consumer that picks from capabilities will choose a name that can't work.

## Reproduce

```bash
curl -sS $GW/v1/capabilities -H "X-API-Key: $KEY"
curl -sS $GW/v1/embed -H "X-API-Key: $KEY" -H 'Content-Type: application/json' \
  -d '{"model": "cloud-1536-v1", "input": ["hello"]}'
```

## Expected

A name the caller can't use isn't advertised as usable. Either
`allowed: false`, or a separate `available: false` next to `allowed`.

## Actual

Capabilities shows `providers.openai: false` and also
`embed["cloud-1536-v1"].allowed: true` with `provider: openai`. The embed
call returns `502 provider_unavailable`.

## Cause

`src/air_model_gateway/api/v1/system.py:92` sets `allowed` from policy alone
(`policy.may_use_embed_model`) and never checks the `providers` map that the
same response already holds. The model is declared at
`deploy/routing.yaml:78`.

## Suggested fix

Add `available` (true when the provider is configured), and keep `allowed`
meaning policy only. That way a consumer can tell "not permitted" apart from
"not set up here". Do the same per class in `generate`: a class whose every
rung is unconfigured is also unusable.

## Verify

- With no OpenAI key, capabilities no longer shows `cloud-1536-v1` as both
  allowed and usable.
- The console scenario `gap-capabilities-usable` passes. Its check reads
  `allowed` together with `providers`. If the fix adds `available`, update
  the check to read that field instead.

## Resolution

Fixed in air-model-gateway `develop` on top of `29fc4aa`, **not yet committed** (the owner commits; add the commit here when it lands). `make verify` passes (324 tests); the repro was re-run live against the fixed build on 2026-10-25.

- `/v1/capabilities` adds `available` next to `allowed`: on each embedding model (its
  one provider is configured) and on each generate class (some rung's provider is
  configured). `allowed` still means policy only. Additive contract change, in
  `docs/openapi.json`.
- Test: `tests/test_governance.py::test_capabilities_tells_allowed_from_available`.
- Live: `cloud-1536-v1` shows `allowed: true, available: false` with no OpenAI key.
- **Console scenario change needed:** `gap-capabilities-usable` should read
  `available`.

**Verifier, 2026-10-25 10:24:** `make gateway-check` against the uncommitted tree passes `gap-capabilities-usable` (now reads `available`), and the console scenarios now match the chosen fix. Set `verified` after the commit lands and the run is repeated against it.
