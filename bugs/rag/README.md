# air-rag-service: bug reports

Found while adding air-rag-service to the AIR Web Console for its individual
SIT (2026-11-14). Process, statuses and severities are in [../README.md](../README.md).

| | |
|---|---|
| **Build tested** | air-rag-service @ `f5f2882`, container `air-rag-service:local` on `:8087` (unseeded), plus a seeded copy of the same image on `:8097` (`SEED_DIR=/app/sit/corpus`, 29 chunks) and an unseeded copy on `:8098` pointed at a dead gateway |
| **Dependencies** | air-model-gateway @ `1fa80de` on `:8083` (embed model reachable) |
| **Last run** | [last-run-local.txt](last-run-local.txt): contract 50/50 against `:8087` itself, re-created seeded (integrated pass 2); operator rows 3/3 against the dead-gateway copy; 6 known gaps open |
| **Reference** | `../air-rag-service/scripts/sit_check.py` against the seeded copy: 29/29 |

## Index

| ID | Severity | Status | Title |
|---|---|---|---|
| [RG-001](RG-001-malformed-json-422-before-auth.md) | Low | open | Malformed JSON is a 422 naming field "9", and is answered before the key is checked |
| [RG-002](RG-002-lax-top-k-coercion.md) | Low | open | `top_k` accepts `true`, `"5"` and `5.0` (lax coercion), though the contract types it integer |
| [RG-003](RG-003-blank-query-unbounded-user-id.md) | Medium | open | A whitespace-only query is embedded and answered with match-level scores; `user_id` has no length cap |
| [RG-004](RG-004-no-relevance-floor.md) | Medium | open | No relevance floor: nonsense queries return a full `top_k` at genuine-looking scores |

## Test setup

```bash
export RAG=http://127.0.0.1:8087 KEY=airr_local_dev_key
make rag-check                         # console serving; every row, report in last-run-local.txt
RAG_OPERATOR=gateway-down make rag-check   # after stopping air-model-gateway: the operator rows only
RAG_SCOPED_KEY=… make rag-check        # adds the 403 insufficient-scope row (needs a retrieval:read-only key)
```

`KEY` is the development key from air-rag-service's `.env.example` (tenant
`brightcart`, scopes `retrieval:read` + `admin:read`). SIT rows need the index
seeded: start the service with `make run-sit`, or `make up` with
`AIR_RAG_SERVICE_SEED_DIR=/app/sit/corpus`.

## What was checked and works

Health with no key; readiness names the gateway and warns loudly on an empty
index; capabilities names the key's tenant and needs a key (401 without, or
with a wrong one); every error is problem+json under
`https://air.dev/problems/air-rag-service/`, 404 and 405 included;
`X-Request-ID` echoed in the header and the problem's `request_id`, and an
unsafe one (`a b<script>`, 5,000 chars) replaced with a fresh `req_…` id;
`extra="forbid"`: a `tenant` in the body is a 422 naming `tenant`, as is any
unknown field; `top_k` 0/51, empty/missing/4,001-char query are 422s with
`errors[]`; a 4,000-char query is accepted; non-object bodies (array, string,
none, `text/plain`) are 422s. All 29 SIT queries pass with the expected
document in its window, including the Hindi query and the other-tenant
wording; no citation from another tenant, `draft-no-tenant` or an archived
document appeared in any response, and `returns-refunds-2024` isn't cited at
all for "current return window" (top_k 10). With the gateway unreachable:
health 200, ready 503 `ready: false` with the gateway `reachable: false`,
retrieve 503 `dependency-unavailable`.

Not covered: the 403 `insufficient-scope` path (only one dev key ships; the row
runs when `RAG_SCOPED_KEY` is set); a stopped *real* gateway (simulated with a
dead base URL instead, so the classifier and orchestrator weren't disturbed).
