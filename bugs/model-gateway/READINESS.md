# air-model-gateway: release readiness and handover

What has to be true before the gateway goes to QA or to another team, how to
check each point, and where things stand. The gateway's own
[`docs/05-handover.md`](../../../air-model-gateway/docs/05-handover.md)
covers its spec, internal gates and risks. This page adds the consumer's
view (does the running gateway keep its contract?) and the release
decision.

## Current verdict (2026-10-26): ready for QA, not yet for handover

The code is in good shape: every step that can run locally passes on the
committed build `4dd28b7`, and MG-001 to MG-010 are closed. What's left is
the tag, the QA run, two new reports and sign-offs:

1. **Committed, not tagged.** `4dd28b7` holds every tracked change and
   reports a clean revision (`4dd28b76537b`). The only files outside git are
   two proposal documents (`docs/07-ai-firewall.md`, `docs/08-observability.md`)
   that change no behaviour. Tag it (e.g. `v0.2.0-rc1`) and re-run steps 3–4
   on the tag.
2. **QA environment not run** (step 5): the QA target is commented out in
   this console's `.env.local`.
3. **Owner sign-off on numbers** (step 7): budgets and provider quotas are
   now set and required, but they're starting values. The owner confirms
   them against each provider account's limits.
4. **Bugs** (step 6): MG-001 to MG-010 are all `verified`; MG-006 to
   MG-010 by their manual repros against `4dd28b7` on 2026-10-26, MG-009 on a
   second instance with an invalid Gemini key. Those runs were made by the
   gateway session at the owner's request; QA may repeat them on the tag.
   New since then, found while preparing the console demo:
   [MG-011](MG-011-gemini-thinking-eats-max-tokens.md) (Medium, fixed in the
   gateway's uncommitted tree, passing live; verify on the tag:
   Gemini answers cut off at the guide's recommended `max_tokens`) and
   [MG-012](MG-012-failover-path-not-reported.md) (Low: `wont-fix` for this
   release, planned in the gateway's `00-plan.md` §6).
   The gate needs MG-011 `verified`, or `wont-fix` with a reason.

Not a gateway blocker, but it blocks the platform as a whole:
air-orchestrator-service still calls the removed `/v1/inference`, so its
integration check fails until it migrates (gateway
`docs/06-consumer-migration.md`).

## Why every pass found something

- **The target moved.** The gateway was being edited during testing, and
  an old process kept answering on the same port. The "34/38" run in the
  console was against code older than the files on disk. A result means
  something only when you know exactly which build produced it.
- **Fixes create new edges.** MG-009's pin symptom came from the MG-005
  fix ("every provider 400 is the caller's fault"). That's why a fixed
  bug's scenario stays in the suite as a regression guard.
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

Steps 4–5 are this console's gate. It sends 42 scenarios through the BFF,
including a handful of small paid calls to Gemini and Anthropic (a few cents
per run), which need those keys. All 42 are contract scenarios now: the 8
that tracked MG-001 to MG-005 moved out of *known gaps* when those bugs were
verified, and none is open. A new open bug adds a known-gap row again.

## Where things stand

| Step | State | Evidence |
|---|---|---|
| 1 Freeze | ⚠️ committed as `4dd28b7` (clean revision; two untracked proposal docs only); not tagged | `git status` in air-model-gateway |
| 2 Static gates | ✅ on `4dd28b7`, 2026-10-26 | `make verify`: 343 tests, 95.14% coverage, all gates passed |
| 3 Runtime gates | ✅ gateway checks on `6357b7a992e6-dirty` (same `src/` as `4dd28b7`; re-run on the tag) | kind (prod policy): all pass. Integration (staging): 18/18 gateway checks; the orchestrator consumer check fails, since it still calls `/v1/inference` (consumer migration) |
| 4 Contract, local | ✅ on `4dd28b76537b`, 2026-10-26 00:16: one listener, started after the last commit, no reload | [last-run-local.txt](last-run-local.txt): contract 42/42, no known gaps open; the header records the revision |
| 5 Contract, QA | ⚠️ not run | The QA target in this console's `.env.local` is commented out (placeholder URL) |
| 6 Bugs | ⚠️ MG-011 (Medium) fixed, uncommitted, passing live; MG-012 (Low) `wont-fix`, planned; MG-001–010 all `verified` (MG-006–010 on `4dd28b7`) | [README.md](README.md) |
| 7 Decisions | ⚠️ starting values set and now required (the gateway won't start outside local if a paid service has no budget); the owner confirms the numbers | `deploy/policy/policy.{staging,prod}.yaml` |
| 8 Evidence | Pending steps 1–7 | |

## Enterprise readiness, by area

What this review checked beyond the bug list, and what's still worth doing.
Items marked *(suggest)* aren't bugs. They're the owner's call.

**Correctness and contract.** The wire contract is generated from code and
diff-checked (`test_openapi.py`), and the docs are checked against code
(`test_repo_consistency.py`). Validation, rejections, failover, cache,
streaming, size limits and error shapes are all exercised live by the
console scenarios. Provider errors are now classified as the caller's
fault (`provider_rejected`) or the gateway's own (an auth or account
failure, MG-009).

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
configuration, and a provider whose key keeps being refused (MG-009).
`air_model_gateway_rung_failures_total{provider,model,reason}` counts every
failed rung. Every build reports its `revision` in health, capabilities and
`build_info` (MG-010). Still open:
- *(suggest)* SLOs (availability and p95 latency per route and class) with
  failure drills (provider key revoked, budget hit, Redis down) added to
  the integration suite. The gateway's `docs/08-observability.md` now
  proposes SLOs, an alert catalogue, dashboards and tracing (not yet
  confirmed or built).

**Security.**
- Per-service tokens, rotatable (several per service).
- Secrets come only from Secret Manager files.
- Auth now runs before the body is parsed (MG-007).
- Bounded `X-Request-ID`; size caps (MG-005).
- `pip-audit` clean; NetworkPolicy in place.
- The console's leak of the upstream `X-API-Key` to the browser is fixed in
  console `48a19fe`; the gateway's `05-handover.md` no longer lists it.

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
