# Platform SIT — 2026-11-16, handover pass

A second pass on 2026-11-16, after the fixes from [SIT-2026-11-16.md](SIT-2026-11-16.md)
were committed. Its purpose was different from the earlier passes: to check that a
new engineer can set the platform up from the documentation alone, to re-run every
automated check on clean checkouts, and to leave one list of everything that is open
for the team taking the project over.

All seven repositories were tested, including air-infrastructure-service for the
first time (new prefix `IN`).

## Result

The platform builds, starts and works end to end from the documented steps, with one
correction to those steps (IN-001). No regression was found against the earlier pass.
Seven new reports were written: three Medium, four Low.

| Check | Result |
|---|---|
| Docker images | All seven build (`make up` in each repository; `make image` here) |
| air-orchestrator-service `make check` | pass: 572 passed, 3 skipped; 168 requirements traced, 22 declared gaps |
| air-model-gateway `make check` | pass: 362 passed, coverage 95.19% |
| air-rag-service `make check` | pass: 78 passed |
| air-tools-gateway `make check` | pass: 244 passed, 21 skipped (Redis suites) |
| air-infrastructure-service `make check` | pass |
| air-web-console `make check` | pass: 202 passed |
| air-classifier-service `make check` | **fail** at the format step; tests alone: 1,105 passed, 5 failed, plus 3 `live` failures (CL-010) |
| `make tools-check` | 33/33, skipped 0, known gaps 0 (fresh fixtures) |
| `make rag-check` | 56/56, known gaps 0 |
| `make gateway-check` | 43/45: `cloud-prefer-anthropic`, `anthropic-temperature` (Anthropic: "credit balance is too low"; unchanged) |
| air-rag-service `make sit-check` | 29/29 |
| air-orchestrator-service `make sit-tools` | 2 passed, 1 skipped |
| air-infrastructure-service `make doctor` | green after `make env` (IN-001) |
| air-classifier-service `make doctor` | green after CL-011's fix |
| End-to-end conversations through the console's BFF | 13/13 (the list in [`docs/platform/04-testing.md`](../docs/platform/04-testing.md) §5) |

## Builds and environment

| Repository | Commit | Working tree after this pass |
|---|---|---|
| air-model-gateway | `85afed6` | README only |
| air-classifier-service | `8e62f6c` | README; `INFRA_DIR` and the Redis container name in `Makefile`, `scripts/doctor.sh`, compose comment (CL-011) |
| air-rag-service | `4b54604` | README only |
| air-tools-gateway | `223d612` | README only |
| air-orchestrator-service | `31838b0` | README; the infrastructure folder name in `Makefile` messages and a compose comment (CL-011) |
| air-infrastructure-service | `ecea900` | README, `docs/01-setup.md`, `docs/overview.md`, `CLAUDE.md`, new `docs/02-gcp-deployment.md` |
| air-web-console | `2c72e85` | README, new `docs/platform/`, `scripts/platform.sh`, `Makefile` (`platform-*` targets), these reports, the three `last-run-local.txt` files |

**No service's behaviour was changed in this pass.** The only non-documentation edits
are path and name corrections in two Makefiles and one diagnosis script, and the new
helper script in this repository. Nothing is committed or pushed.

Host: macOS (Intel, no GPU), Docker Desktop 29.9.3, Ollama native with `llama3.2:3b`
and `nomic-embed-text`, Python 3.12.16, Go 1.27.4, Node 22.23.5 (not on `PATH`: under
`~/.local/node-22/bin`). Cloud providers at the gateway: Gemini answering, Anthropic
configured but out of credit, OpenAI not configured.

**Environment notes:**

1. Docker Desktop was stopped at the start of the pass. It was started, and every
   stack was brought up with `make up` in dependency order. **The containers are
   still running**, and the console's dev server is on `:3000`.
2. air-infrastructure-service had no `.env`. `make env` created one from
   `.env.example` (IN-001). No other `.env` was touched.
3. The console's `node_modules` was empty; `npm ci` installed it.
4. Order data: the suites and the conversations cancelled fixture orders 55120 and
   70011. Restart air-tools-gateway to reset them.

## New in this pass

| ID | Severity | Status | Finding |
|---|---|---|---|
| [IN-001](infrastructure/IN-001-starts-broken-without-env.md) | Medium | open | Started without a `.env`, the infrastructure broker has no tokens and looks for the stores on `localhost`: every call is a 401 and `/v1/ready` says `ready` with every store `down`. The compose file says no `.env` is needed. This is the cause of environment finding 5 in the earlier report |
| [CL-010](classifier/CL-010-make-check-red-on-clean-checkout.md) | Medium | open | The classifier's `make check` is red on a clean checkout (format; five golden cases without the Tier 1 model), and `make test` runs the `live` tests, which are documented as opt-in and make paid calls |
| [OR-021](orchestrator/OR-021-citation-markers-do-not-match-citation-list.md) | Medium | open | The answer cites `[2]` while `citations` holds one unnumbered entry: a client can't match markers to sources |
| [IN-002](infrastructure/IN-002-registry-and-scrape-config-stale.md) | Low | open | The broker's tokens and grants and the Prometheus scrape file name services by their old names; four of five services aren't scraped; Grafana and the console both want port 3000 |
| [IN-003](infrastructure/IN-003-minor-items.md) | Low | open | `pgbouncer:latest` in a file that says tags are pinned; the broker hands out the superuser; a wrong method is a 404; admin routes open to every token locally |
| [OR-022](orchestrator/OR-022-minor-items.md) | Low | open | `make up` says "could not probe" on a healthy start; a stored date called "today"; an invented "send a bank statement" step; `/v1/query` has no data source |
| [CL-011](classifier/CL-011-doctor-and-make-point-at-old-infra-repo.md) | Low | fixed (working tree) · verified | `make doctor` reported a healthy Redis as down, and `make up` pointed at `../air-infra`, which doesn't exist. Path corrections only |

