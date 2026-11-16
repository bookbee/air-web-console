# TG-003: Minor items (empty subject, oversize body wording, 404 for a wrong method)

| | |
|---|---|
| **Status** | open |
| **Severity** | Low |
| **Service** | air-tools-gateway @ `77ab757`, container on `:8084` |
| **Found** | 2026-11-16, live calls |
| **Console scenario** | none |

## Items

**a. An empty `subject` is accepted.** `{"subject":"","arguments":{}}` on
`orders.list_recent` is `200 {"orders":[]}`, and on `orders.get` it is
`404 No such order`. `null` is refused (`400`, the `null-subject` row); an
empty string means the same thing and should be refused the same way
(`minLength: 1` on `SUBJECT_SCHEMA`, `src/http/pipeline.ts:25`). Check the
contract (`contract/`) first: if it doesn't state a minimum, this is a
contract change.

**b. A body over the limit says "The body must be a JSON object".** A 300 KB
body gets `400 invalid_arguments` with that detail (`src/http/problems.ts`
maps every `FST_ERR_CTP_*` to it). `413` or a detail naming the limit would
tell the caller what to fix.

**c. A wrong method is `404 No such endpoint`**, not `405` with `Allow`
(`GET /v1/actions/orders.cancel/execute`). Note that the console's
`EXECUTE_SERVED` control step exists because an unserved route also answers
404; a 405 would make the two distinguishable.

## Held

Strict types (`limit: "3"`, `2.5`, `true` → 400), `order_id` pattern (unicode
digits, trailing newline), prototype-pollution keys refused, capability names
`toString`/`__proto__`/path traversal → 404, subject case and padding not
normalised (no cross-customer match), duplicate JSON keys (last wins, still
isolated), two proposals for one order executed at once → one `done`, one
`rejected invalid_state`; eight concurrent executes on one key → one
execution id; a read key or another tenant's execute key cannot execute.
