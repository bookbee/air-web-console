# Handover notes

**As of 2026-11-17.** For the team taking the AIR platform forward. This page says
what is finished, what is not, what was verified and how, and what to do before the
platform serves real customers. It links to the detail instead of repeating it.

The verification behind this page is in
[`bugs/SIT-2026-11-16-handover.md`](../../bugs/SIT-2026-11-16-handover.md).

## 1. Where the platform stands

**The platform works end to end on a developer machine.** A customer can ask about
their orders, get a policy answer with its source, and cancel an order through
propose and confirm, with tenant and customer isolation, input and output guardrails,
cost limits and provider failover in place. Every service has a tested API contract.

**It is not production-ready.** The gaps are known, recorded and listed in section 4.
The largest ones are structural: conversations and the search index live in process
memory, the only orders backend is sample data, and the deployment code, though it now
covers all five services, has run only on a local Kubernetes cluster.

| Repository | State | Biggest gap |
| --- | --- | --- |
| air-model-gateway | The most complete. Contract, tests (95% coverage), CI and a deploy pipeline | One working cloud provider on the day of handover |
| air-orchestrator-service | Feature-complete for the customer channel: guardrails, classification, search with citations, lookups, confirmed changes, streaming. Spec-driven, 168 requirements traced to tests | Sessions in memory: one replica only, lost on restart. Rate limit not enforced. No grounding check. Business channel has no data source |
| air-classifier-service | Four-tier ladder complete, with summary refresh and audit log | Its own quality gate is red on a clean checkout. The Tier 1 model file isn't shipped, so most traffic reaches paid tiers. No CI |
| air-tools-gateway | v1 complete against its contract: three order capabilities, propose and execute, idempotency, Redis-backed for replicas, CI | The only backend is fixture data. No real business system is connected |
| air-rag-service | First phase: search contract, tenant isolation, relevance floor, sample corpus | Index in memory, rebuilt at every start. No way to ingest real documents. No CI |
| air-infrastructure-service | Local stack and credential broker work. Holds the deployment code for all five services (`gke/`): two Helm charts, values for UAT and prod, Terraform, a runbook, and a kind rehearsal that passes | Nothing applied to a real GCP project yet. Its local shared configuration lists services under old names; four services aren't scraped for metrics |
| air-web-console | Test console for all five services, contract suites, bug tracker, platform docs | Local tool. No browser tests. No containerised way to run its checks |

## 2. What was verified on 2026-11-16

| Check | Result |
| --- | --- |
| Each repository's own gate | 6 of 7 green. The classifier's is red for recorded reasons (CL-010) |
| All seven Docker images build | Yes |
| The whole stack starts from the documented steps | Yes, after one correction (IN-001) |
| Console contract suites | tools 33/33, RAG 56/56, gateway 43/45 (two need an Anthropic account with credit) |
| Services' own live checks | RAG 29/29 queries; orchestrator against the tools gateway 2/2; classifier and infrastructure `make doctor` green |
| End-to-end conversations | 13 of 13 scenarios in [04-testing.md](04-testing.md) §5 |
| All five services on a local Kubernetes cluster (2026-11-17) | Deployed with the production charts and values; gateway 17/17 and its NetworkPolicy; the four other services and one cited conversation turn pass |
| New findings | 7 reports on 2026-11-16, 1 more on 2026-11-17 (TG-004): 1 Medium and 2 Low for the infrastructure service, 1 Medium and 1 Low for the classifier (the Low one fixed), 1 Medium and 1 Low for the orchestrator; plus documentation corrections |

Not verified: anything on GCP; load; the console's UI in a browser; a second cloud
provider's failover (only Gemini had credit).

## 3. Reading order for the new team

1. [01-overview.md](01-overview.md) and [02-concepts.md](02-concepts.md): 40 minutes.
2. [03-local-setup.md](03-local-setup.md): get it running, then walk the 13
   conversations in [04-testing.md](04-testing.md) §5 in the console. An hour.
3. The README of your service, then its `CLAUDE.md` / `AGENTS.md`.
4. For the orchestrator, [`docs/specs/README.md`](../../../air-orchestrator-service/docs/specs/README.md):
   that repository specifies behaviour before building it, and `make trace` enforces it.
5. DevOps: the [GCP deployment guide](../../../air-infrastructure-service/docs/02-gcp-deployment.md),
   then the [GKE runbook](../../../air-infrastructure-service/docs/03-gke-runbook.md), then
   `make gke-validate` and `make kind-up kind-test` in air-infrastructure-service.
6. The open bug list in the [SIT report](../../bugs/SIT-2026-11-16-handover.md).

Each language group has a natural first repository:

