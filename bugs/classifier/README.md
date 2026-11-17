# air-classifier-service: bug reports

Found during the platform SIT on 2026-11-14 (see [../SIT-2026-11-14.md](../SIT-2026-11-14.md)),
after air-classifier-service moved its T2/T3 model calls to air-model-gateway.
Process, statuses and severities are in [../README.md](../README.md).

| | |
|---|---|
| **Build tested** | `air-classifier-service` @ `d151e5c`, container `air-classifier-service:local` on `:8082`, recreated 2026-11-13 17:18 UTC with `MODEL_GATEWAY__TOKEN` set |
| **Dependencies** | air-model-gateway @ `1fa80de` on `:8083` (Ollama unreachable, Gemini key invalid, Anthropic OK); Redis from air-infrastructure-service |
| **Fixes** | `8f258fc` on branch `fix/sit-2026-11-14` (on top of `d151e5c`), not pushed; container rebuilt 2026-11-14, verified ~05:10 UTC |
| **Tier 1 backend** | lexicon fallback: `./models` is empty, `onnx_loaded: false` |

## Index

| ID | Severity | Status | Title |
|---|---|---|---|
| [CL-001](CL-001-cost-ceiling-not-enforced.md) | High | verified | `max_cost_usd` exceeded up to 4×: the ceiling is only checked after a paid call |
| [CL-002](CL-002-zero-cost-ceiling-503.md) | Medium | verified | `max_cost_usd: 0` answers 503 instead of the free T1 verdict |
| [CL-003](CL-003-deterministic-503-marked-retryable.md) | Medium | verified | A "no verdict" caused by the caller's own options is a retryable 503 |
| [CL-004](CL-004-t2-ready-while-gateway-local-down.md) | Medium | open (design-level, agreed) | T2 reports ready/available while the gateway's `local` provider is down |
| [CL-005](CL-005-lexicon-t1-overconfident.md) | Medium | verified | Lexicon-only T1 answers sarcasm with 0.92 confidence, not marked degraded |
| [CL-006](CL-006-minor-items.md) | Low | verified (a–d, h, i) · e–g fixed, tests only | Minor: 403 vs 401, auth order, PII kinds, summary trust, cached usage, `degraded` semantics |
| [CL-007](CL-007-cascade-spends-budget-on-slow-t2.md) | Medium | fixed (working tree) · **verified** 2026-11-16 | The ladder spends the whole budget on a T2 that can't finish, so T3 never runs |
| [CL-008](CL-008-minor-input-items.md) | Low | open | Minor: whitespace text classified, Aadhaar as phone / PAN missed, oversize body 400, metadata echoed |
| [CL-009](CL-009-slow-arbiter-discards-primary-verdict.md) | Medium | fixed (working tree) · **verified** 2026-11-16 | A slow second-opinion model takes T3's first answer down with it: 8 s, then the lexicon's verdict or a 503 |
| [CL-010](CL-010-make-check-red-on-clean-checkout.md) | Medium | open | `make check` is red on a clean checkout (format, five golden cases without the Tier 1 model), and `make test` runs the paid `live` tests |
| [CL-011](CL-011-doctor-and-make-point-at-old-infra-repo.md) | Low | fixed (working tree, 2026-11-16) · verified | `make doctor` reports Redis down when it is up, and `make up` points at `../air-infra`, which doesn't exist |

## Test setup

```bash
export CLF=http://127.0.0.1:8082 KEY=airc_local_dev_key
```

`KEY` is the development key baked into the classifier's `docker-compose.yml`.
Append a fresh nonce to a repro's `text` on each run, or the verdict cache
answers instead of the ladder.

## What was checked and works

Auth required on every `/v1` route except health/ready; validation (empty,
over-length, wrong type, unknown fields, rating bounds, tier ordering,
latency floor, batch 1–100 with per-item field paths, summary schema); 404/405
are problem+json; rate limit 660/min with `Retry-After`; request-id
propagation from the orchestrator; PII redaction per kind (email, phone,
card, national id, IP) and redaction keyed separately in the cache;
prompt-injection text doesn't move the verdict or routing; Spanish/Hindi
classified via T3; the summary merge is correct and honours `occurred_at`; the
latency budget returns best-so-far with `degraded: true`; the T3 arbiter fires
below the floor.
