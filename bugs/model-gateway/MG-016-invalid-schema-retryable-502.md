# MG-016: A caller's invalid `json_schema` is a retryable 502 on a class, and the error prints other providers' account state

| | |
|---|---|
| **Status** | open |
| **Severity** | Medium |
| **Service** | air-model-gateway @ `85afed6`, container on `:8083`; Gemini key valid, Anthropic out of credit, no OpenAI key |
| **Found** | 2026-11-16, live calls |
| **Console scenario** | none yet (proposed `schema-invalid`: class request, expect 422) |

## Summary

Two things in one response:

1. A request whose `json_schema` no provider can accept is answered
   `502 provider_unavailable` ("the one to retry") when sent to a class, and
   `422 provider_rejected` when pinned. It fails identically on every retry.
   The class path is a 502 because the other rungs failed for reasons of their
   own (no credit, no key), and `rejected` needs *every* rung to have refused
   the request. A rung that was never able to answer says nothing about the
   request and shouldn't turn a rejection into "retry".
2. The 502's `detail` gives any caller the state of the gateway's provider
   accounts: "Your credit balance is too low to access the Anthropic API",
   Anthropic's own `request_id`, and "no OPENAI api key configured".

## Reproduce

```bash
B='{"messages":[{"role":"user","content":"x"}],"json_schema":{"type":"banana"},"cache":false'
curl -s localhost:8083/v1/generate -H 'X-API-Key: air-client-dev' -H 'Content-Type: application/json' -d "$B,\"model\":\"cloud\"}" | jq '{status,code,detail}'
curl -s localhost:8083/v1/generate -H 'X-API-Key: air-client-dev' -H 'Content-Type: application/json' -d "$B,\"pin\":\"gemini:gemini-2.5-flash\"}" | jq '{status,code}'
```

## Expected

`422 provider_rejected` both times (`api/openapi.py`: "every provider refused
the request as invalid… Don't retry any of these unchanged"), with a `detail`
that names the caller's error and no more about other providers than that
they were unavailable.

## Actual

```
cloud:  502 provider_unavailable  "all providers failed: gemini: 400 INVALID_ARGUMENT … unrecognized type 'banana' at top-level;
        anthropic: credentials or account refused (… out of credit): Error code: 400 - {… 'Your credit balance is too low to access
        the Anthropic API. …', 'request_id': 'req_011Ch6ZV…'}; openai: no OPENAI api key configured"
pinned: 422 provider_rejected
```

Also when streaming (`stream: true`): the same 502 as an ordinary HTTP error.

## Cause

`gateway/router.py`: `_all_rejected` is and-ed over every rung, including
rungs that failed with `auth`/unconfigured errors. `api/v1/model_calls.py`
`_map_error` puts the joined provider messages in `detail`.

## Suggested fix

1. Compute `rejected` over the rungs that actually judged the request: ignore
   rungs that failed as unconfigured or on credentials. (If no rung judged
   it, stay 502.)
2. In `detail`, reduce an auth/unconfigured rung to `<provider>: unavailable`.
   The full text belongs in the gateway's log, which already has it.
3. Optionally validate `json_schema` shallowly (`type` is a JSON Schema type)
   before any provider call.

## Verify

The class repro returns `422 provider_rejected` and its `detail` has no
"credit balance" or provider request id.
