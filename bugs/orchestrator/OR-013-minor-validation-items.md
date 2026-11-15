# OR-013: Minor validation items: `confirm.approve` accepts `"yes"`, malformed JSON is a 422 naming field "16", oversize body is 400

| | |
|---|---|
| **Status** | a, b fixed (working tree) · verified · c by design |
| **Severity** | Low |
| **Service** | air-orchestrator-service @ `8ed74d7` + working tree (OR-007/008/011), container on `:8081` |
| **Found** | 2026-11-15, direct calls |
| **Console scenario** | none |

## a. `confirm.approve` is lax-coerced

`{"message":"yes","confirm":{"proposal_id":"prop_x","approve":"yes"}}` is
accepted (200). Pydantic's lax `bool` turns `"yes"`, `"on"`, `"true"`, `"1"`
and `1` into `true`. The `Confirmation` docstring's point is that consent is a
structured field, not text. A client that forwards a user's text or a form
value into `approve` should get a 422, not an approval. Fix:
`approve: StrictBool` (and `ConfigDict(strict=True)` on `Confirmation`), plus a
test that `"yes"` and `1` are 422.

## b. Malformed JSON is `422 validation-error`, field `"16"`

`{"message": "hi"` (truncated) → `422 … "detail": "16: JSON decode error",
"errors": [{"field": "16", "code": "json_invalid"}]`. The `16` is a byte
offset, not a field. The classifier answers the same input `400
malformed-request`, and air-rag-service has the same 422 (RG-001). Auth is
checked first (no key → 401), which is correct.

## c. An oversize body is `400`, not `413`

A 2 MB body → `400 malformed-request "Request body of 2000015 bytes exceeds
the 1048576 byte limit."` The limit is right; `413` would let a client tell
"too big" from "broken" (same as CL-008 c).

## Held

Unknown fields, 32,001-character and whitespace-only messages, a
129-character session id, `deadline_ms: 50`, `max_cost_usd: 0`,
`allow_routes: []` or an unknown route, `redact_pii` on the customer channel,
`message: null`, an extra field in `confirm`, the wrong channel's key (403
both ways), no key (401), and an unsigned `air-token` (401) are all refused
cleanly, in under 70 ms, with no model call.

## Resolution

**Origin (2026-11-15):**
- a: spec 0001 `REQ-MUT-015`. `confirm.approve` is `StrictBool`; `"yes"`, `"true"`, `"on"`, `1` and `"1"` are each a 422 naming `confirm.approve`.
- b: spec 0009 `REQ-VAL-008`. A body that isn't valid JSON is `400 malformed-request` with no field errors, once the caller is authenticated (no key is still 401, `REQ-VAL-006`).
- c: **by design**. LLD §12's error catalogue files an oversized payload under `malformed-request`.

`make check` 559 passed. Working tree, not committed.

**Verified 2026-11-15 ~09:00 UTC** on `:8081`: `approve` of `"yes"`, `"true"`, `"on"`, `1` and `"1"` are each 422 naming `confirm.approve`, and `true` is still accepted; truncated JSON with a key is `400 Malformed request` with no field errors, and without a key it's 401.