| You know | Start in | Why |
| --- | --- | --- |
| Node / TypeScript | air-tools-gateway, then this console | Fastify service with a strict contract; the console is Next.js |
| Go | air-infrastructure-service | Small, standard-library Go; then the deployment work |
| Python | air-rag-service (smallest), then air-classifier-service, then air-orchestrator-service | Same FastAPI layout in all three, in increasing size |
| Java | air-tools-gateway's contract and the orchestrator's specs | No Java code exists. The contracts are OpenAPI, so a Java client or a real `OrdersBackend` integration is the likely first task |
| GCP DevOps | air-infrastructure-service `gke/` | The charts, Terraform and scripts for all five services, with a laptop rehearsal |

## 4. What stands between this build and production

Ordered by how much each one blocks. "Recorded in" is where the detail lives.

### Must be resolved before real customers

| # | Item | Owner | Recorded in |
| --- | --- | --- | --- |
| 1 | **Durable sessions for the orchestrator.** In-memory sessions force one replica and lose every conversation on a deploy | Orchestrator | Spec 0002 (draft, two open questions), spec 0015 |
| 2 | **A real orders backend for the tools gateway.** Today it serves sample data from its image | Tools gateway + whoever owns the order system | `air-tools-gateway/docs/enhancements.md` |
| 3 | **A persistent index and document ingestion for the RAG service.** Today documents are files mounted at start-up | RAG | `air-rag-service/docs/00-plan.md` |
| 4 | **A first real deployment.** Charts, values and Terraform exist for all five services and pass on a local cluster; none has been applied to GCP. Still to build: an ingress for the orchestrator, model servers in the cluster, deploy pipelines for four services | DevOps | [GKE runbook](../../../air-infrastructure-service/docs/03-gke-runbook.md) §9 |
| 5 | **Rate limiting on the orchestrator.** Configured, never enforced | Orchestrator, or the ingress | `bugs/orchestrator/OR-017-*.md` |
| 6 | **A second cloud provider that works.** With one provider there is no failover | Whoever holds the accounts | SIT report |
| 7 | **Unsourced claims in answers.** The model can still state a policy figure or a procedure that no source supports; the grounding check is a declared gap | Orchestrator | `bugs/orchestrator/OR-016-*.md`, `OR-022`, spec 0011 `REQ-RAG-014` |
| 8 | **Production credentials.** Every salt, key and token in every `.env.example` is a published development value | DevOps | [GCP guide](../../../air-infrastructure-service/docs/02-gcp-deployment.md) §7 |
| 9 | **The classifier's Tier 1 model.** Without it nearly every classification is a paid call | Classifier | Classifier README, "Tier-1 model" |

### Should be resolved soon

| # | Item | Recorded in |
| --- | --- | --- |
| 10 | The classifier's gate is red on a clean checkout, and `make test` makes paid calls | `bugs/classifier/CL-010-*.md` |
| 11 | CI for the orchestrator, classifier, RAG service and infrastructure service | Each README |
| 12 | Citation markers can't be matched to the citation list | `bugs/orchestrator/OR-021-*.md` |
| 13 | The infrastructure service starts broken without a `.env` | `bugs/infrastructure/IN-001-*.md` |
| 14 | Metrics are scraped for one service of five locally; no dashboards or alerts are defined anywhere | `bugs/infrastructure/IN-002-*.md`; gateway `docs/08-observability.md` (proposal) |
| 15 | The gateway's invalid-schema error is a retryable 502 and leaks provider account state | `bugs/model-gateway/MG-016-*.md` |
| 16 | Prompts have been reviewed on Gemini only | `air-orchestrator-service/docs/03-uat-open-items.md` |
| 17 | The tools gateway can't skip host-name verification for Redis TLS, which Memorystore needs | `bugs/tools-gateway/TG-004-*.md` |

Every other open report is Low severity and listed in the
[SIT report](../../bugs/SIT-2026-11-16-handover.md).

## 5. Recommendations

These are suggestions from the handover review, for the team to weigh. None has been
implemented, and none changes the design.

**For adoption (first two weeks)**

1. **Make every gate green and put it in CI.** A red gate teaches people to ignore
   the gate. Fix CL-010 first, then add a workflow that runs `make check` to the four
   repositories without one. The gateway's and the tools gateway's workflows are the
   templates.
2. **Add an automated end-to-end smoke test.** The 13 conversations in
   [04-testing.md](04-testing.md) are walked by hand. The console's live-test harness
   (`tests/live/`) already drives the tools, RAG and gateway suites through the BFF;
   an orchestrator suite in the same style would turn the checklist into
   `make orchestrator-check`.
3. **Give the console a containerised check** (`make docker-check`, as
   air-tools-gateway has), so its gate and live suites run on a machine without
   Node.js.
4. **Fix the fresh-checkout traps**: IN-001 (infrastructure needs `make env`), the
   orchestrator's `make up` reporting "could not probe" (OR-022a), and
   `.env.example` in the orchestrator still naming the brand `AIR` (OR-006).