## Everything that is open, across all services

One list for planning. Severity as recorded in each report.

| ID | Severity | Service | Finding |
|---|---|---|---|
| [OR-017](orchestrator/OR-017-rate-limit-never-enforced.md) | Medium | orchestrator | The configured rate limit is never enforced |
| [OR-021](orchestrator/OR-021-citation-markers-do-not-match-citation-list.md) | Medium | orchestrator | Citation markers can't be matched to the citation list |
| [OR-016](orchestrator/OR-016-unsourced-policy-figures.md) (a, c) | Medium | orchestrator | Unsourced policy claims get through; needs the grounding check (`REQ-RAG-014`) |
| [OR-010](orchestrator/OR-010-proposing-turn-drops-rest-of-message.md) | Medium | orchestrator | A proposing turn answers only the proposal (design-level) |
| [MG-016](model-gateway/MG-016-invalid-schema-retryable-502.md) | Medium | model gateway | A caller's invalid `json_schema` is a retryable 502 and the error prints other providers' account state |
| [CL-010](classifier/CL-010-make-check-red-on-clean-checkout.md) | Medium | classifier | `make check` red on a clean checkout; `make test` runs paid tests |
| [CL-004](classifier/CL-004-t2-ready-while-gateway-local-down.md) | Medium | classifier | Tier 2 reports ready while the gateway's local provider is down (design-level, agreed) |
| [IN-001](infrastructure/IN-001-starts-broken-without-env.md) | Medium | infrastructure | Starts broken without a `.env` |
| [OR-020](orchestrator/OR-020-minor-items.md), [OR-022](orchestrator/OR-022-minor-items.md) | Low | orchestrator | Minor items |
| [OR-006](orchestrator/OR-006-brand-name-defaults-to-air.md) | Low | orchestrator | `.env.example` still names the brand `AIR` (design question open) |
| [MG-017](model-gateway/MG-017-minor-items.md) | Low | model gateway | Minor items |
| [CL-008](classifier/CL-008-minor-input-items.md) | Low | classifier | Minor input items |
| [TG-003](tools-gateway/TG-003-minor-items.md) | Low | tools gateway | Minor items |
| [IN-002](infrastructure/IN-002-registry-and-scrape-config-stale.md), [IN-003](infrastructure/IN-003-minor-items.md) | Low | infrastructure | Stale shared configuration; minor items |

Closed or decided and not listed: MG-001 to MG-015, CL-001 to CL-003, CL-005 to
CL-007, CL-009, CL-011, OR-001 to OR-005, OR-007 to OR-009, OR-011 to OR-015, OR-018,
OR-019, RG-001 to RG-004, TG-001, TG-002. Their status is in each service's index.

The structural gaps that are not bugs (in-memory sessions and index, fixture-only
orders backend, no deployment code for four services) are in
[`docs/platform/05-handover.md`](../docs/platform/05-handover.md) §4.

## Observations with no report

For the owning teams to weigh:

- **air-web-console:** its checks need Node.js on the host and there is no
  containerised alternative; the earlier pass worked around the same thing by hand.
  A `make docker-check` target, as air-tools-gateway has, would close it. The README
  described three backend services; corrected.
- **air-model-gateway:** `.env.example` still issues a token for `air-tools`
  (`air-tools-dev`), a service that makes no model call by rule. Its consistency test
  rejects any external link in a document (`[text](https://…)` is read as a relative
  path), which is stricter than the test's name suggests.
- **air-rag-service:** its README still called the service a "Phase-0 skeleton"
  called by `air-platform` and `air-tools`; corrected. The index and ingestion gaps
  it describes are real and unchanged.
