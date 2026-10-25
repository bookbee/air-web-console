# air-model-gateway: release readiness and handover

What has to be true before the gateway goes to QA or to another team, how to
check each point, and where things stand. The gateway's own
[`docs/05-handover.md`](../../../air-model-gateway/docs/05-handover.md)
covers its spec, internal gates and risks. This page adds the consumer's
view (does the running gateway keep its contract?) and the release
decision.

## Current verdict (2026-10-25): not ready to hand over yet

The code is in good shape. The handover isn't, for three reasons:

1. **Nothing is frozen.** All the fixes are uncommitted: 52 files on top of
   `29fc4aa`, edited in a parallel session while this one was testing. A
   handover needs a commit or tag that every check below ran against.
2. **One High bug is open:** [MG-009](MG-009-invalid-provider-key-silent.md).
   A revoked or invalid provider key is invisible to readiness, metrics and
   alerts, and moves traffic to a pricier provider.
3. **Owner decisions aren't made yet:** `daily_budget_usd` and
   `provider_quotas` are unset for every service in `policy.staging.yaml`
   and `policy.prod.yaml`. The mechanisms work, but no project has a spend
   limit. This is required before more than one project shares the
   gateway.

Should fix before the release: [MG-010](MG-010-no-build-identity.md), so
QA evidence names the build it tested.

## Why every pass found something

- **The target moved.** The gateway was being edited during testing, and
  an old process kept answering on the same port. The "34/38" run in the
  console was against code older than the files on disk. A result means
  something only when you know exactly which build produced it.
- **Fixes create new edges.** MG-009's pin symptom came from the MG-005
  fix ("every provider 400 is the caller's fault").
- **A review samples; it doesn't prove.** Assurance comes from gates that
  run against a frozen build and keep failing until a defect is fixed. Each
  finding here became one: a console scenario, a gateway test, or both.

## The handover gate

Run it in order, against one tagged commit. Any step that fails stops the
handover.

| # | Step | Command / action | Pass when | Owner |
|---|---|---|---|---|
| 1 | Freeze | Commit, tag e.g. `v0.2.0-rc1`; one session per repo from here on | `git status` clean in air-model-gateway | Gateway team |
| 2 | Static gates | `make verify` (gateway) | "verify: all gates passed" | Gateway team |
| 3 | Runtime gates | `make kind-up kind-test`, `make integration-up integration-test` (gateway) | All checks pass | Gateway team |
| 4 | Contract, local | Gateway on the tag (one process; `lsof -nP -iTCP:8083 -sTCP:LISTEN`), console `make dev`, then `make gateway-check` | Contract all pass, and every known gap passes or is consciously open | Console / QA |
| 5 | Contract, QA env | `make gateway-check GATEWAY_TARGET=qa` | Same, with shared-environment expectations | QA |
| 6 | Bugs | Index in [README.md](README.md) | No open High. Each Medium is `verified` or `wont-fix` with a reason | Both |
| 7 | Decisions | Budgets and quotas set in staging/prod policy | Values committed | Gateway owner |
| 8 | Record evidence | Commit `last-run-*.txt`; update the gateway's `05-handover.md` §5 date; set fixed bugs to `verified`; move their scenarios out of *known gaps* | Done in the same commit as the tag notes | Both |

Steps 4–5 are this console's gate. It sends 42 scenarios through the BFF
(34 contract scenarios and 8 known gaps), including a handful of small paid calls to
Gemini and Anthropic (a few cents per run), which need those keys.

## Where things stand

| Step | State | Evidence |
|---|---|---|
| 1 Freeze | ❌ 52 files uncommitted | `git status` in air-model-gateway |
| 2 Static gates | ✅ on the uncommitted tree | `make verify`: 324 tests, 94.9% coverage, OpenAPI matches, `pip-audit` clean, manifests valid |
| 3 Runtime gates | ⚠️ not re-run on the fixed tree | Last recorded in `05-handover.md` §5, before these fixes |
| 4 Contract, local | ✅ on the uncommitted tree | [last-run-local.txt](last-run-local.txt): contract 34/34, known gaps 8/8 now passing |
| 5 Contract, QA | ⚠️ not run | The QA target in this console's `.env.local` is commented out (placeholder URL) |
| 6 Bugs | ❌ MG-009 (High), MG-010 (Medium) open; MG-001–008 fixed, uncommitted | [README.md](README.md) |
| 7 Decisions | ❌ budgets and quotas unset | `deploy/policy/policy.{staging,prod}.yaml` |
| 8 Evidence | Pending steps 1–7 | |

## Enterprise readiness, by area

What this review checked beyond the bug list, and what's still worth doing.
Items marked *(suggest)* aren't bugs. They're the owner's call.

**Correctness and contract.** The wire contract is generated from code and
diff-checked (`test_openapi.py`), and the docs are checked against code
(`test_repo_consistency.py`). Validation, rejections, failover, cache,
streaming, size limits and error shapes are all exercised live by the
console scenarios. The gap is MG-009's error classification.

**Multi-project onboarding.** Adding a project is configuration only:
1. a token in `security.service_tokens`;
2. a `services:` entry in each `policy.<env>.yaml`;
3. optional `overrides` in `routing.yaml`;
4. a row in `test_gateway_config.py`'s `CONSUMERS` table;
5. deployment steps in `03-deployment.md` §4.4.

Policy fails closed outside local, a token without a policy entry gets 403,
and the cache is keyed per service. *(suggest)* Put those five steps in one
"onboard a project" checklist in the gateway docs, and make a budget a
required field for any paid class grant outside local.

**Ops readiness.** Structured JSON logs carry `severity` and `request_id`.
Audit lines hold metadata only, with no prompt text. Metrics and a
first-alerts list are in `03-deployment.md`. Readiness reflects provider
configuration. Gaps:
- no per-rung failure metric and key validity isn't checked (MG-009);
- no build identity (MG-010);
- *(suggest)* SLOs (availability and p95 latency per route and class) with
  failure drills (provider key revoked, budget hit, Redis down) added to
  the integration suite.

**Security.**
- Per-service tokens, rotatable (several per service).
- Secrets come only from Secret Manager files.
- Auth now runs before the body is parsed (MG-007).
- Bounded `X-Request-ID`; size caps (MG-005).
- `pip-audit` clean; NetworkPolicy in place.
- The console's leak of the upstream `X-API-Key` to the browser (listed as
  open in `05-handover.md` §7) is fixed in console `48a19fe`, so the gateway
  team can drop that row.

*(suggest)* Provider error bodies now reach the caller (up to 500 chars,
MG-006). Fine for internal callers, but check them once for echoed input
before any external consumer.

## Handing over to another team or tool

Everything needed is in plain files, so it doesn't depend on any one coding
harness, agent memory or spec-driven tool:

| Need | Where |
|---|---|
| What the gateway must do, and why | air-model-gateway `docs/00-plan.md`, `01-hld.md`, `02-lld.md`, `openapi.json` |
| How to change it safely | air-model-gateway `AGENTS.md`, `docs/05-handover.md` §3 |
| What a consumer sees, as executable checks | This repo: `src/components/llm/data.ts` (scenarios), `make gateway-check` |
| What's broken, fixed or verified | This folder: one file per bug, index in [README.md](README.md), process in [../README.md](../README.md) |
| Whether a build is releasable | This page's gate |

Two rules keep it that way:
- **Anything learned goes into a file and a check**, never only a chat or
  a session.
- **One session per repository at a time.** Parallel edits are what made
  results here hard to trust. Cross-repo work is handed over through these
  reports.