5. **Decide one name for the infrastructure repository in prose.** Code paths now
   say `air-infrastructure-service`; comments and design documents still say
   `air-infra`. Either is fine; both is confusing. The wire label `air-infra` in the
   orchestrator's `/v1/ready` should stay.

**For production readiness**

6. **Do durable sessions next** (item 1). It removes the single-replica constraint,
   which in turn unblocks rolling deploys, autoscaling and any availability target.
   Redis is already in the platform and the session store already has an interface
   for it.
7. **Apply the deployment code to a real UAT project early.** The shared chart and the
   gateway's chart are proven on a local cluster only. Terraform, the Secret Manager
   add-on, Memorystore's TLS and Autopilot admission can only be proven there. Later,
   let each service read a secrets directory itself, as the gateway does, so the
   shared chart can drop its start-up wrapper.
8. **Define dashboards and alerts before go-live.** Every service already exports
   metrics. At minimum: readiness, error rate and latency per service; the gateway's
   spend against each daily budget; the classifier's share of paid tiers; the
   orchestrator's refusal and degraded rates.
9. **Add distributed tracing.** `X-Request-ID` already follows a request through
   every service's logs. OpenTelemetry exists in the classifier (off by default) and
   is planned in the orchestrator; switching it on across all five would make a slow
   turn diagnosable without reading five logs.
10. **Run a load test and a failure drill.** Nothing measures the orchestrator or the
    gateway under load. Before go-live: sustained load on `/v1/chat`, and each
    dependency stopped in turn while turns are running, to confirm the degraded
    behaviour the design promises.
11. **Put secret rotation on a calendar.** Service tokens, API keys and customer-token
    keys are static. The gateway's bootstrap script can rotate tokens; the other
    services need a documented procedure.
12. **Hold a security review of the model-facing surface** before launch: prompt
    injection through retrieved documents, the customer-token trust chain, and what
    reaches logs. The building blocks are in place and tested; an independent look is
    still worth having.

**For the product**

13. **Decide what the business channel is for.** `/v1/query` is a model call with a
    persona and nothing behind it (OR-022d). Either give it a data source or leave it
    out of the first release.
14. **Decide on the grounding check** (item 7). The alternatives are an output check
    that verifies claims against sources, or accepting the risk with prompt rules
    alone. It is the difference between "the assistant cites sources" and "the
    assistant only says what its sources say".

## 6. A suggested handover session

About three hours, in this order, with the platform already running on the
presenter's machine.

| Time | Topic | Material |
| --- | --- | --- |
| 20 min | What AIR is, the seven repositories, one message's journey | [01-overview.md](01-overview.md), diagrams in §3 to §5 |
| 20 min | The AI vocabulary, for backend engineers | [02-concepts.md](02-concepts.md) |
| 30 min | Live demo in the console: a lookup, a cited policy answer, a cancellation with confirm, a refused injection, another customer's order | [04-testing.md](04-testing.md) §5; the gateway demo script in this README's notes |
| 20 min | Each service in five minutes: what it owns, its one key design rule | Each README's first screen |
| 30 min | Hands-on: everyone runs `make platform-doctor` and `make platform-up` | [03-local-setup.md](03-local-setup.md) |
| 20 min | How it is tested, and how to file a bug | [04-testing.md](04-testing.md), [`bugs/README.md`](../../bugs/README.md) |
| 25 min | DevOps: what GCP needs, the charts and Terraform, a live `make kind-up kind-test` | [GCP guide](../../../air-infrastructure-service/docs/02-gcp-deployment.md), [GKE runbook](../../../air-infrastructure-service/docs/03-gke-runbook.md) |
| 15 min | What is open, and who takes what | Section 4 of this page |

## 7. Working agreements already in the repositories

Worth keeping, because the code relies on them:

- **`make check` before a change is done**, in the repository you changed.
- **A contract change regenerates its OpenAPI file** (`make openapi`) in the same
  change. Tests fail when the committed file drifts.
- **The tools gateway's contract is owned by the orchestrator**
  (`docs/specs/0012-tools-gateway/contract.openapi.yaml`); the gateway holds a
  byte-identical copy and a test that fails when they differ.
- **Orchestrator behaviour changes start with a spec change.** Every requirement names
  the test that proves it.
- **A prompt change is a new prompt version**, reviewed with `make prompt-review`.
- **No provider SDK and no provider key outside air-model-gateway.**
- **No model call inside air-tools-gateway.**
- **Every bug found becomes a check**: a console scenario, a test in the owning
  repository, or both.
- **`.env` files are never committed.** `.env.example` is, and documents every key.
- **Three repositories, three responsibilities.** A service's repository owns its code,
  `Dockerfile`, image and settings. air-infrastructure-service owns deployment: charts,
  values per environment, Terraform. air-web-console owns local onboarding: cloning,
  `.env` wiring, the platform docs and the bug reports. A change to a service's start
  command, port or settings has a second half in one of the other two.