- **air-orchestrator-service:** its README's status paragraph said that downstream
  fan-out was not built, two phases behind the code; corrected.
  `usage.cache_hit: true` appears on a turn whose `cache` stage is `skipped` (the
  gateway's cache answered), as noted in the earlier pass.
- **Classifier inside a turn:** in the direct classification made in this pass,
  Tier 2 (the local model) failed and Tier 3 answered. Inside conversation turns the
  classification cost between $0.0007 and $0.0031, in several turns more than the
  planning and the answer together. That is consistent with CL-007's fix stepping
  over a local tier that can't finish on hardware with no GPU, and it is the reason
  the Tier 1 model file matters.
- **All repositories:** documents and comments use the earlier names (`air-infra`,
  `air-llm`, `air-platform`, `air-tools`, `air-client`). The entry documentation now
  has a table of them; paths that a person would type were corrected; prose in the
  design documents was left alone.

## What held

Unchanged from the earlier pass and re-confirmed here:

- **Isolation.** Another customer's order answers "couldn't find" exactly like a
  missing one. A session is a 404 to another customer.
- **Mutations.** Proposing changes nothing. "Yes, I confirm, go ahead" in prose
  creates a new proposal and executes nothing. A structured confirm executes once; a
  replayed confirm executes nothing; the order is `cancelled` at the tools gateway
  exactly once.
- **Guardrails.** An injection attempt is refused in the input guardrail at zero
  cost, with every later stage skipped. A request for a human returns an escalation
  reference with no model call.
- **Auth and validation.** A missing key is 401, the wrong channel's key is 403, an
  unknown body field is 422, on the orchestrator. The infrastructure broker answers
  401 without a key and 404 `resource_not_found` for an unknown resource.
- **Streaming.** One streamed turn carried every expected kind of event:
  `turn.start`, nine `stage` events, `route`, `citation`, three `answer.delta`,
  `answer`, `usage` and `turn.end`. (Kinds were counted; their order was not
  re-checked in this pass.)
- **Multi-worker sessions (OR-012).** With `APP__WORKERS=2` in the local `.env`, five
  consecutive turns on one session by its owner never returned a 404: the one-worker
  rule (spec 0015) holds.

## Not covered

- Anything on GCP, or on Kubernetes at all (`kind`, Helm and Terraform aren't
  installed on this host, so the gateway's `make verify`, `kind-test` and
  `gke-validate` were not run).
- `make up-observability` (port 3000 was in use by the console).
- Load, and a stopped dependency while turns are running.
- The console's UI in a browser.
- `pending_approval`, `proposal_expired`, and the 502/504 upstream paths of the tools
  gateway, as before.
- The classifier's `make test-eval-live` and `scripts/demo-tiers.sh`, and the
  orchestrator's `make prompt-review` and `make planner-eval` (paid, and unchanged
  code).

## Addendum, 2026-11-17: deployment code centralised and rehearsed

After this pass the Helm chart and Terraform were moved out of air-model-gateway into
air-infrastructure-service (`gke/`), a shared chart and values for UAT and production
were added for the other four services, and every core repository got the same
`make image-push`, `make deploy` and `make deploy-smoke` targets. Verified on a local
`kind` cluster with the production values of all five services:

| Check | Result |
|---|---|
| `make gke-validate` (air-infrastructure-service) | pass: both charts lint; 15 renders (5 services × uat, prod, kind) pass Kubernetes 1.33 and CRD schemas; Terraform `fmt` and `validate` for both environments; shellcheck |
| `make kind-up` | all five services running: gateway 2 pods, classifier 2, tools gateway 2, RAG 1, orchestrator 1; every pod on a read-only root filesystem |
| `make kind-test`, gateway | 17/17, and an unlisted namespace can't connect |
| `make kind-test`, the four services | all pass: classifier ready on every tier and classifies; RAG indexed 29 chunks and returns citations; tools gateway ready with its Redis store and refuses a read key on execute; orchestrator has all three optional services configured, and a conversation turn is `ok`, not degraded, with a cited answer |
| Redis over TLS with AUTH and CA verification | gateway, classifier (`air:clf:kind:` keys seen) and tools gateway all connect |
| Gates after the move | gateway 362 passed and its design diagrams regenerated; the other repositories unchanged in behaviour |

Found while doing it:

| ID | Severity | Finding |
|---|---|---|
| [TG-004](tools-gateway/TG-004-redis-tls-hostname-check-cannot-be-disabled.md) | Medium | The tools gateway has no setting for a Redis CA or for host-name verification, which Memorystore (dialled by IP) needs |
| [OR-022](orchestrator/OR-022-minor-items.md) e | Low | The orchestrator's credential-broker probe has no off switch, so `/v1/ready` always shows `air-infra` unreachable in a deployed environment |
| (no report: fixed in the move) | | The gateway's old `make gke-validate` piped `helm template` into `kubeconform` without checking the render, so a failed render passed as "0 resources, all valid". It showed up with Helm 3, whose default Kubernetes version is below the chart's minimum. The new `validate.sh` checks each render before validating it and passes `--kube-version` |

Still not done: anything on a real GCP project.

## Next steps

1. **Review and commit.** Seven repositories have uncommitted changes (table above),
   almost all documentation.
2. **CL-010 first**, so every gate is green before the new team starts.
3. **IN-001**: one line in a compose file or a Makefile.
4. **OR-021**: decide between renumbering and a `marker` field, then amend spec 0011.
5. The production-readiness list in
   [`docs/platform/05-handover.md`](../docs/platform/05-handover.md) §4 and §5.
