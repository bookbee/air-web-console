# OR-005: Minor items (validation gaps, readiness, auth order)

| | |
|---|---|
| **Status** | verified (a, b, c, e) · d wont-fix (design) |
| **Severity** | Low |
| **Service** | air-orchestrator-service @ `ee242e1` |
| **Found** | 2026-11-14, live calls (SIT) unless marked |
| **Console scenario** | none |

**a. A whitespace-only message is accepted and billed.** `{"message":"   "}`
→ 200 after 1.2 s, with a classifier call plus a model call. `min_length=1`
counts spaces. Strip before validating, or reject blank text with 422.

**b. An invalid `output_schema` is accepted.** `POST /v1/query` with
`"output_schema":{"type":"nonsense"}` → 200 with a prose answer. A schema
that isn't valid JSON Schema should be a 422 up front (`jsonschema`'s
`check_schema`), not a structured call that can't conform.

**c. `allow_routes: []` is accepted** and answered on `direct`. Either
`min_length=1`, or document that `[]` means "default".

**d. Readiness doesn't probe air-classifier.** `/v1/ready` reports
`air-classifier: configured: true, reachable: null`, although every turn
calls it. The docstring defers live probing to Phase 3 (*design*, so no
fix needed now). Noting it so SIT dashboards don't read `ready: true`
as "classifier healthy".

**e. Malformed JSON gets 422 before auth.** Same class as MG-007 and
CL-006b: an unauthenticated request with body `{bad` gets 422, not 401.

## Resolution

**Origin:** air-orchestrator-service `4f05811` on branch `feature/model-gateway-migration` (on top of `ee242e1`; not pushed; byte-identical to the verified `--reload` tree, which was clean at commit time), spec 0009. a fixed (blank → 422); b fixed (structural check of `type`/`properties`/`items`/`required`; a full metaschema check is a declared gap, REQ-VAL-007, pending adding the `jsonschema` dependency); c fixed (`min_length=1`); d wont-fix by design (spec 0005 REQ-CLS-010, Article III); e fixed (no valid key → 401 whatever the body). Contract: a, b and c were 200 and are now 422; `docs/openapi.json` regenerated.

**Verifier (2026-11-14 ~05:10 UTC):** a 422, b 422 (names `output_schema.type`), c 422, e 401. **Passed.**

**Origin decision (air-orchestrator-service session, its user's decision, 2026-11-14), recorded in `0cc6158` (docs only) on `feature/model-gateway-migration`:** d stays **design, unchanged** (spec 0005 REQ-CLS-010, Article III: `/v1/ready` is gated on the gateway only). Also recorded: no `jsonschema` dependency, so the full metaschema check for b stays a declared gap (REQ-VAL-007). **Closed.**
